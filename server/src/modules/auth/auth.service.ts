import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { createHash, randomBytes } from 'crypto';
import { Model, Types } from 'mongoose';

import { UsersService } from '../users/users.service';
import { UserDocument } from '../users/schemas/user.schema';
import {
  RefreshToken,
  RefreshTokenDocument,
} from './schemas/refresh-token.schema';

@Injectable()
export class AuthsService {
  constructor(
    private readonly usersService: UsersService,
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
      ...tokens,
    };
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
      ...tokens,
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

  private async issueTokens(userId: string, roleAssignments: unknown) {
    const accessToken = await this.jwtService.signAsync({
      uid: userId,
      role: roleAssignments,
    });

    const refreshToken = randomBytes(48).toString('hex');
    const tokenHash = this.hashToken(refreshToken);
    const expiresIn =
      this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d';

    await this.refreshTokenModel.create({
      userId: new Types.ObjectId(userId),
      tokenHash,
      expiresAt: this.resolveExpiryDate(expiresIn),
    });

    return { accessToken, refreshToken };
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
