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
    name: 'Quản trị hệ thống',
    sortOrder: 10,
    permissions: ALL_PERMISSIONS,
  },
  {
    // Cấp cao nhất của chuỗi nghiệp vụ: nhận báo cáo tổng hợp từ các đơn vị,
    // duyệt và chốt. Không có quyền cấu hình hệ thống - việc đó của SUPER_ADMIN.
    code: RoleCode.CAT_ADMIN,
    name: 'Công an tỉnh',
    sortOrder: 15,
    permissions: [
      Permission.USER_VIEW,
      Permission.DEPARTMENT_VIEW,
      Permission.MISSION_MANAGE,
      Permission.TASK_ASSIGN,
      Permission.TASK_VIEW,
      Permission.EVALUATION_SELF,
      Permission.EVALUATION_APPROVE,
      Permission.TEAM_REPORT_REVIEW,
    ],
  },
  {
    code: RoleCode.UNIT_ADMIN,
    name: 'Trưởng phòng, trưởng xã',
    sortOrder: 20,
    // Không có ROLE_ASSIGN / USER_MANAGE: hai quyền đó chưa bị giới hạn theo
    // phạm vi đơn vị nên cấp cho quản trị đơn vị là họ tự gán được vai trò
    // SUPER_ADMIN cho chính mình. DEPARTMENT_MANAGE cũng vậy - xoá được đơn vị
    // của bất kỳ nhánh nào. Chỉ mở lại khi các route đó chặn theo cây đơn vị.
    permissions: [
      Permission.USER_VIEW,
      Permission.DEPARTMENT_VIEW,
      Permission.MISSION_MANAGE,
      Permission.TASK_ASSIGN,
      Permission.TASK_VIEW,
      Permission.EVALUATION_SELF,
      Permission.EVALUATION_APPROVE,
      Permission.TEAM_REPORT_REVIEW,
    ],
  },
  {
    /*
        Phó đứng thay trưởng khi trưởng vắng, nên giữ ĐÚNG bộ quyền của trưởng -
        cắt bớt là mỗi lần trưởng đi vắng công việc của phòng đứng lại. Khác biệt
        giữa phó và trưởng nằm ở bậc báo cáo (ROLE_LADDER), không nằm ở quyền
        thao tác: phó vẫn phải trình báo cáo lên trưởng.
      */
    code: RoleCode.VICE_UNIT_ADMIN,
    name: 'Phó phòng, phó xã',
    sortOrder: 25,
    permissions: [
      Permission.USER_VIEW,
      Permission.DEPARTMENT_VIEW,
      Permission.MISSION_MANAGE,
      Permission.TASK_ASSIGN,
      Permission.TASK_VIEW,
      Permission.EVALUATION_SELF,
      Permission.EVALUATION_APPROVE,
      Permission.TEAM_REPORT_REVIEW,
    ],
  },
  {
    code: RoleCode.MANAGER,
    name: 'Đội trưởng',
    sortOrder: 30,
    permissions: [
      Permission.USER_VIEW,
      Permission.DEPARTMENT_VIEW,
      Permission.TASK_ASSIGN,
      Permission.TASK_VIEW,
      Permission.EVALUATION_SELF,
      Permission.EVALUATION_APPROVE,
      /*
          Tài khoản của đội cũng chính là nơi cả đội nhập báo cáo ngày - bản
          nghiệp vụ mới không có tài khoản riêng cho từng cán bộ.
        */
      Permission.TEAM_REPORT_ENTRY,
    ],
  },
  {
    code: RoleCode.STAFF,
    name: 'Cán bộ',
    sortOrder: 40,
    permissions: [Permission.TASK_VIEW, Permission.EVALUATION_SELF],
  },
];

/**
 * Tên cũ của vai trò hệ thống, để đổi sang tên nghiệp vụ đúng cách gọi trong
 * ngành.
 *
 * Seeder ghi tên bằng `$setOnInsert` nên bản ghi đã có trong CSDL không bao giờ
 * đổi tên theo code - phải có đoạn này mới sửa được. Chỉ đổi khi tên hiện tại
 * ĐÚNG là một tên cũ đã biết: quản trị viên đặt tên riêng cho vai trò thì tên
 * đó phải sống sót qua mỗi lần khởi động, không bị code ghi đè.
 */
const LEGACY_ROLE_NAMES: Record<string, string[]> = {
  [RoleCode.SUPER_ADMIN]: ['Super Admin'],
  [RoleCode.CAT_ADMIN]: ['Quản trị Công an tỉnh'],
  [RoleCode.UNIT_ADMIN]: ['Unit Admin', 'Quản trị đơn vị'],
  [RoleCode.MANAGER]: ['Manager', 'Quản lý'],
  [RoleCode.STAFF]: ['Staff', 'Cán bộ'],
};

/**
 * Quyền THÊM MỚI theo thời gian, cấp cho vai trò hệ thống đã nằm sẵn trong CSDL.
 *
 * `seedSystemRoles` ghi `permissions` bằng `$setOnInsert`, nên bổ sung quyền
 * vào SYSTEM_ROLES ở trên chỉ có tác dụng với cơ sở dữ liệu trắng. Bản đã chạy
 * thật thì không bao giờ nhận được quyền mới nếu không có đoạn này.
 */
const GRANTED_PERMISSIONS: Array<{ code: string; roles: RoleCode[] }> = [
  {
    code: Permission.TEAM_REPORT_ENTRY,
    roles: [RoleCode.MANAGER],
  },
  {
    code: Permission.TEAM_REPORT_REVIEW,
    roles: [RoleCode.UNIT_ADMIN, RoleCode.VICE_UNIT_ADMIN, RoleCode.CAT_ADMIN],
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
    await this.grantNewSystemPermissions();
  }

  /**
   * Cấp các quyền mới cho vai trò hệ thống đã tồn tại.
   *
   * Dùng `$addToSet` từng mã một chứ KHÔNG ghi đè cả danh sách: quản trị viên
   * có thể đã chủ động gỡ bớt quyền của một vai trò, ghi đè là xoá mất lựa chọn
   * đó mỗi lần khởi động.
   */
  private async grantNewSystemPermissions() {
    for (const grant of GRANTED_PERMISSIONS) {
      await this.roleModel.updateMany(
        { code: { $in: grant.roles }, isSystem: true },
        { $addToSet: { permissions: grant.code } },
      );
    }
    // SUPER_ADMIN khai quyền bằng danh sách đầy đủ nên phải bù riêng.
    await this.roleModel.updateOne(
      { code: RoleCode.SUPER_ADMIN, isSystem: true },
      {
        $addToSet: {
          permissions: { $each: GRANTED_PERMISSIONS.map((g) => g.code) },
        },
      },
    );
  }

  async create(dto: CreateRoleDto) {
    const code = dto.code.trim().toUpperCase();
    const exists = await this.roleModel.findOne({ code });
    if (exists) {
      throw new BadRequestException('Mã vai trò đã tồn tại.');
    }

    const permissions = (dto.permissions ?? []).map((p) =>
      p.trim().toLowerCase(),
    );
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

    await this.renameLegacySystemRoles();
  }

  /**
   * Đổi tên vai trò hệ thống sang cách gọi trong ngành.
   *
   * Lọc theo đúng tên cũ chứ không ghi đè vô điều kiện: tên nào quản trị viên
   * tự đặt thì không khớp danh sách cũ nên giữ nguyên. Chạy mỗi lần khởi động
   * cũng không sao - đổi xong thì lần sau bộ lọc không còn khớp gì nữa.
   */
  private async renameLegacySystemRoles() {
    for (const role of SYSTEM_ROLES) {
      const legacyNames = LEGACY_ROLE_NAMES[role.code];
      if (!legacyNames?.length) continue;

      await this.roleModel.updateOne(
        { code: role.code, name: { $in: legacyNames } },
        { $set: { name: role.name, slug: Helper.slugify(role.name) } },
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
