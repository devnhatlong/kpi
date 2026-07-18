import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleInit,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { Role, RoleDocument } from './schemas/role.schema';
import { Permission } from '@/common/enums/permission.enum';
import { RoleCode } from '@/common/enums/role-code.enum';
import { Helper } from '@/ultis/helpers';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { PermissionsService } from '../permissions/permissions.service';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';
import { buildPaginatedResponse } from '@/common/utils/pagination.util';

const ALL_PERMISSIONS = Object.values(Permission);

const SYSTEM_ROLES: Array<{
  code: string;
  name: string;
  sortOrder: number;
  permissions: string[];
}> = [
  {
    code: RoleCode.SUPER_ADMIN,
    name: 'Super Admin',
    sortOrder: 10,
    permissions: ALL_PERMISSIONS,
  },
  {
    code: RoleCode.UNIT_ADMIN,
    name: 'Unit Admin',
    sortOrder: 20,
    permissions: [
      Permission.USER_VIEW,
      Permission.USER_MANAGE,
      Permission.DEPARTMENT_VIEW,
      Permission.DEPARTMENT_MANAGE,
      Permission.ROLE_ASSIGN,
      Permission.KPI_MANAGE,
      Permission.KPI_ASSIGN,
      Permission.TASK_ASSIGN,
      Permission.TASK_VIEW,
      Permission.EVALUATION_SELF,
      Permission.EVALUATION_APPROVE,
      Permission.REPORT_VIEW,
    ],
  },
  {
    code: RoleCode.MANAGER,
    name: 'Manager',
    sortOrder: 30,
    permissions: [
      Permission.USER_VIEW,
      Permission.DEPARTMENT_VIEW,
      Permission.KPI_ASSIGN,
      Permission.TASK_ASSIGN,
      Permission.TASK_VIEW,
      Permission.EVALUATION_SELF,
      Permission.EVALUATION_APPROVE,
      Permission.REPORT_VIEW,
    ],
  },
  {
    code: RoleCode.STAFF,
    name: 'Staff',
    sortOrder: 40,
    permissions: [
      Permission.TASK_VIEW,
      Permission.EVALUATION_SELF,
      Permission.REPORT_VIEW,
    ],
  },
];

@Injectable()
export class RolesService implements OnModuleInit {
  constructor(
    @InjectModel(Role.name) private readonly roleModel: Model<RoleDocument>,
    @Inject(forwardRef(() => PermissionsService))
    private readonly permissionsService: PermissionsService,
  ) {}

  async onModuleInit() {
    await this.permissionsService.seedSystemPermissions();
    await this.seedSystemRoles();
  }

  async create(dto: CreateRoleDto) {
    const code = dto.code.trim().toUpperCase();
    const exists = await this.roleModel.findOne({ code });
    if (exists) {
      throw new BadRequestException('Mã vai trò đã tồn tại.');
    }

    const permissions = (dto.permissions ?? []).map((p) => p.trim().toLowerCase());
    await this.permissionsService.assertCodesExist(permissions);

    const role = await this.roleModel.create({
      code,
      name: dto.name.trim(),
      slug: Helper.slugify(dto.name),
      permissions,
      sortOrder: dto.sortOrder ?? 0,
      isSystem: false,
      isActive: dto.isActive ?? true,
    });

    return {
      message: 'Tạo vai trò thành công.',
      data: role,
    };
  }

  async findAll(query: PaginationQueryDto = new PaginationQueryDto()) {
    const filter: Record<string, unknown> = {};
    if (query.q) {
      const escaped = query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'i');
      filter.$or = [{ code: regex }, { name: regex }];
    }

    const sort = { sortOrder: 1 as const, code: 1 as const };

    if (query.all) {
      const data = await this.roleModel.find(filter).sort(sort);
      return buildPaginatedResponse(data, data.length, 1, data.length || 1);
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.roleModel.find(filter).sort(sort).skip(skip).limit(limit),
      this.roleModel.countDocuments(filter),
    ]);

    return buildPaginatedResponse(data, total, page, limit);
  }

  async findOne(id: string) {
    return this.requireRole(id);
  }

  async update(id: string, dto: UpdateRoleDto) {
    const role = await this.requireRole(id);

    if (dto.name !== undefined) {
      role.name = dto.name.trim();
      role.slug = Helper.slugify(dto.name);
    }
    if (dto.permissions !== undefined) {
      const permissions = dto.permissions.map((p) => p.trim().toLowerCase());
      await this.permissionsService.assertCodesExist(permissions);
      role.permissions = permissions;
    }
    if (dto.sortOrder !== undefined) {
      role.sortOrder = dto.sortOrder;
    }
    if (dto.isActive !== undefined) {
      role.isActive = dto.isActive;
    }

    await role.save();

    return {
      message: 'Cập nhật vai trò thành công.',
      data: role,
    };
  }

  async remove(id: string) {
    const role = await this.requireRole(id);
    if (role.isSystem) {
      throw new BadRequestException('Không thể xóa vai trò hệ thống.');
    }

    await role.deleteOne();

    return { message: 'Xóa vai trò thành công.' };
  }

  async getPermissionsByCodes(codes: string[]): Promise<string[]> {
    if (!codes.length) {
      return [];
    }

    const normalized = codes.map((c) => c.trim().toUpperCase());
    const roles = await this.roleModel
      .find({
        code: { $in: normalized },
        isActive: true,
      })
      .select('permissions')
      .lean();

    const set = new Set<string>();
    for (const role of roles) {
      for (const permission of role.permissions ?? []) {
        set.add(permission);
      }
    }

    return [...set];
  }

  async seedSystemRoles() {
    for (const role of SYSTEM_ROLES) {
      await this.roleModel.updateOne(
        { code: role.code },
        {
          $setOnInsert: {
            code: role.code,
            name: role.name,
            slug: Helper.slugify(role.name),
            permissions: role.permissions,
            isSystem: true,
            isActive: true,
          },
          $set: {
            sortOrder: role.sortOrder,
          },
        },
        { upsert: true },
      );
    }
  }

  private async requireRole(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Không tìm thấy vai trò.');
    }

    const role = await this.roleModel.findById(id);
    if (!role) {
      throw new NotFoundException('Không tìm thấy vai trò.');
    }

    return role;
  }
}
