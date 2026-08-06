import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
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

const SYSTEM_DEPARTMENT_LEVELS: Array<{
  code: string;
  name: string;
  rank: number;
}> = [
  { code: 'CAT', name: 'Công an tỉnh', rank: 1 },
  { code: 'PHONG', name: 'Cấp phòng', rank: 2 },
  { code: 'DOI', name: 'Cấp đội', rank: 3 },
  { code: 'TO', name: 'Cấp tổ', rank: 4 },
  { code: 'XA', name: 'Cấp xã', rank: 5 },
  { code: 'PHUONG', name: 'Cấp phường', rank: 6 },
  { code: 'DON', name: 'Cấp đồn', rank: 7 },
  { code: 'DACKHU', name: 'Đặc khu', rank: 8 },
];

@Injectable()
export class DepartmentLevelsService implements OnModuleInit {
  constructor(
    @InjectModel(DepartmentLevel.name)
    private readonly departmentLevelModel: Model<DepartmentLevelDocument>,
  ) {}

  async onModuleInit() {
    await this.seedSystemLevels();
  }

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
      isKpiUnit: dto.isKpiUnit ?? false,
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
    if (dto.isKpiUnit !== undefined) {
      level.isKpiUnit = dto.isKpiUnit;
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

  async seedSystemLevels() {
    for (const item of SYSTEM_DEPARTMENT_LEVELS) {
      await this.departmentLevelModel.updateOne(
        { code: item.code },
        {
          $setOnInsert: {
            code: item.code,
            name: item.name,
            slug: Helper.slugify(item.name),
            isActive: true,
          },
          $set: {
            rank: item.rank,
          },
        },
        { upsert: true },
      );
    }
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
