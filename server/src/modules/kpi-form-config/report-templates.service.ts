import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';
import { buildPaginatedResponse } from '@/common/utils/pagination.util';
import { CreateReportTemplateDto } from './dto/create-report-template.dto';
import { UpdateReportTemplateDto } from './dto/update-report-template.dto';
import {
  ReportTemplate,
  ReportTemplateDocument,
} from './schemas/report-template.schema';
import { Axis, AxisDocument } from './schemas/axis.schema';

const AXIS_POPULATE = { path: 'axisIds', select: 'code name maxScore' };

@Injectable()
export class ReportTemplatesService {
  constructor(
    @InjectModel(ReportTemplate.name)
    private readonly reportTemplateModel: Model<ReportTemplateDocument>,
    @InjectModel(Axis.name)
    private readonly axisModel: Model<AxisDocument>,
  ) {}

  async create(dto: CreateReportTemplateDto) {
    const code = dto.code?.trim()
      ? dto.code.trim().toUpperCase()
      : await this.nextCode();
    await this.ensureUniqueCode(code);

    const data = await this.reportTemplateModel.create({
      code,
      name: dto.name.trim(),
      description: dto.description?.trim() ?? '',
      year: this.resolveYear(dto.year),
      includeCriteria: dto.includeCriteria ?? true,
      axisIds: await this.resolveAxisIds(dto.axisIds ?? []),
      // Mẫu mới luôn ở trạng thái đang cấu hình - áp dụng là một hành động
      // riêng, có kiểm tra riêng (xem `apply`).
      status: 'draft',
      appliedAt: null,
      sortOrder: dto.sortOrder ?? 0,
      isActive: dto.isActive ?? true,
    });

    await data.populate(AXIS_POPULATE);
    return { message: 'Tạo mẫu báo cáo thành công.', data };
  }

  async findAll(query: PaginationQueryDto = new PaginationQueryDto()) {
    const filter: Record<string, unknown> = {};
    if (query.q) {
      const escaped = query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'i');
      filter.$or = [{ code: regex }, { name: regex }, { description: regex }];
    }

    const sort = { year: -1 as const, sortOrder: 1 as const, name: 1 as const };

    if (query.all) {
      const data = await this.reportTemplateModel
        .find(filter)
        .sort(sort)
        .populate(AXIS_POPULATE);
      return buildPaginatedResponse(data, data.length, 1, data.length || 1);
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.reportTemplateModel
        .find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .populate(AXIS_POPULATE),
      this.reportTemplateModel.countDocuments(filter),
    ]);

    return buildPaginatedResponse(data, total, page, limit);
  }

  /**
   * Mẫu đang áp dụng của một năm - dùng khi dựng báo cáo thật.
   *
   * Chưa áp dụng bản nào thì trả bản nháp mới nhất của năm để màn cấu hình mở
   * lại đúng chỗ đang dở, thay vì mở ra một mẫu trắng.
   *
   * Trả kèm `year` đã chốt: năm đó do SERVER quyết khi client không khai, và
   * client không được suy lại từ giờ máy nó - máy trạm sang năm sớm/muộn là cả
   * màn cấu hình trỏ nhầm năm.
   */
  async findCurrent(year?: number) {
    const target = this.resolveYear(year);
    const applied = await this.reportTemplateModel
      .findOne({ year: target, status: 'applied', isActive: true })
      .populate(AXIS_POPULATE);
    if (applied) return { data: { year: target, template: applied } };

    const draft = await this.reportTemplateModel
      .findOne({ year: target, isActive: true })
      .sort({ updatedAt: -1 })
      .populate(AXIS_POPULATE);
    return { data: { year: target, template: draft } };
  }

  async findOne(id: string) {
    const item = await this.requireById(id);
    await item.populate(AXIS_POPULATE);
    return item;
  }

  async update(id: string, dto: UpdateReportTemplateDto) {
    const item = await this.requireById(id);

    if (dto.code !== undefined && dto.code.trim().toUpperCase() !== item.code) {
      throw new BadRequestException(
        'Không được đổi mã mẫu báo cáo sau khi đã tạo - tránh lệch map dữ liệu.',
      );
    }
    if (dto.name !== undefined) item.name = dto.name.trim();
    if (dto.description !== undefined) item.description = dto.description.trim();
    if (dto.year !== undefined) item.year = this.resolveYear(dto.year);
    if (dto.includeCriteria !== undefined) {
      item.includeCriteria = dto.includeCriteria;
    }
    if (dto.axisIds !== undefined) {
      item.axisIds = await this.resolveAxisIds(dto.axisIds);
    }
    if (dto.sortOrder !== undefined) item.sortOrder = dto.sortOrder;
    if (dto.isActive !== undefined) item.isActive = dto.isActive;

    /*
      Sửa thành phần của mẫu ĐANG áp dụng thì đưa nó về nháp: bảng chấm của cả
      năm đang bám theo bản này, đổi khối nội dung mà vẫn để nguyên nhãn "đã áp
      dụng" thì không ai biết bản đang chấm khác bản đang xem. Áp dụng lại là
      một cú bấm tường minh.
    */
    if (
      item.status === 'applied' &&
      (dto.axisIds !== undefined ||
        dto.includeCriteria !== undefined ||
        dto.year !== undefined)
    ) {
      item.status = 'draft';
      item.appliedAt = null;
    }

    await item.save();
    await item.populate(AXIS_POPULATE);
    return { message: 'Cập nhật mẫu báo cáo thành công.', data: item };
  }

  /**
   * Áp dụng mẫu cho năm của nó - các bản khác cùng năm lùi về nháp.
   *
   * Mốc thời gian lấy từ server chứ không nhận của client: máy trạm lệch giờ là
   * mốc áp dụng của cả năm lệch theo.
   */
  async apply(id: string) {
    const item = await this.requireById(id);

    if (!item.isActive) {
      throw new BadRequestException(
        'Mẫu đã ngừng hoạt động - bật lại trước khi áp dụng.',
      );
    }
    if (!item.axisIds.length && !item.includeCriteria) {
      throw new BadRequestException(
        'Mẫu chưa có khối nội dung nào - chọn ít nhất một trục hoặc bật bảng tiêu chí chung.',
      );
    }

    // Một năm chỉ một mẫu đang áp dụng, nếu không thì lúc chấm không biết lấy
    // bản nào. Hạ bản cũ ngay trong lượt này thay vì bắt admin đi tắt tay.
    await this.reportTemplateModel.updateMany(
      { year: item.year, status: 'applied', _id: { $ne: item._id } },
      { $set: { status: 'draft', appliedAt: null } },
    );

    item.status = 'applied';
    item.appliedAt = new Date();
    await item.save();
    await item.populate(AXIS_POPULATE);

    return {
      message: `Đã áp dụng mẫu báo cáo cho năm ${item.year}.`,
      data: item,
    };
  }

  async remove(id: string) {
    const item = await this.requireById(id);
    if (item.status === 'applied') {
      throw new BadRequestException(
        'Không xoá được mẫu đang áp dụng - áp dụng mẫu khác cho năm này trước.',
      );
    }
    await item.deleteOne();
    return { message: 'Xoá mẫu báo cáo thành công.' };
  }

  /** Bỏ trống thì lấy năm của SERVER, không nhận năm suy từ giờ máy client. */
  private resolveYear(year?: number): number {
    if (year === undefined || year === null) return new Date().getFullYear();
    if (!Number.isInteger(year) || year < 2000 || year > 2200) {
      throw new BadRequestException('Năm áp dụng không hợp lệ.');
    }
    return year;
  }

  private async requireById(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Không tìm thấy mẫu báo cáo.');
    }
    const item = await this.reportTemplateModel.findById(id);
    if (!item) throw new NotFoundException('Không tìm thấy mẫu báo cáo.');
    return item;
  }

  private async ensureUniqueCode(code: string) {
    if (await this.reportTemplateModel.exists({ code })) {
      throw new BadRequestException('Mã mẫu báo cáo đã tồn tại.');
    }
  }

  /**
   * Lọc trùng nhưng GIỮ NGUYÊN thứ tự client gửi - thứ tự này là thứ tự khối
   * B.1, B.2… trên báo cáo, sort lại là đổi luôn cách đánh số của mẫu.
   */
  private async resolveAxisIds(axisIds: string[]) {
    const unique = [...new Set(axisIds.map((value) => value.trim()))].filter(
      Boolean,
    );
    if (!unique.length) return [];

    const objectIds = unique.map((value) => new Types.ObjectId(value));
    const found = await this.axisModel.countDocuments({
      _id: { $in: objectIds },
    });
    if (found !== objectIds.length) {
      throw new BadRequestException('Có trục không tồn tại.');
    }
    return objectIds;
  }

  private async nextCode(): Promise<string> {
    const prefix = 'MBC';
    const pattern = new RegExp(`^${prefix}-(\\d+)$`, 'i');
    const docs = await this.reportTemplateModel
      .find({ code: { $regex: `^${prefix}-\\d+$`, $options: 'i' } })
      .select('code')
      .lean();
    let max = 0;
    for (const doc of docs) {
      const match = pattern.exec(doc.code);
      if (!match) continue;
      const n = Number(match[1]);
      if (!Number.isNaN(n)) max = Math.max(max, n);
    }
    return `${prefix}-${String(max + 1).padStart(4, '0')}`;
  }
}
