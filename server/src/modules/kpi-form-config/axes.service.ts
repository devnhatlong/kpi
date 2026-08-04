import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';
import { buildPaginatedResponse } from '@/common/utils/pagination.util';
import { CreateAxisDto } from './dto/create-axis.dto';
import { UpdateAxisDto } from './dto/update-axis.dto';
import { Axis, AxisDocument } from './schemas/axis.schema';
import { WorkContent, WorkContentDocument } from './schemas/work-content.schema';

@Injectable()
export class AxesService {
  constructor(
    @InjectModel(Axis.name)
    private readonly axisModel: Model<AxisDocument>,
    @InjectModel(WorkContent.name)
    private readonly workContentModel: Model<WorkContentDocument>,
  ) {}

  async create(dto: CreateAxisDto) {
    const code = dto.code?.trim()
      ? dto.code.trim().toUpperCase()
      : await this.nextCode();
    await this.ensureUniqueCode(code);

    const data = await this.axisModel.create({
      code,
      name: dto.name.trim(),
      description: dto.description?.trim() ?? '',
      sortOrder: dto.sortOrder ?? 0,
      isActive: dto.isActive ?? true,
    });

    return { message: 'Tạo trục thành công.', data };
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
      const data = await this.axisModel.find(filter).sort(sort);
      return buildPaginatedResponse(data, data.length, 1, data.length || 1);
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.axisModel.find(filter).sort(sort).skip(skip).limit(limit),
      this.axisModel.countDocuments(filter),
    ]);

    return buildPaginatedResponse(data, total, page, limit);
  }

  async findOne(id: string) {
    return this.requireById(id);
  }

  async update(id: string, dto: UpdateAxisDto) {
    const item = await this.requireById(id);
    if (dto.code !== undefined && dto.code.trim().toUpperCase() !== item.code) {
      throw new BadRequestException(
        'Không được đổi mã trục sau khi đã tạo — tránh lệch map dữ liệu.',
      );
    }
    if (dto.name !== undefined) item.name = dto.name.trim();
    if (dto.description !== undefined) item.description = dto.description.trim();
    if (dto.sortOrder !== undefined) item.sortOrder = dto.sortOrder;
    if (dto.isActive !== undefined) item.isActive = dto.isActive;
    await item.save();
    return { message: 'Cập nhật trục thành công.', data: item };
  }

  async remove(id: string) {
    const item = await this.requireById(id);
    if (await this.workContentModel.exists({ axisId: item._id })) {
      throw new BadRequestException(
        'Không thể xoá trục đang được dùng ở nội dung công việc.',
      );
    }
    await item.deleteOne();
    return { message: 'Xoá trục thành công.' };
  }

  private async requireById(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Không tìm thấy trục.');
    }
    const item = await this.axisModel.findById(id);
    if (!item) throw new NotFoundException('Không tìm thấy trục.');
    return item;
  }

  private async ensureUniqueCode(code: string) {
    if (await this.axisModel.exists({ code })) {
      throw new BadRequestException('Mã trục đã tồn tại.');
    }
  }

  private async nextCode(): Promise<string> {
    const prefix = 'TRUC';
    const pattern = new RegExp(`^${prefix}-(\\d+)$`, 'i');
    const docs = await this.axisModel
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
