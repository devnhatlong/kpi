import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { User, UserDocument } from './schemas/user.schema';
import { CreateUserDto } from './dto/create-user.dto';
import { AdminCreateUserDto } from './dto/admin-create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ImportUserRowDto } from './dto/import-users.dto';
import { RoleCode } from '@/common/enums/role-code.enum';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';
import { buildPaginatedResponse } from '@/common/utils/pagination.util';
import {
  Department,
  DepartmentDocument,
} from '@/modules/departments/schemas/department.schema';
import { Role, RoleDocument } from '@/modules/roles/schemas/role.schema';

type ImportRowResult = {
  row: number;
  code: string;
  status: 'created' | 'skipped' | 'error';
  message: string;
};

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Department.name)
    private readonly departmentModel: Model<DepartmentDocument>,
    @InjectModel(Role.name) private readonly roleModel: Model<RoleDocument>,
  ) {}

  /** Tìm user theo username, kèm password để phục vụ so sánh đăng nhập. */
  async findByUsername(username: string) {
    return this.userModel.findOne({ username }).select('+password');
  }

  async findById(id: string) {
    return this.userModel.findById(id);
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
      departmentId: user.departmentId
        ? String(user.departmentId)
        : undefined,
      departmentName,
    };
  }

  async validateUser(username: string, password: string) {
    const user = await this.findByUsername(username);
    if (!user) {
      throw new BadRequestException(
        'Tài khoản hoặc mật khẩu không chính xác.',
      );
    }

    const isCorrectPassword = await user.comparePassword(password);
    if (!isCorrectPassword) {
      throw new BadRequestException(
        'Tài khoản hoặc mật khẩu không chính xác.',
      );
    }

    return user;
  }

  async register(createUserDto: CreateUserDto) {
    const alreadyExist = await this.findByUsername(createUserDto.username);

    if (alreadyExist) {
      throw new BadRequestException('Tài khoản đã được đăng ký.');
    }

    // Bootstrap: chưa có SUPER_ADMIN nào → user này trở thành admin hệ thống
    const hasSuperAdmin = await this.userModel.exists({
      'roleAssignments.roleCode': RoleCode.SUPER_ADMIN,
    });

    const user = await this.userModel.create({
      username: createUserDto.username,
      password: createUserDto.password,
      roleAssignments: hasSuperAdmin
        ? []
        : [{ roleCode: RoleCode.SUPER_ADMIN, scopeDepartmentId: null }],
    });

    return {
      message: hasSuperAdmin
        ? 'Đăng ký tài khoản thành công.'
        : 'Đăng ký thành công. Tài khoản này được gán SUPER_ADMIN (admin đầu tiên).',
      data: user.toSafeObject(),
    };
  }

  async create(dto: AdminCreateUserDto) {
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

    const user = await this.userModel.create({
      username,
      password: dto.password,
      fullName: dto.fullName?.trim() || undefined,
      email: dto.email?.trim().toLowerCase() || undefined,
      phone: dto.phone?.trim() || undefined,
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

  async update(id: string, updateUserDto: UpdateUserDto) {
    const user = await this.requireUser(id, true);

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
    }

    await user.save();

    return {
      message: 'Cập nhật người dùng thành công.',
      data: user.toSafeObject(),
    };
  }

  async remove(id: string) {
    const user = await this.requireUser(id);
    await user.deleteOne();

    return { message: 'Xóa người dùng thành công.' };
  }

  async importMany(rows: ImportUserRowDto[]) {
    const results: ImportRowResult[] = [];
    const defaultPassword = '123456';

    const departments = await this.departmentModel.find().select('_id code');
    const deptCodeToId = new Map(
      departments.map((d) => [d.code.toUpperCase(), d._id.toString()]),
    );

    const roles = await this.roleModel.find({ isActive: true }).select('code');
    const validRoleCodes = new Set(roles.map((r) => r.code.toUpperCase()));

    const existingUsernames = new Set(
      (
        await this.userModel.find().select('username')
      ).map((u) => u.username.toLowerCase()),
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
          fullName: row.fullName?.trim() || undefined,
          email: row.email?.trim().toLowerCase() || undefined,
          phone: row.phone?.trim() || undefined,
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
        assignments.map((a) => String(a.roleCode ?? '').trim().toUpperCase()),
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
