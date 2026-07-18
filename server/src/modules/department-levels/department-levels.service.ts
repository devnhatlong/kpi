import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { Helper } from '@/ultis/helpers';
import {
  DepartmentLevel,
  DepartmentLevelDocument,
} from './schemas/department-level.schema';
import { CreateDepartmentLevelDto } from './dto/create-department-level.dto';
import { UpdateDepartmentLevelDto } from './dto/update-department-level.dto';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';
import { buildPaginatedResponse } from '@/common/utils/pagination.util';

@Injectable()
export class DepartmentLevelsService {
  constructor(
    @InjectModel(DepartmentLevel.name)
    private readonly departmentLevelModel: Model<DepartmentLevelDocument>,
  ) {}

  async create(dto: CreateDepartmentLevelDto) {
    const code = dto.code.trim().toUpperCase();
    const exists = await this.departmentLevelModel.findOne({ code });
    if (exists) {
      throw new BadRequestException('Mã cấp đơn vị đã tồn tại.');
    }

    const level = await this.departmentLevelModel.create({
      code,
      name: dto.name.trim(),
      slug: Helper.slugify(dto.name),
      rank: dto.rank,
      isActive: dto.isActive ?? true,
    });

    return {
      message: 'Tạo cấp đơn vị thành công.',
      data: level,
    };
  }

  async findAll(query: PaginationQueryDto = new PaginationQueryDto()) {
    const filter: Record<string, unknown> = {};
    if (query.q) {
      const escaped = query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'i');
      filter.$or = [{ code: regex }, { name: regex }];
    }

    const sort = { rank: 1 as const, name: 1 as const };

    if (query.all) {
      const data = await this.departmentLevelModel.find(filter).sort(sort);
      return buildPaginatedResponse(data, data.length, 1, data.length || 1);
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.departmentLevelModel.find(filter).sort(sort).skip(skip).limit(limit),
      this.departmentLevelModel.countDocuments(filter),
    ]);

    return buildPaginatedResponse(data, total, page, limit);
  }

  async findOne(id: string) {
    return this.requireLevel(id);
  }

  async update(id: string, dto: UpdateDepartmentLevelDto) {
    const level = await this.requireLevel(id);

    if (dto.code !== undefined) {
      const code = dto.code.trim().toUpperCase();
      const exists = await this.departmentLevelModel.findOne({
        code,
        _id: { $ne: level._id },
      });
      if (exists) {
        throw new BadRequestException('Mã cấp đơn vị đã tồn tại.');
      }
      level.code = code;
    }

    if (dto.name !== undefined) {
      level.name = dto.name.trim();
      level.slug = Helper.slugify(dto.name);
    }
    if (dto.rank !== undefined) {
      level.rank = dto.rank;
    }
    if (dto.isActive !== undefined) {
      level.isActive = dto.isActive;
    }

    await level.save();

    return {
      message: 'Cập nhật cấp đơn vị thành công.',
      data: level,
    };
  }

  async remove(id: string) {
    const level = await this.requireLevel(id);
    await level.deleteOne();

    return { message: 'Xóa cấp đơn vị thành công.' };
  }

  private async requireLevel(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Không tìm thấy cấp đơn vị.');
    }

    const level = await this.departmentLevelModel.findById(id);
    if (!level) {
      throw new NotFoundException('Không tìm thấy cấp đơn vị.');
    }

    return level;
  }
}
