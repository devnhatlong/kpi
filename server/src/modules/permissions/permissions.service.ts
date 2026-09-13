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
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';
import { buildPaginatedResponse } from '@/common/utils/pagination.util';

const SYSTEM_PERMISSIONS: Array<{
  code: string;
  name: string;
  module: string;
  sortOrder: number;
  description?: string;
}> = [
  {
    code: Permission.USER_VIEW,
    name: 'Người dùng - xem',
    module: 'user',
    sortOrder: 10,
    description: 'Menu Tổ chức › Người dùng: xem danh sách và chi tiết',
  },
  {
    code: Permission.USER_MANAGE,
    name: 'Người dùng - thêm, sửa, xoá',
    module: 'user',
    sortOrder: 20,
    description: 'Thêm, sửa, xoá, import người dùng',
  },
  {
    code: Permission.DEPARTMENT_VIEW,
    name: 'Đơn vị & Cấp đơn vị - xem',
    module: 'department',
    sortOrder: 30,
    description: 'Menu Tổ chức › Đơn vị, Cấp đơn vị: xem cây đơn vị',
  },
  {
    code: Permission.DEPARTMENT_MANAGE,
    name: 'Đơn vị & Cấp đơn vị - thêm, sửa, xoá',
    module: 'department',
    sortOrder: 40,
    description: 'Thêm, sửa, xoá đơn vị / cấp đơn vị',
  },
  {
    code: Permission.ROLE_ASSIGN,
    name: 'Vai trò & Quyền',
    module: 'role',
    sortOrder: 50,
    description: 'Menu Tổ chức › Vai trò, Quyền: quản lý vai trò và gán quyền',
  },
  {
    code: Permission.MISSION_MANAGE,
    name: 'Cấu hình form nhiệm vụ & Danh mục',
    module: 'mission',
    sortOrder: 60,
    description:
      'Menu Cấu hình form nhiệm vụ (mẫu báo cáo, nội dung, nhiệm vụ, nhóm điểm, điểm cộng trừ, luồng trình) và Danh mục',
  },
  {
    code: Permission.TASK_ASSIGN,
    name: 'Giao nhiệm vụ xuống',
    module: 'task',
    sortOrder: 80,
    description: 'Menu Giao nhiệm vụ xuống: giao xuống đơn vị / cán bộ',
  },
  {
    code: Permission.TASK_VIEW,
    name: 'Nhiệm vụ cấp trên giao',
    module: 'task',
    sortOrder: 90,
    description: 'Menu Nhiệm vụ cấp trên giao: xem chỉ tiêu được giao',
  },
  {
    code: Permission.EVALUATION_SELF,
    name: 'Nhiệm vụ cá nhân',
    module: 'evaluation',
    sortOrder: 100,
    description: 'Menu Nhiệm vụ cá nhân: tự khai và tự chấm',
  },
  {
    code: Permission.EVALUATION_APPROVE,
    name: 'Theo dõi & duyệt nhiệm vụ',
    module: 'evaluation',
    sortOrder: 110,
    description: 'Menu Theo dõi & duyệt nhiệm vụ: duyệt bản cấp dưới',
  },
  {
    code: Permission.TEAM_REPORT_ENTRY,
    name: 'Báo cáo ngày & Tạo báo cáo tổng hợp (đội)',
    module: 'team_report',
    sortOrder: 115,
    description:
      'Menu Báo cáo ngày (bảng nhiệm vụ, phân loại, tiêu chí A) và Báo cáo tổng hợp › Tạo báo cáo',
  },
  {
    code: Permission.TEAM_REPORT_REVIEW,
    name: 'Duyệt báo cáo tổng hợp & Tạo báo cáo của phòng',
    module: 'team_report',
    sortOrder: 120,
    description: 'Menu Báo cáo tổng hợp › Duyệt báo cáo, Tạo báo cáo của phòng',
  },
  {
    code: Permission.ADJUSTMENT_ENTRY,
    name: 'Điểm cộng, trừ & xếp loại - Nhập bảng đề xuất',
    module: 'adjustment',
    sortOrder: 122,
    description:
      'Menu Điểm cộng, trừ & xếp loại › Nhập bảng đề xuất: lập và trình bảng của đơn vị mình',
  },
  {
    code: Permission.ADJUSTMENT_REVIEW,
    name: 'Điểm cộng, trừ & xếp loại - Duyệt bảng đề xuất',
    module: 'adjustment',
    sortOrder: 124,
    description:
      'Menu Điểm cộng, trừ & xếp loại › Duyệt bảng đề xuất: mở hộp đến, chỉnh điểm, duyệt / trả lại',
  },
  {
    code: Permission.SYSTEM_CONFIG,
    name: 'Cấu hình hệ thống (Phân quyền giao nhiệm vụ, Hiển thị menu)',
    module: 'system',
    sortOrder: 130,
    description:
      'Menu Tổ chức › Phân quyền giao nhiệm vụ, Hiển thị menu; sửa danh mục quyền',
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

  async findAll(query: PaginationQueryDto = new PaginationQueryDto()) {
    const filter: Record<string, unknown> = {};
    if (query.q) {
      const escaped = query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'i');
      filter.$or = [
        { code: regex },
        { name: regex },
        { module: regex },
        { description: regex },
      ];
    }

    const sort = {
      sortOrder: 1 as const,
      module: 1 as const,
      code: 1 as const,
    };

    if (query.all) {
      const data = await this.permissionModel.find(filter).sort(sort);
      return buildPaginatedResponse(data, data.length, 1, data.length || 1);
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.permissionModel.find(filter).sort(sort).skip(skip).limit(limit),
      this.permissionModel.countDocuments(filter),
    ]);

    return buildPaginatedResponse(data, total, page, limit);
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
            module: item.module,
            isSystem: true,
            isActive: true,
          },
          // Tên / mô tả của quyền hệ thống đi theo mã trong code - đổi ở đây
          // là DB đổi theo lúc khởi động, để nhãn luôn khớp tên menu.
          $set: {
            name: item.name,
            description: item.description,
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
