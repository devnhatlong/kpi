import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';
import { buildPaginatedResponse } from '@/common/utils/pagination.util';
import { CreateWorkContentDto } from './dto/create-work-content.dto';
import { UpdateWorkContentDto } from './dto/update-work-content.dto';
import {
  WorkContent,
  WorkContentDocument,
} from './schemas/work-content.schema';
import { ContentGroup, ContentGroupDocument } from './schemas/content-group.schema';
import { Axis, AxisDocument } from './schemas/axis.schema';

@Injectable()
export class WorkContentsService {
  constructor(
    @InjectModel(WorkContent.name)
    private readonly workContentModel: Model<WorkContentDocument>,
    @InjectModel(ContentGroup.name)
    private readonly contentGroupModel: Model<ContentGroupDocument>,
    @InjectModel(Axis.name)
    private readonly axisModel: Model<AxisDocument>,
  ) {}

  async create(dto: CreateWorkContentDto) {
    const code = dto.code?.trim()
      ? dto.code.trim().toUpperCase()
      : await this.nextCode();
    await this.ensureUniqueCode(code);
    const contentGroup = await this.requireContentGroup(dto.contentGroupId);
    const axis = await this.requireAxis(dto.axisId);

    const data = await this.workContentModel.create({
      code,
      name: dto.name.trim(),
      description: dto.description?.trim() ?? '',
      contentGroupId: contentGroup._id,
      axisId: axis._id,
      sortOrder: dto.sortOrder ?? 0,
      isActive: dto.isActive ?? true,
    });
    await data.populate([
      { path: 'contentGroupId', select: 'code name' },
      { path: 'axisId', select: 'code name' },
    ]);

    return { message: 'Tạo nội dung công việc thành công.', data };
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
      const data = await this.workContentModel
        .find(filter)
        .sort(sort)
        .populate('contentGroupId', 'code name')
        .populate('axisId', 'code name');
      return buildPaginatedResponse(data, data.length, 1, data.length || 1);
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.workContentModel
        .find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .populate('contentGroupId', 'code name')
        .populate('axisId', 'code name'),
      this.workContentModel.countDocuments(filter),
    ]);

    return buildPaginatedResponse(data, total, page, limit);
  }

  async findOne(id: string) {
    return this.requireById(id, true);
  }

  async update(id: string, dto: UpdateWorkContentDto) {
    const item = await this.requireById(id);

    if (dto.code !== undefined && dto.code.trim().toUpperCase() !== item.code) {
      throw new BadRequestException(
        'Không được đổi mã nội dung sau khi đã tạo — tránh lệch map dữ liệu.',
      );
    }
    if (dto.name !== undefined) item.name = dto.name.trim();
    if (dto.description !== undefined) {
      item.description = dto.description.trim();
    }
    if (dto.contentGroupId !== undefined) {
      const contentGroup = await this.requireContentGroup(dto.contentGroupId);
      item.contentGroupId = contentGroup._id;
    }
    if (dto.axisId !== undefined) {
      const axis = await this.requireAxis(dto.axisId);
      item.axisId = axis._id;
    }
    if (dto.sortOrder !== undefined) item.sortOrder = dto.sortOrder;
    if (dto.isActive !== undefined) item.isActive = dto.isActive;

    await item.save();
    await item.populate([
      { path: 'contentGroupId', select: 'code name' },
      { path: 'axisId', select: 'code name' },
    ]);
    return { message: 'Cập nhật nội dung công việc thành công.', data: item };
  }

  async remove(id: string) {
    const item = await this.requireById(id);
    await item.deleteOne();
    return { message: 'Xoá nội dung công việc thành công.' };
  }

  private async requireById(id: string, withPopulate = false) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Không tìm thấy nội dung công việc.');
    }
    const item = withPopulate
      ? await this.workContentModel
          .findById(id)
          .populate('contentGroupId', 'code name')
          .populate('axisId', 'code name')
      : await this.workContentModel.findById(id);
    if (!item) {
      throw new NotFoundException('Không tìm thấy nội dung công việc.');
    }
    return item;
  }

  private async requireContentGroup(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Nhóm nội dung không hợp lệ.');
    }
    const item = await this.contentGroupModel.findById(id);
    if (!item) {
      throw new BadRequestException('Nhóm nội dung không tồn tại.');
    }
    return item;
  }

  private async requireAxis(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Trục không hợp lệ.');
    }
    const item = await this.axisModel.findById(id);
    if (!item) {
      throw new BadRequestException('Trục không tồn tại.');
    }
    return item;
  }

  private async ensureUniqueCode(code: string, excludeId?: string) {
    const filter: Record<string, unknown> = { code };
    if (excludeId) filter._id = { $ne: excludeId };
    if (await this.workContentModel.exists(filter)) {
      throw new BadRequestException('Mã nội dung công việc đã tồn tại.');
    }
  }

  private async nextCode(): Promise<string> {
    const prefix = 'ND';
    const pattern = new RegExp(`^${prefix}-(\\d+)$`, 'i');
    const docs = await this.workContentModel
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
