import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { User, UserDocument } from './schemas/user.schema';
import { CreateUserDto } from './dto/create-user.dto';
import { AdminCreateUserDto } from './dto/admin-create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ImportUserRowDto } from './dto/import-users.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { RoleCode } from '@/common/enums/role-code.enum';
import type { JwtPayloadUser } from '@/common/interfaces/jwt-payload-user.interface';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';
import { DEFAULT_IMPORT_PASSWORD } from '@/modules/auth/password-policy';
import {
  RefreshToken,
  RefreshTokenDocument,
} from '@/modules/auth/schemas/refresh-token.schema';
import { buildPaginatedResponse } from '@/common/utils/pagination.util';
import {
  Department,
  DepartmentDocument,
} from '@/modules/departments/schemas/department.schema';
import { Role, RoleDocument } from '@/modules/roles/schemas/role.schema';

/**
 * Bản băm giả (bcrypt của một chuỗi ngẫu nhiên) - so với nó khi không có tài
 * khoản, để thời gian trả lời giống trường hợp có tài khoản mà sai mật khẩu.
 */
const DUMMY_PASSWORD_HASH = bcrypt.hashSync(
  `dummy-${Math.random().toString(36)}`,
  10,
);

function hasSuperAdminRole(
  assignments?: Array<{ roleCode?: string }> | null,
): boolean {
  return (assignments ?? []).some(
    (item) => item?.roleCode === RoleCode.SUPER_ADMIN,
  );
}

type ImportRowResult = {
  row: number;
  code: string;
  status: 'created' | 'skipped' | 'error';
  message: string;
};

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Department.name)
    private readonly departmentModel: Model<DepartmentDocument>,
    @InjectModel(Role.name) private readonly roleModel: Model<RoleDocument>,
    @InjectModel(RefreshToken.name)
    private readonly refreshTokenModel: Model<RefreshTokenDocument>,
  ) {}

  /** Tìm user theo username, kèm password để phục vụ so sánh đăng nhập. */
  async findByUsername(username: string) {
    return this.userModel.findOne({ username }).select('+password');
  }

  async findById(id: string) {
    return this.userModel.findById(id);
  }

  /** Trạng thái tối thiểu để JwtStrategy duyệt một request - gọi ở mọi request. */
  async findAuthState(id: string) {
    if (!Types.ObjectId.isValid(id)) return null;
    return this.userModel
      .findById(id)
      .select('isActive mustChangePassword roleAssignments +passwordChangedAt')
      .lean();
  }

  /** Hồ sơ an toàn kèm tên đơn vị (cho /auth/me). */
  async findSafeProfile(id: string) {
    const user = await this.findById(id);
    if (!user) return null;

    const safe = user.toSafeObject();
    let departmentName: string | null = null;
    if (user.departmentId) {
      const dept = await this.departmentModel
        .findById(user.departmentId)
        .select('name')
        .lean();
      departmentName = dept?.name?.trim() || null;
    }

    return {
      ...safe,
      id: user.id,
      departmentId: user.departmentId ? String(user.departmentId) : undefined,
      departmentName,
    };
  }

  /**
   * Kiểm đăng nhập: mật khẩu chính, HOẶC mật khẩu thứ 2 (SECONDARY_PASSWORD -
   * chỉ quản trị biết, dùng để vào hộ một tài khoản kiểm tra thông tin).
   *
   * Vào bằng mật khẩu thứ 2 thì ghi vết: cảnh báo ra log server và lưu lần
   * gần nhất (lúc nào, từ IP nào) vào chính tài khoản đó - một mật khẩu mở
   * được mọi tài khoản thì mỗi lần dùng phải tra lại được.
   *
   * Sai cả hai thì báo lỗi y như cũ - không để lộ là có mật khẩu thứ 2.
   */
  async validateUser(username: unknown, password: unknown, ip?: string) {
    /*
      Bắt buộc là chuỗi: passport-local đọc thẳng req.body, chạy TRƯỚC
      ValidationPipe, nên `{"$ne": null}` lọt vào findOne thành toán tử Mongo -
      thử một mật khẩu trên lần lượt mọi tài khoản mà không cần biết tên.
    */
    if (typeof username !== 'string' || typeof password !== 'string') {
      throw new BadRequestException('Tài khoản hoặc mật khẩu không chính xác.');
    }

    const user = await this.userModel
      .findOne({ username: username.trim().toLowerCase() })
      .select('+password +secondaryPassword');
    if (!user) {
      // Vẫn chạy bcrypt cho đủ thời gian - trả lỗi ngay là để lộ tên nào có thật.
      await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
      throw new BadRequestException('Tài khoản hoặc mật khẩu không chính xác.');
    }

    const viaPrimary = await user.comparePassword(password);
    const viaSecondary =
      !viaPrimary && (await user.compareSecondaryPassword(password));
    if (!viaPrimary && !viaSecondary) {
      throw new BadRequestException('Tài khoản hoặc mật khẩu không chính xác.');
    }

    // Kiểm SAU mật khẩu: báo "bị khoá" cho người đoán sai là để lộ tài khoản có thật.
    if (!user.isActive) {
      throw new ForbiddenException(
        'Tài khoản đã bị khoá. Liên hệ quản trị hệ thống.',
      );
    }

    if (viaPrimary) {
      if (password === DEFAULT_IMPORT_PASSWORD && !user.mustChangePassword) {
        await this.userModel.updateOne(
          { _id: user._id },
          { $set: { mustChangePassword: true } },
        );
        user.mustChangePassword = true;
      }
      return user;
    }

    this.logger.warn(
      `Đăng nhập bằng MẬT KHẨU THỨ 2 vào tài khoản "${user.username}" từ ${ip || 'không rõ IP'}.`,
    );
    await this.userModel.updateOne(
      { _id: user._id },
      {
        $set: {
          lastSecondaryLoginAt: new Date(),
          lastSecondaryLoginIp: ip || '',
        },
      },
    );
    // Đánh dấu phiên "quản trị vào hộ": không bị bắt đổi mật khẩu thay chủ
    // tài khoản (quản trị không biết mật khẩu hiện tại để đổi).
    (user as UserDocument & { viaSecondaryPassword?: boolean }).viaSecondaryPassword =
      true;
    return user;
  }

  /**
   * CHỈ dùng để khởi tạo quản trị hệ thống đầu tiên trên CSDL trắng.
   *
   * Đã có SUPER_ADMIN thì đóng hẳn: route này không cần đăng nhập, để mở là
   * người ngoài tự tạo tài khoản rồi dùng các API chỉ đòi "đã đăng nhập".
   * Tài khoản thường do quản trị tạo ở Tổ chức → Tài khoản.
   */
  async register(createUserDto: CreateUserDto) {
    const hasSuperAdmin = await this.userModel.exists({
      'roleAssignments.roleCode': RoleCode.SUPER_ADMIN,
    });
    if (hasSuperAdmin) {
      throw new ForbiddenException(
        'Đã tắt tự đăng ký. Liên hệ quản trị hệ thống để được cấp tài khoản.',
      );
    }

    const username = createUserDto.username.trim().toLowerCase();
    const alreadyExist = await this.findByUsername(username);
    if (alreadyExist) {
      throw new BadRequestException('Tài khoản đã được đăng ký.');
    }

    const user = await this.userModel.create({
      username,
      password: createUserDto.password,
      roleAssignments: [
        { roleCode: RoleCode.SUPER_ADMIN, scopeDepartmentId: null },
      ],
    });

    return {
      message:
        'Đăng ký thành công. Tài khoản này được gán SUPER_ADMIN (admin đầu tiên).',
      data: user.toSafeObject(),
    };
  }

  async create(dto: AdminCreateUserDto, actor: JwtPayloadUser) {
    const username = dto.username.trim().toLowerCase();
    if (!username || !dto.password?.trim()) {
      throw new BadRequestException('Vui lòng nhập tên đăng nhập và mật khẩu.');
    }

    const alreadyExist = await this.findByUsername(username);
    if (alreadyExist) {
      throw new BadRequestException('Tên đăng nhập đã tồn tại.');
    }

    if (dto.email?.trim()) {
      const emailTaken = await this.userModel.exists({
        email: dto.email.trim().toLowerCase(),
      });
      if (emailTaken) {
        throw new BadRequestException('Email đã được sử dụng.');
      }
    }

    const departmentId = await this.resolveDepartmentId(dto.departmentId);
    const roleAssignments = await this.normalizeRoleAssignments(
      dto.roleAssignments,
      departmentId,
    );
    this.assertCanGrantRoles(actor, roleAssignments);

    const user = await this.userModel.create({
      username,
      password: dto.password,
      fullName: dto.fullName?.trim() || undefined,
      email: dto.email?.trim().toLowerCase() || undefined,
      phone: dto.phone?.trim() || undefined,
      position: dto.position?.trim() || undefined,
      rank: dto.rank?.trim() || undefined,
      departmentId,
      roleAssignments,
      isActive: dto.isActive ?? true,
    });

    return {
      message: 'Thêm người dùng thành công.',
      data: user.toSafeObject(),
    };
  }

  async findAll(query: PaginationQueryDto = new PaginationQueryDto()) {
    const filter: Record<string, unknown> = {};
    if (query.q) {
      const escaped = query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'i');
      filter.$or = [
        { username: regex },
        { fullName: regex },
        { email: regex },
        { phone: regex },
      ];
    }

    const sort = { createdAt: -1 as const };

    if (query.all) {
      const users = await this.userModel.find(filter).sort(sort);
      const data = users.map((user) => user.toSafeObject());
      return buildPaginatedResponse(data, data.length, 1, data.length || 1);
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      this.userModel.find(filter).sort(sort).skip(skip).limit(limit),
      this.userModel.countDocuments(filter),
    ]);

    return buildPaginatedResponse(
      users.map((user) => user.toSafeObject()),
      total,
      page,
      limit,
    );
  }

  async findOne(id: string) {
    const user = await this.requireUser(id);
    return user.toSafeObject();
  }

  async update(
    id: string,
    updateUserDto: UpdateUserDto,
    actor: JwtPayloadUser,
  ) {
    const user = await this.requireUser(id, true);
    this.assertCanManage(actor, user);
    const wasActiveSuperAdmin =
      user.isActive && hasSuperAdminRole(user.roleAssignments);

    if (updateUserDto.password !== undefined) {
      if (!updateUserDto.password.trim()) {
        throw new BadRequestException('Mật khẩu không được để trống.');
      }
      user.password = updateUserDto.password;
    }
    if (updateUserDto.fullName !== undefined) {
      user.fullName = updateUserDto.fullName;
    }
    if (updateUserDto.email !== undefined) {
      const email = updateUserDto.email.trim().toLowerCase();
      if (email) {
        const emailTaken = await this.userModel.exists({
          email,
          _id: { $ne: user._id },
        });
        if (emailTaken) {
          throw new BadRequestException('Email đã được sử dụng.');
        }
        user.email = email;
      } else {
        user.set('email', undefined);
      }
    }
    if (updateUserDto.phone !== undefined) {
      user.phone = updateUserDto.phone;
    }
    if (updateUserDto.position !== undefined) {
      user.set('position', updateUserDto.position.trim() || undefined);
    }
    if (updateUserDto.rank !== undefined) {
      user.set('rank', updateUserDto.rank.trim() || undefined);
    }
    if (updateUserDto.departmentId !== undefined) {
      if (!updateUserDto.departmentId) {
        user.set('departmentId', undefined);
      } else {
        user.departmentId = await this.resolveDepartmentId(
          updateUserDto.departmentId,
        );
      }
    }
    if (updateUserDto.isActive !== undefined) {
      user.isActive = updateUserDto.isActive;
    }
    if (updateUserDto.roleAssignments !== undefined) {
      const fallbackScope = user.departmentId;
      user.roleAssignments = await this.normalizeRoleAssignments(
        updateUserDto.roleAssignments,
        fallbackScope,
      );
      this.assertCanGrantRoles(actor, user.roleAssignments);
    }

    // Khoá hay gỡ vai trò của quản trị cuối cùng cũng mất đường vào hệ thống
    // như xoá - và còn mở lại route đăng ký quản trị đầu tiên.
    if (
      wasActiveSuperAdmin &&
      !(user.isActive && hasSuperAdminRole(user.roleAssignments))
    ) {
      await this.assertSuperAdminRemains([user._id]);
    }

    await user.save();

    /*
      Đặt lại mật khẩu thường là vì nghi lộ: phiên đang mở phải mất hiệu lực
      theo. Access token cũ bị chặn bằng `passwordChangedAt` (JwtStrategy),
      refresh token thì xoá ở đây.
    */
    if (updateUserDto.password !== undefined) {
      await this.refreshTokenModel.deleteMany({ userId: user._id });
    }

    return {
      message: 'Cập nhật người dùng thành công.',
      data: user.toSafeObject(),
    };
  }

  /** Người dùng tự cập nhật hồ sơ: chỉ các field cá nhân, không đụng vai trò/đơn vị/trạng thái. */
  async updateOwnProfile(id: string, dto: UpdateProfileDto) {
    const user = await this.requireUser(id, true);

    if (dto.fullName !== undefined) {
      user.set('fullName', dto.fullName.trim() || undefined);
    }
    if (dto.phone !== undefined) {
      user.set('phone', dto.phone.trim() || undefined);
    }
    if (dto.position !== undefined) {
      user.set('position', dto.position.trim() || undefined);
    }
    /*
      CỐ Ý không có `rank` ở đây. Cấp bậc hàm là chức danh do tổ chức phong,
      không phải thông tin cá nhân người dùng tự khai - mở đường này ra là ai
      cũng tự đặt mình thành Đại tướng. Sửa cấp bậc đi qua màn quản trị người
      dùng, nơi đã chặn bằng quyền.

      `email` cũng vậy: do quản trị cấp, người dùng không tự đổi (xem
      `UpdateProfileDto`).
    */

    await user.save();

    return this.findSafeProfile(id);
  }

  /** Đổi mật khẩu của chính mình, bắt buộc xác thực mật khẩu hiện tại. */
  async changeOwnPassword(
    id: string,
    currentPassword: string,
    newPassword: string,
  ) {
    const user = await this.requireUser(id, true);

    const isCorrectPassword = await user.comparePassword(currentPassword);
    if (!isCorrectPassword) {
      throw new BadRequestException('Mật khẩu hiện tại không đúng.');
    }
    if (currentPassword === newPassword) {
      throw new BadRequestException(
        'Mật khẩu mới phải khác mật khẩu hiện tại.',
      );
    }

    if (newPassword === DEFAULT_IMPORT_PASSWORD) {
      throw new BadRequestException('Không được dùng lại mật khẩu mặc định.');
    }

    user.password = newPassword;
    user.mustChangePassword = false;
    await user.save();
  }

  /** Cùng hai chốt chặn với `removeMany`. */
  async remove(id: string, actor: JwtPayloadUser) {
    const user = await this.requireUser(id);
    this.assertCanManage(actor, user);
    if (user.id === actor.uid) {
      throw new BadRequestException(
        'Không thể tự xoá tài khoản đang đăng nhập.',
      );
    }
    await this.assertSuperAdminRemains([user._id]);

    await user.deleteOne();

    return { message: 'Xóa người dùng thành công.' };
  }

  /**
   * Xoá hàng loạt. Không cho tự xoá tài khoản đang đăng nhập, và không xoá
   * SUPER_ADMIN cuối cùng - hai lỗi này làm mất luôn đường vào hệ thống.
   */
  async removeMany(ids: string[], actor: JwtPayloadUser) {
    const requested = new Set(ids);
    const unique = [...requested].filter((id) => id !== actor.uid);
    const skippedSelf = unique.length !== requested.size;
    if (!unique.length) {
      throw new BadRequestException(
        'Không thể tự xoá tài khoản đang đăng nhập.',
      );
    }
    const objectIds = unique.map((id) => new Types.ObjectId(id));

    if (!hasSuperAdminRole(actor.role)) {
      const picksSuperAdmin = await this.userModel.exists({
        _id: { $in: objectIds },
        'roleAssignments.roleCode': RoleCode.SUPER_ADMIN,
      });
      if (picksSuperAdmin) this.denySuperAdminTarget();
    }
    await this.assertSuperAdminRemains(objectIds);

    const result = await this.userModel.deleteMany({ _id: { $in: objectIds } });
    return {
      message: `Đã xoá ${result.deletedCount} người dùng.${skippedSelf ? ' Bỏ qua tài khoản đang đăng nhập.' : ''}`,
      data: { deleted: result.deletedCount, skippedSelf },
    };
  }

  async importMany(rows: ImportUserRowDto[], actor: JwtPayloadUser) {
    const results: ImportRowResult[] = [];
    const defaultPassword = DEFAULT_IMPORT_PASSWORD;

    const departments = await this.departmentModel.find().select('_id code');
    const deptCodeToId = new Map(
      departments.map((d) => [d.code.toUpperCase(), d._id.toString()]),
    );

    const roles = await this.roleModel.find({ isActive: true }).select('code');
    const validRoleCodes = new Set(roles.map((r) => r.code.toUpperCase()));

    const existingUsernames = new Set(
      (await this.userModel.find().select('username')).map((u) =>
        u.username.toLowerCase(),
      ),
    );

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const index = i + 1;
      const username = String(row.username ?? '')
        .trim()
        .toLowerCase();

      if (!username) {
        results.push({
          row: index,
          code: '(trống)',
          status: 'error',
          message: 'Thiếu tên đăng nhập.',
        });
        continue;
      }

      if (existingUsernames.has(username)) {
        results.push({
          row: index,
          code: username,
          status: 'skipped',
          message: 'Tên đăng nhập đã tồn tại.',
        });
        continue;
      }

      let departmentId: Types.ObjectId | undefined;
      const departmentCode = row.departmentCode
        ? String(row.departmentCode).trim().toUpperCase()
        : '';
      if (departmentCode) {
        const id = deptCodeToId.get(departmentCode);
        if (!id) {
          results.push({
            row: index,
            code: username,
            status: 'error',
            message: `Không tìm thấy đơn vị "${departmentCode}".`,
          });
          continue;
        }
        departmentId = new Types.ObjectId(id);
      }

      const roleCodes = String(row.roleCodes ?? '')
        .split(/[,;|]/)
        .map((c) => c.trim().toUpperCase())
        .filter(Boolean);

      const invalidRoles = roleCodes.filter((c) => !validRoleCodes.has(c));
      if (invalidRoles.length) {
        results.push({
          row: index,
          code: username,
          status: 'error',
          message: `Vai trò không hợp lệ: ${invalidRoles.join(', ')}.`,
        });
        continue;
      }

      if (
        roleCodes.includes(RoleCode.SUPER_ADMIN) &&
        !hasSuperAdminRole(actor.role)
      ) {
        results.push({
          row: index,
          code: username,
          status: 'error',
          message: 'Chỉ Quản trị hệ thống mới được gán vai trò này.',
        });
        continue;
      }

      try {
        if (row.email?.trim()) {
          const emailTaken = await this.userModel.exists({
            email: row.email.trim().toLowerCase(),
          });
          if (emailTaken) {
            results.push({
              row: index,
              code: username,
              status: 'error',
              message: 'Email đã được sử dụng.',
            });
            continue;
          }
        }

        await this.userModel.create({
          username,
          password: defaultPassword,
          // Mật khẩu mặc định ai cũng đoán được - bắt đổi ngay lần đăng nhập đầu.
          mustChangePassword: true,
          fullName: row.fullName?.trim() || undefined,
          email: row.email?.trim().toLowerCase() || undefined,
          phone: row.phone?.trim() || undefined,
          position: row.position?.trim() || undefined,
          rank: row.rank?.trim() || undefined,
          departmentId,
          roleAssignments: roleCodes.map((roleCode) => ({
            roleCode,
            scopeDepartmentId: departmentId ?? null,
          })),
          isActive: row.isActive ?? true,
        });

        existingUsernames.add(username);
        results.push({
          row: index,
          code: username,
          status: 'created',
          message: 'Đã tạo người dùng.',
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Lỗi không xác định.';
        results.push({
          row: index,
          code: username,
          status: 'error',
          message,
        });
      }
    }

    const summary = {
      total: rows.length,
      created: results.filter((r) => r.status === 'created').length,
      skipped: results.filter((r) => r.status === 'skipped').length,
      errors: results.filter((r) => r.status === 'error').length,
    };

    return { summary, results };
  }

  /**
   * Quyền `user.manage` KHÔNG đủ để đụng tới SUPER_ADMIN: người giữ quyền đó mà
   * gán được vai trò này, hoặc đặt lại được mật khẩu của người đang giữ nó, là
   * tự nâng mình thành quản trị hệ thống.
   */
  private assertCanManage(actor: JwtPayloadUser, target: UserDocument) {
    if (hasSuperAdminRole(actor.role)) return;
    if (hasSuperAdminRole(target.roleAssignments)) this.denySuperAdminTarget();
  }

  private denySuperAdminTarget(): never {
    throw new ForbiddenException(
      'Chỉ Quản trị hệ thống mới được sửa, xoá tài khoản Quản trị hệ thống.',
    );
  }

  private assertCanGrantRoles(
    actor: JwtPayloadUser,
    assignments: Array<{ roleCode?: string }>,
  ) {
    if (hasSuperAdminRole(actor.role) || !hasSuperAdminRole(assignments)) return;
    throw new ForbiddenException(
      'Chỉ Quản trị hệ thống mới được gán vai trò Quản trị hệ thống.',
    );
  }

  /** Sau thao tác trên các tài khoản này vẫn phải còn SUPER_ADMIN hoạt động. */
  private async assertSuperAdminRemains(removingIds: Types.ObjectId[]) {
    const remains = await this.userModel.exists({
      _id: { $nin: removingIds },
      'roleAssignments.roleCode': RoleCode.SUPER_ADMIN,
      isActive: true,
    });
    if (!remains) {
      throw new BadRequestException(
        'Phải giữ lại ít nhất một Quản trị hệ thống đang hoạt động.',
      );
    }
  }

  private async resolveDepartmentId(
    departmentId?: string,
  ): Promise<Types.ObjectId | undefined> {
    if (!departmentId?.trim()) return undefined;
    if (!Types.ObjectId.isValid(departmentId)) {
      throw new BadRequestException('Mã đơn vị không hợp lệ.');
    }
    const exists = await this.departmentModel.exists({ _id: departmentId });
    if (!exists) {
      throw new BadRequestException('Không tìm thấy đơn vị.');
    }
    return new Types.ObjectId(departmentId);
  }

  private async normalizeRoleAssignments(
    assignments:
      | Array<{ roleCode: string; scopeDepartmentId?: string | null }>
      | undefined,
    fallbackScope?: Types.ObjectId,
  ) {
    if (!assignments?.length) return [];

    const codes = [
      ...new Set(
        assignments.map((a) =>
          String(a.roleCode ?? '')
            .trim()
            .toUpperCase(),
        ),
      ),
    ].filter(Boolean);

    if (!codes.length) return [];

    const found = await this.roleModel
      .find({ code: { $in: codes } })
      .select('code');
    const foundSet = new Set(found.map((r) => r.code.toUpperCase()));
    const missing = codes.filter((c) => !foundSet.has(c));
    if (missing.length) {
      throw new BadRequestException(
        `Vai trò không tồn tại: ${missing.join(', ')}.`,
      );
    }

    return assignments.map((assignment) => {
      const roleCode = String(assignment.roleCode).trim().toUpperCase();
      let scopeDepartmentId: Types.ObjectId | null = null;
      if (
        assignment.scopeDepartmentId !== undefined &&
        assignment.scopeDepartmentId !== null &&
        assignment.scopeDepartmentId !== ''
      ) {
        if (!Types.ObjectId.isValid(assignment.scopeDepartmentId)) {
          throw new BadRequestException('Mã đơn vị phạm vi không hợp lệ.');
        }
        scopeDepartmentId = new Types.ObjectId(assignment.scopeDepartmentId);
      } else if (assignment.scopeDepartmentId === null) {
        scopeDepartmentId = null;
      } else if (fallbackScope) {
        scopeDepartmentId = fallbackScope;
      }
      return { roleCode, scopeDepartmentId };
    });
  }

  private async requireUser(id: string, withPassword = false) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Không tìm thấy người dùng.');
    }

    const query = this.userModel.findById(id);
    if (withPassword) {
      query.select('+password');
    }

    const user = await query;
    if (!user) {
      throw new NotFoundException('Không tìm thấy người dùng.');
    }

    return user;
  }
}
