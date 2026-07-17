import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { Role, RoleDocument } from './schemas/role.schema';
import { Permission } from '@/common/enums/permission.enum';
import { RoleCode } from '@/common/enums/role-code.enum';
import { Helper } from '@/ultis/helpers';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

const ALL_PERMISSIONS = Object.values(Permission);

const SYSTEM_ROLES: Array<{
  code: RoleCode;
  name: string;
  permissions: Permission[];
}> = [
  {
    code: RoleCode.SUPER_ADMIN,
    name: 'Super Admin',
    permissions: ALL_PERMISSIONS,
  },
  {
    code: RoleCode.UNIT_ADMIN,
    name: 'Unit Admin',
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
  ) {}

  async onModuleInit() {
    await this.seedSystemRoles();
  }

  async create(dto: CreateRoleDto) {
    const exists = await this.roleModel.findOne({ code: dto.code });
    if (exists) {
      throw new BadRequestException('Mã vai trò đã tồn tại.');
    }

    const role = await this.roleModel.create({
      code: dto.code,
      name: dto.name.trim(),
      slug: Helper.slugify(dto.name),
      permissions: dto.permissions ?? [],
      isSystem: false,
      isActive: dto.isActive ?? true,
    });

    return {
      message: 'Tạo vai trò thành công.',
      data: role,
    };
  }

  async findAll() {
    return this.roleModel.find().sort({ code: 1 });
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
      role.permissions = dto.permissions;
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

  async getPermissionsByCodes(codes: RoleCode[]): Promise<Permission[]> {
    if (!codes.length) {
      return [];
    }

    const roles = await this.roleModel
      .find({
        code: { $in: codes },
        isActive: true,
      })
      .select('permissions')
      .lean();

    const set = new Set<Permission>();
    for (const role of roles) {
      for (const permission of role.permissions ?? []) {
        set.add(permission as Permission);
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
