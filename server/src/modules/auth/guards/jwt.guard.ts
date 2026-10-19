import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtGuard extends AuthGuard('jwt') {
    // Custom ghi đè hàm handleRequest trong AuthGuard
    handleRequest(err: any, user: any, info: any) {
        // 403 "phải đổi mật khẩu" giữ nguyên: đổi thành 401 thì client tưởng
        // token hết hạn, làm mới rồi gọi lại, vòng mãi rồi đá ra trang đăng nhập.
        if (err instanceof ForbiddenException) throw err;
        if (err) throw new UnauthorizedException("Bạn không có quyền truy cập.");

        if (!user) {
            if (info?.name === 'JsonWebTokenError') throw new UnauthorizedException("Token không hợp lệ.");
            else if (info?.name === 'TokenExpiredError') throw new UnauthorizedException("Token hết hạn.");
            else throw new UnauthorizedException("Bạn không có quyền truy cập.");
        }

        return user;
    }
}
