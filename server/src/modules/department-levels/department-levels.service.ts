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
  isMissionUnit: boolean;
}> = [
  { code: 'CAT', name: 'Công an tỉnh', rank: 1, isMissionUnit: true },
  // Khối chỉ để gom nhóm các phòng cho dễ nhìn/dễ tổng hợp, không phải đơn vị
  // thật nên không nhận nhiệm vụ - nhiệm vụ đi thẳng xuống phòng bên trong.
  { code: 'KHOI', name: 'Khối (gom nhóm)', rank: 2, isMissionUnit: false },
  { code: 'PHONG', name: 'Cấp phòng', rank: 3, isMissionUnit: true },
  { code: 'DOI', name: 'Cấp đội', rank: 4, isMissionUnit: true },
  { code: 'TO', name: 'Cấp tổ', rank: 5, isMissionUnit: true },
  { code: 'XA', name: 'Cấp xã', rank: 6, isMissionUnit: true },
  { code: 'PHUONG', name: 'Cấp phường', rank: 7, isMissionUnit: true },
  { code: 'DON', name: 'Cấp đồn', rank: 8, isMissionUnit: true },
  { code: 'DACKHU', name: 'Đặc khu', rank: 9, isMissionUnit: true },
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
      isMissionUnit: dto.isMissionUnit ?? false,
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
    if (dto.isMissionUnit !== undefined) {
      level.isMissionUnit = dto.isMissionUnit;
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
            isMissionUnit: item.isMissionUnit,
          },
          $set: {
            rank: item.rank,
          },
        },
        { upsert: true },
      );

      // Bản ghi tạo từ trước khi có cờ isMissionUnit thì điền mặc định.
      // Chỉ chạm khi field còn thiếu để không ghi đè lựa chọn của super admin.
      await this.departmentLevelModel.updateOne(
        { code: item.code, isMissionUnit: { $exists: false } },
        { $set: { isMissionUnit: item.isMissionUnit } },
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
