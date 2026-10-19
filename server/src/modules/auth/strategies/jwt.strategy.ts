import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { JwtPayloadUser } from '@/common/interfaces/jwt-payload-user.interface';
import { UsersService } from '@/modules/users/users.service';
import { PASSWORD_CHANGE_ALLOWED_PATHS } from '../password-policy';

/** Mã lỗi để client nhận ra 403 này là "phải đổi mật khẩu", không phải thiếu quyền. */
export const PASSWORD_CHANGE_REQUIRED = 'PASSWORD_CHANGE_REQUIRED';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') as string,
      passReqToCallback: true,
    });
  }

  /**
   * Đọc lại tài khoản từ CSDL ở MỖI request thay vì tin bản chụp trong token:
   * khoá tài khoản hay gỡ vai trò phải có hiệu lực ngay, không đợi token hết
   * hạn (JWT_EXPIRES_IN, thường 1 giờ).
   */
  async validate(
    req: Request,
    payload: { uid: string; imp?: boolean },
  ): Promise<JwtPayloadUser> {
    const user = await this.usersService.findAuthState(payload.uid);
    if (!user || !user.isActive) {
      throw new UnauthorizedException(
        'Tài khoản không hợp lệ hoặc đã bị khoá.',
      );
    }

    const imp = payload.imp === true;
    if (user.mustChangePassword && !imp && !isPasswordChangeAllowed(req)) {
      throw new ForbiddenException({
        message: 'Bạn cần đổi mật khẩu mặc định trước khi tiếp tục.',
        code: PASSWORD_CHANGE_REQUIRED,
      });
    }

    return {
      uid: payload.uid,
      role: (user.roleAssignments ?? []).map((assignment) => ({
        roleCode: assignment.roleCode,
        scopeDepartmentId: assignment.scopeDepartmentId
          ? String(assignment.scopeDepartmentId)
          : null,
      })),
      imp,
    };
  }
}

function isPasswordChangeAllowed(req: Request): boolean {
  const path = (req.originalUrl || req.url || '').split('?')[0];
  return PASSWORD_CHANGE_ALLOWED_PATHS.some((allowed) =>
    path.endsWith(allowed),
  );
}
