import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { Role, RoleDocument } from './schemas/role.schema';
import { Permission } from '@/common/enums/permission.enum';
import { RoleCode } from '@/common/enums/role-code.enum';
import { Helper } from '@/ultis/helpers';

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

  async findAll() {
    return this.roleModel.find();
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
}
