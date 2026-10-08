import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';
import { buildPaginatedResponse } from '@/common/utils/pagination.util';
import { CreateWorkContentSetDto } from './dto/create-work-content-set.dto';
import { UpdateWorkContentSetDto } from './dto/update-work-content-set.dto';
import {
  WorkContentSet,
  WorkContentSetDocument,
} from './schemas/work-content-set.schema';
import {
  WorkContent,
  WorkContentDocument,
} from './schemas/work-content.schema';
import {
  ReportTemplate,
  ReportTemplateDocument,
} from './schemas/report-template.schema';

@Injectable()
export class WorkContentSetsService {
  constructor(
    @InjectModel(WorkContentSet.name)
    private readonly setModel: Model<WorkContentSetDocument>,
    @InjectModel(WorkContent.name)
    private readonly workContentModel: Model<WorkContentDocument>,
    @InjectModel(ReportTemplate.name)
    private readonly reportTemplateModel: Model<ReportTemplateDocument>,
  ) {}

  async create(dto: CreateWorkContentSetDto) {
    const code = dto.code?.trim()
      ? dto.code.trim().toUpperCase()
      : await this.nextCode();
    if (await this.setModel.exists({ code })) {
      throw new BadRequestException('Mã bộ nội dung đã tồn tại.');
    }

    const data = await this.setModel.create({
      code,
      name: dto.name.trim(),
      description: dto.description?.trim() ?? '',
      sortOrder: dto.sortOrder ?? 0,
      isActive: dto.isActive ?? true,
    });

    return { message: 'Tạo bộ nội dung thành công.', data };
  }

  async findAll(query: PaginationQueryDto = new PaginationQueryDto()) {
    const filter: Record<string, unknown> = {};
    if (query.q) {
      const escaped = query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'i');
      filter.$or = [{ code: regex }, { name: regex }, { description: regex }];
    }

    const sort = { sortOrder: 1 as const, name: 1 as const };

    if (query.all) {
      const data = await this.setModel.find(filter).sort(sort);
      return buildPaginatedResponse(data, data.length, 1, data.length || 1);
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.setModel.find(filter).sort(sort).skip(skip).limit(limit),
      this.setModel.countDocuments(filter),
    ]);

    return buildPaginatedResponse(data, total, page, limit);
  }

  async findOne(id: string) {
    return this.requireById(id);
  }

  async update(id: string, dto: UpdateWorkContentSetDto) {
    const item = await this.requireById(id);
    if (dto.code !== undefined && dto.code.trim().toUpperCase() !== item.code) {
      throw new BadRequestException(
        'Không được đổi mã bộ nội dung sau khi đã tạo - tránh lệch map dữ liệu.',
      );
    }
    if (dto.name !== undefined) item.name = dto.name.trim();
    if (dto.description !== undefined) {
      item.description = dto.description.trim();
    }
    if (dto.sortOrder !== undefined) item.sortOrder = dto.sortOrder;
    if (dto.isActive !== undefined) item.isActive = dto.isActive;
    await item.save();
    return { message: 'Cập nhật bộ nội dung thành công.', data: item };
  }

  async remove(id: string) {
    const item = await this.requireById(id);
    // Mẫu đang áp dụng trỏ vào bộ thì chặn: gỡ ngầm là cả một khối đơn vị
    // bỗng thấy dropdown nội dung bày ra mọi phụ lục.
    const applied = await this.reportTemplateModel.findOne({
      workContentSetId: item._id,
      status: 'applied',
    });
    if (applied) {
      throw new BadRequestException(
        `Bộ đang dùng ở mẫu báo cáo "${applied.name}" đã áp dụng. Đổi bộ của mẫu đó trước.`,
      );
    }
    await this.reportTemplateModel.updateMany(
      { workContentSetId: item._id },
      { $set: { workContentSetId: null } },
    );
    await this.workContentModel.updateMany(
      { setIds: item._id },
      { $pull: { setIds: item._id } },
    );
    await item.deleteOne();
    return { message: 'Xoá bộ nội dung thành công.' };
  }

  private async requireById(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Không tìm thấy bộ nội dung.');
    }
    const item = await this.setModel.findById(id);
    if (!item) throw new NotFoundException('Không tìm thấy bộ nội dung.');
    return item;
  }

  private async nextCode(): Promise<string> {
    const prefix = 'BND';
    const pattern = new RegExp(`^${prefix}-(\\d+)$`, 'i');
    const docs = await this.setModel
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
