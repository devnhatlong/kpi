import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Permissions } from '@/common/decorators';
import { Permission } from '@/common/enums/permission.enum';
import { PermissionsGuard } from '@/common/guards/permissions.guard';
import { StringNotRequired } from '@/common/decorators';
import { JwtGuard } from './guards/jwt.guard';
import { LoginThrottleService } from './login-throttle.service';

export class UnlockLoginDto {
  @StringNotRequired('Đúng một khoá trong danh sách (trường key)')
  key?: string;

  @StringNotRequired('Mở mọi khoá của tài khoản này')
  username?: string;
}

/**
 * Quản trị xem và mở khoá đăng nhập tạm thời (đăng nhập sai quá nhiều lần),
 * khỏi bắt người dùng chờ hết 15 phút.
 */
@ApiTags('Auth')
@ApiBearerAuth()
@UseGuards(JwtGuard, PermissionsGuard)
@Permissions(Permission.USER_MANAGE)
@Controller('auth/login-locks')
export class LoginLocksController {
  constructor(private readonly throttle: LoginThrottleService) {}

  @ApiOperation({ summary: 'Các tài khoản / máy đang bị khoá đăng nhập' })
  @Get()
  list() {
    return { message: 'OK', data: this.throttle.listLocks() };
  }

  @ApiOperation({
    summary: 'Mở khoá: một khoá, mọi khoá của một tài khoản, hoặc tất cả',
  })
  @Post('unlock')
  unlock(@Body() dto: UnlockLoginDto) {
    const removed = this.throttle.unlock({
      key: dto.key?.trim() || undefined,
      username: dto.username?.trim() || undefined,
    });
    return { message: `Đã mở khoá (${removed} bộ đếm).`, data: { removed } };
  }
}
