import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { Permission } from '@/common/enums/permission.enum';
import {
  PermissionEntity,
  PermissionDocument,
} from './schemas/permission.schema';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';

const SYSTEM_PERMISSIONS: Array<{
  code: string;
  name: string;
  module: string;
  sortOrder: number;
  description?: string;
}> = [
  {
    code: Permission.USER_VIEW,
    name: 'Xem người dùng',
    module: 'user',
    sortOrder: 10,
    description: 'Xem danh sách và chi tiết người dùng',
  },
  {
    code: Permission.USER_MANAGE,
    name: 'Quản lý người dùng',
    module: 'user',
    sortOrder: 20,
    description: 'Tạo, cập nhật, vô hiệu hóa người dùng',
  },
  {
    code: Permission.DEPARTMENT_VIEW,
    name: 'Xem đơn vị',
    module: 'department',
    sortOrder: 30,
    description: 'Xem cây đơn vị và cấp đơn vị',
  },
  {
    code: Permission.DEPARTMENT_MANAGE,
    name: 'Quản lý đơn vị',
    module: 'department',
    sortOrder: 40,
    description: 'Tạo, cập nhật, xóa đơn vị / cấp đơn vị',
  },
  {
    code: Permission.ROLE_ASSIGN,
    name: 'Phân quyền vai trò',
    module: 'role',
    sortOrder: 50,
    description: 'Quản lý vai trò và gán quyền',
  },
  {
    code: Permission.KPI_MANAGE,
    name: 'Quản lý KPI',
    module: 'kpi',
    sortOrder: 60,
  },
  {
    code: Permission.KPI_ASSIGN,
    name: 'Giao KPI',
    module: 'kpi',
    sortOrder: 70,
  },
  {
    code: Permission.TASK_ASSIGN,
    name: 'Giao nhiệm vụ',
    module: 'task',
    sortOrder: 80,
  },
  {
    code: Permission.TASK_VIEW,
    name: 'Xem nhiệm vụ',
    module: 'task',
    sortOrder: 90,
  },
  {
    code: Permission.EVALUATION_SELF,
    name: 'Tự đánh giá',
    module: 'evaluation',
    sortOrder: 100,
  },
  {
    code: Permission.EVALUATION_APPROVE,
    name: 'Duyệt đánh giá',
    module: 'evaluation',
    sortOrder: 110,
  },
  {
    code: Permission.REPORT_VIEW,
    name: 'Xem báo cáo',
    module: 'report',
    sortOrder: 120,
  },
  {
    code: Permission.SYSTEM_CONFIG,
    name: 'Cấu hình hệ thống',
    module: 'system',
    sortOrder: 130,
    description: 'Cấu hình hệ thống và danh mục quyền',
  },
];

@Injectable()
export class PermissionsService implements OnModuleInit {
  constructor(
    @InjectModel(PermissionEntity.name)
    private readonly permissionModel: Model<PermissionDocument>,
  ) {}

  async onModuleInit() {
    await this.seedSystemPermissions();
  }

  async create(dto: CreatePermissionDto) {
    const code = this.normalizeCode(dto.code);
    const exists = await this.permissionModel.findOne({ code });
    if (exists) {
      throw new BadRequestException('Mã quyền đã tồn tại.');
    }

    const permission = await this.permissionModel.create({
      code,
      name: dto.name.trim(),
      description: dto.description?.trim(),
      module: this.normalizeModule(dto.module, code),
      sortOrder: dto.sortOrder ?? 0,
      isSystem: false,
      isActive: dto.isActive ?? true,
    });

    return {
      message: 'Tạo quyền thành công.',
      data: permission,
    };
  }

  async findAll() {
    return this.permissionModel.find().sort({ sortOrder: 1, module: 1, code: 1 });
  }

  async findActiveCodes(): Promise<string[]> {
    const rows = await this.permissionModel
      .find({ isActive: true })
      .select('code')
      .lean();
    return rows.map((row) => row.code);
  }

  async assertCodesExist(codes: string[]) {
    if (!codes.length) return;

    const unique = [...new Set(codes.map((c) => this.normalizeCode(c)))];
    const found = await this.permissionModel
      .find({ code: { $in: unique }, isActive: true })
      .select('code')
      .lean();

    const foundSet = new Set(found.map((row) => row.code));
    const missing = unique.filter((code) => !foundSet.has(code));
    if (missing.length) {
      throw new BadRequestException(
        `Quyền không hợp lệ hoặc đã ngừng: ${missing.join(', ')}`,
      );
    }
  }

  async findOne(id: string) {
    return this.requirePermission(id);
  }

  async update(id: string, dto: UpdatePermissionDto) {
    const permission = await this.requirePermission(id);

    if (dto.code !== undefined) {
      const code = this.normalizeCode(dto.code);
      const exists = await this.permissionModel.findOne({
        code,
        _id: { $ne: permission._id },
      });
      if (exists) {
        throw new BadRequestException('Mã quyền đã tồn tại.');
      }
      permission.code = code;
    }

    if (dto.name !== undefined) {
      permission.name = dto.name.trim();
    }
    if (dto.description !== undefined) {
      permission.description = dto.description.trim();
    }
    if (dto.module !== undefined) {
      permission.module = this.normalizeModule(dto.module, permission.code);
    }
    if (dto.sortOrder !== undefined) {
      permission.sortOrder = dto.sortOrder;
    }
    if (dto.isActive !== undefined) {
      permission.isActive = dto.isActive;
    }

    await permission.save();

    return {
      message: 'Cập nhật quyền thành công.',
      data: permission,
    };
  }

  async remove(id: string) {
    const permission = await this.requirePermission(id);
    if (permission.isSystem) {
      throw new BadRequestException('Không thể xóa quyền hệ thống.');
    }

    await permission.deleteOne();

    return { message: 'Xóa quyền thành công.' };
  }

  async seedSystemPermissions() {
    for (const item of SYSTEM_PERMISSIONS) {
      await this.permissionModel.updateOne(
        { code: item.code },
        {
          $setOnInsert: {
            code: item.code,
            name: item.name,
            description: item.description,
            module: item.module,
            isSystem: true,
            isActive: true,
          },
          $set: {
            sortOrder: item.sortOrder,
          },
        },
        { upsert: true },
      );
    }
  }

  private normalizeCode(code: string) {
    return code.trim().toLowerCase();
  }

  private normalizeModule(module: string | undefined, code: string) {
    const value = module?.trim().toLowerCase();
    if (value) return value;
    const [prefix] = code.split('.');
    return prefix || 'general';
  }

  private async requirePermission(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Không tìm thấy quyền.');
    }

    const permission = await this.permissionModel.findById(id);
    if (!permission) {
      throw new NotFoundException('Không tìm thấy quyền.');
    }

    return permission;
  }
}
