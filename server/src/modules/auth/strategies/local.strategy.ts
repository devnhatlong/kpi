import { Strategy } from 'passport-local';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { UsersService } from '@/modules/users/users.service';
import { User } from '@/modules/users/schemas/user.schema';

/**
 * IP người đăng nhập - để ghi vết khi vào bằng mật khẩu thứ 2. Server chạy
 * sau Caddy (reverse proxy) nên IP thật nằm ở X-Forwarded-For, còn
 * `req.ip` chỉ là địa chỉ của Caddy.
 */
function clientIp(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)
        ?.split(',')[0]
        ?.trim();
    return first || req.ip || req.socket?.remoteAddress || '';
}

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
    constructor(private usersService: UsersService) {
        super({ passReqToCallback: true });
    }

    async validate(
        req: Request,
        username: string,
        password: string,
    ): Promise<User> {
        // Return cái gì thì passportjs sẽ gắn lên req.user
        return await this.usersService.validateUser(
            username,
            password,
            clientIp(req),
        );
    }
}
