import {
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { createHash, randomBytes } from 'crypto';
import { Model, Types } from 'mongoose';

import { Permission } from '@/common/enums/permission.enum';
import { RoleCode } from '@/common/enums/role-code.enum';
import { UsersService } from '../users/users.service';
import { RolesService } from '../roles/roles.service';
import { UserDocument } from '../users/schemas/user.schema';
import { UpdateProfileDto } from '../users/dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import {
  RefreshToken,
  RefreshTokenDocument,
} from './schemas/refresh-token.schema';

const MAX_REFRESH_TOKENS_PER_USER = 5;

@Injectable()
export class AuthsService {
  private readonly logger = new Logger(AuthsService.name);

  constructor(
    private readonly usersService: UsersService,
    @Inject(forwardRef(() => RolesService))
    private readonly rolesService: RolesService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @InjectModel(RefreshToken.name)
    private readonly refreshTokenModel: Model<RefreshTokenDocument>,
  ) {}

  async validateUser(username: string, password: string) {
    return await this.usersService.validateUser(username, password);
  }

  async login(user: UserDocument) {
    const userId = user.id;
    const tokens = await this.issueTokens(userId, user.roleAssignments);

    return {
      message: 'Đăng nhập thành công.',
      data: tokens,
    };
  }

  async me(userId: string) {
    const profile = await this.usersService.findSafeProfile(userId);
    if (!profile || !profile.isActive) {
      throw new UnauthorizedException('Tài khoản không hợp lệ.');
    }

    return {
      message: 'Lấy thông tin người dùng thành công.',
      data: {
        ...profile,
        permissions: await this.resolvePermissions(profile.roleAssignments),
      },
    };
  }

  /**
   * Quyền thực tế của user, để client ẩn/hiện menu cho khớp với những gì
   * PermissionsGuard sẽ cho qua. Super admin được guard bỏ qua vòng kiểm tra
   * nên ở đây cũng trả về đủ, tránh menu ẩn mất thứ họ vẫn gọi được.
   */
  private async resolvePermissions(
    roleAssignments?: Array<{ roleCode: string }>,
  ): Promise<string[]> {
    const roleCodes = (roleAssignments ?? [])
      .map((item) => item?.roleCode)
      .filter((code): code is string => Boolean(code));

    if (roleCodes.includes(RoleCode.SUPER_ADMIN)) {
      return Object.values(Permission);
    }
    return this.rolesService.getPermissionsByCodes(roleCodes);
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const profile = await this.usersService.updateOwnProfile(userId, dto);

    return {
      message: 'Cập nhật hồ sơ thành công.',
      data: profile,
    };
  }

  /**
   * Đổi mật khẩu và thu hồi toàn bộ refresh token của user,
   * kể cả phiên hiện tại - người dùng phải đăng nhập lại.
   */
  async changePassword(userId: string, dto: ChangePasswordDto) {
    await this.usersService.changeOwnPassword(
      userId,
      dto.currentPassword,
      dto.newPassword,
    );
    await this.logoutAll(userId);

    return { message: 'Đổi mật khẩu thành công. Vui lòng đăng nhập lại.' };
  }

  async refresh(refreshToken: string) {
    const stored = await this.findValidRefreshToken(refreshToken);
    if (!stored) {
      throw new UnauthorizedException('Refresh token không hợp lệ hoặc đã hết hạn.');
    }

    const user = await this.usersService.findById(stored.userId.toString());
    if (!user || !user.isActive) {
      await this.revokeToken(stored._id);
      throw new UnauthorizedException('Tài khoản không hợp lệ.');
    }

    // Rotate: thu hồi token cũ, cấp cặp token mới
    await this.revokeToken(stored._id);
    const tokens = await this.issueTokens(user.id, user.roleAssignments);

    return {
      message: 'Làm mới token thành công.',
      data: tokens,
    };
  }

  async logout(refreshToken: string) {
    const tokenHash = this.hashToken(refreshToken);
    await this.refreshTokenModel.updateOne(
      { tokenHash, revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );

    return { message: 'Đăng xuất thành công.' };
  }

  /** Đăng xuất mọi thiết bị: xóa hết refresh token của user. */
  async logoutAll(userId: string) {
    await this.refreshTokenModel.deleteMany({
      userId: new Types.ObjectId(userId),
    });

    return { message: 'Đã đăng xuất khỏi tất cả thiết bị.' };
  }

  /** Job định kỳ: xóa các refresh token đã revoke. */
  async purgeRevokedTokens() {
    const result = await this.refreshTokenModel.deleteMany({
      revokedAt: { $ne: null },
    });

    if (result.deletedCount > 0) {
      this.logger.log(`Đã xóa ${result.deletedCount} refresh token đã revoke.`);
    }

    return result.deletedCount;
  }

  private async issueTokens(
    userId: string,
    roleAssignments: Array<{
      roleCode: string;
      scopeDepartmentId?: unknown;
    }> = [],
  ) {
    const role = roleAssignments.map((assignment) => ({
      roleCode: assignment.roleCode,
      scopeDepartmentId: assignment.scopeDepartmentId
        ? String(assignment.scopeDepartmentId)
        : null,
    }));

    const accessToken = await this.jwtService.signAsync({
      uid: userId,
      role,
    });

    const refreshToken = randomBytes(48).toString('hex');
    const tokenHash = this.hashToken(refreshToken);
    const expiresIn =
      this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d';
    const userObjectId = new Types.ObjectId(userId);

    await this.enforceTokenLimit(userObjectId);

    await this.refreshTokenModel.create({
      userId: userObjectId,
      tokenHash,
      expiresAt: this.resolveExpiryDate(expiresIn),
    });

    return { accessToken, refreshToken };
  }

  /**
   * Giữ tối đa MAX-1 token active trước khi tạo mới,
   * để sau khi create không vượt quá MAX_REFRESH_TOKENS_PER_USER.
   */
  private async enforceTokenLimit(userId: Types.ObjectId) {
    const activeTokens = await this.refreshTokenModel
      .find({
        userId,
        revokedAt: null,
        expiresAt: { $gt: new Date() },
      })
      .sort({ createdAt: 1 })
      .select('_id')
      .lean();

    const overflow = activeTokens.length - (MAX_REFRESH_TOKENS_PER_USER - 1);
    if (overflow <= 0) {
      return;
    }

    const idsToRemove = activeTokens
      .slice(0, overflow)
      .map((token) => token._id);

    await this.refreshTokenModel.deleteMany({ _id: { $in: idsToRemove } });
  }

  private async findValidRefreshToken(refreshToken: string) {
    const tokenHash = this.hashToken(refreshToken);
    const stored = await this.refreshTokenModel.findOne({
      tokenHash,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    });
    return stored;
  }

  private async revokeToken(id: Types.ObjectId) {
    await this.refreshTokenModel.updateOne(
      { _id: id },
      { $set: { revokedAt: new Date() } },
    );
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  /** Hỗ trợ dạng "15m", "1h", "7d" hoặc số giây. */
  private resolveExpiryDate(expiresIn: string): Date {
    const asSeconds = Number(expiresIn);
    if (!Number.isNaN(asSeconds) && expiresIn.trim() !== '') {
      return new Date(Date.now() + asSeconds * 1000);
    }

    const match = /^(\d+)([smhd])$/i.exec(expiresIn.trim());
    if (!match) {
      // fallback 7 ngày nếu cấu hình sai
      return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    }

    const value = Number(match[1]);
    const unit = match[2].toLowerCase();
    const multipliers: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };

    return new Date(Date.now() + value * multipliers[unit]);
  }
}
