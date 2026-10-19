import { Strategy } from 'passport-local';
import { PassportStrategy } from '@nestjs/passport';
import { BadRequestException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { UsersService } from '@/modules/users/users.service';
import { User } from '@/modules/users/schemas/user.schema';
import { LoginThrottleService } from '../login-throttle.service';

/**
 * IP người đăng nhập - để ghi vết khi vào bằng mật khẩu thứ 2 và để đếm lần
 * đăng nhập sai. Server chạy sau Caddy (reverse proxy) nên IP thật nằm ở
 * X-Forwarded-For, còn `req.ip` chỉ là địa chỉ của Caddy.
 *
 * Lấy phần tử CUỐI chứ không phải đầu: client tự đặt được X-Forwarded-For,
 * Caddy chỉ NỐI THÊM IP thật vào cuối. Lấy phần tử đầu là để người đăng nhập
 * tự khai IP giả vào vết, và đổi IP mỗi lần để né bộ đếm đăng nhập sai.
 */
function clientIp(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    const raw = Array.isArray(forwarded) ? forwarded.join(',') : forwarded;
    const last = raw
        ?.split(',')
        .map((part) => part.trim())
        .filter(Boolean)
        .pop();
    return last || req.ip || req.socket?.remoteAddress || '';
}

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
    constructor(
        private usersService: UsersService,
        private throttle: LoginThrottleService,
    ) {
        super({ passReqToCallback: true });
    }

    async validate(
        req: Request,
        username: unknown,
        password: unknown,
    ): Promise<User> {
        if (typeof username !== 'string' || typeof password !== 'string') {
            throw new BadRequestException('Tài khoản hoặc mật khẩu không chính xác.');
        }

        const ip = clientIp(req);
        this.throttle.assertAllowed(username, ip);
        try {
            // Return cái gì thì passportjs sẽ gắn lên req.user
            const user = await this.usersService.validateUser(username, password, ip);
            this.throttle.recordSuccess(username, ip);
            return user;
        } catch (error) {
            this.throttle.recordFailure(username, ip);
            throw error;
        }
    }
}
