import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthsService } from './auth.service';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { JwtGuard } from './guards/jwt.guard';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateProfileDto } from '../users/dto/update-profile.dto';
import { CurrentUser } from '@/common/decorators';
import type { JwtPayloadUser } from '@/common/interfaces';
import {
  clearRefreshCookie,
  readRefreshCookie,
  setRefreshCookie,
} from './auth-cookie';

type IssuedTokens = {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
};

/**
 * Refresh token đi vào cookie HttpOnly, body chỉ còn access token - client
 * không bao giờ cầm refresh token trong tay (xem auth-cookie.ts).
 */
function withCookie(
  res: Response,
  result: { message: string; data: IssuedTokens },
) {
  setRefreshCookie(res, result.data.refreshToken, result.data.refreshExpiresAt);
  return {
    message: result.message,
    data: { accessToken: result.data.accessToken },
  };
}

@ApiTags('Auth')
@Controller('auth')
export class AuthsController {
  constructor(private readonly authsService: AuthsService) {}

  @ApiOperation({ summary: 'Đăng nhập' })
  @UseGuards(LocalAuthGuard)
  @Post('login')
  async login(
    @Req() req: Request & { user: Parameters<AuthsService['login']>[0] },
    @Res({ passthrough: true }) res: Response,
  ) {
    return withCookie(res, await this.authsService.login(req.user));
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Thông tin người dùng hiện tại' })
  @UseGuards(JwtGuard)
  @Get('me')
  me(@CurrentUser() user: JwtPayloadUser) {
    return this.authsService.me(user.uid, user.imp === true);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cập nhật hồ sơ của chính mình' })
  @UseGuards(JwtGuard)
  @Patch('me')
  updateMe(@CurrentUser() user: JwtPayloadUser, @Body() dto: UpdateProfileDto) {
    return this.authsService.updateProfile(user.uid, dto);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Đổi mật khẩu của chính mình' })
  @UseGuards(JwtGuard)
  @Post('change-password')
  async changePassword(
    @CurrentUser() user: JwtPayloadUser,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authsService.changePassword(user.uid, dto);
    clearRefreshCookie(res);
    return result;
  }

  /*
    Token lấy từ cookie. `refreshToken` trong body chỉ còn cho phiên cũ (token
    nằm trong localStorage từ trước khi đổi) - làm mới một lần là phiên đó
    chuyển sang cookie, không phải đăng nhập lại.
  */
  @ApiOperation({ summary: 'Làm mới access token' })
  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Body() dto: RefreshTokenDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = readRefreshCookie(req) ?? dto?.refreshToken ?? null;
    if (!token) {
      throw new UnauthorizedException('Phiên đăng nhập đã hết.');
    }
    try {
      return withCookie(res, await this.authsService.refresh(token));
    } catch (error) {
      clearRefreshCookie(res);
      throw error;
    }
  }

  @ApiOperation({ summary: 'Đăng xuất thiết bị hiện tại' })
  @Post('logout')
  async logout(
    @Req() req: Request,
    @Body() dto: RefreshTokenDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = readRefreshCookie(req) ?? dto?.refreshToken ?? null;
    clearRefreshCookie(res);
    return this.authsService.logout(token);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Đăng xuất tất cả thiết bị' })
  @UseGuards(JwtGuard)
  @Post('logout-all')
  async logoutAll(
    @CurrentUser() user: JwtPayloadUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    clearRefreshCookie(res);
    return this.authsService.logoutAll(user.uid);
  }
}
