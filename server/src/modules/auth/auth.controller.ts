import { Body, Controller, Get, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthsService } from './auth.service';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { JwtGuard } from './guards/jwt.guard';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateProfileDto } from '../users/dto/update-profile.dto';
import { CurrentUser } from '@/common/decorators';
import type { JwtPayloadUser } from '@/common/interfaces';

@ApiTags('Auth')
@Controller('auth')
export class AuthsController {
  constructor(private readonly authsService: AuthsService) {}

  @ApiOperation({ summary: 'Đăng nhập' })
  @UseGuards(LocalAuthGuard)
  @Post('login')
  login(@Req() req: any) {
    return this.authsService.login(req.user);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Thông tin người dùng hiện tại' })
  @UseGuards(JwtGuard)
  @Get('me')
  me(@CurrentUser() user: JwtPayloadUser) {
    return this.authsService.me(user.uid);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cập nhật hồ sơ của chính mình' })
  @UseGuards(JwtGuard)
  @Patch('me')
  updateMe(
    @CurrentUser() user: JwtPayloadUser,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.authsService.updateProfile(user.uid, dto);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Đổi mật khẩu của chính mình' })
  @UseGuards(JwtGuard)
  @Post('change-password')
  changePassword(
    @CurrentUser() user: JwtPayloadUser,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authsService.changePassword(user.uid, dto);
  }

  @ApiOperation({ summary: 'Làm mới access token' })
  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authsService.refresh(dto.refreshToken);
  }

  @ApiOperation({ summary: 'Đăng xuất thiết bị hiện tại' })
  @Post('logout')
  logout(@Body() dto: RefreshTokenDto) {
    return this.authsService.logout(dto.refreshToken);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Đăng xuất tất cả thiết bị' })
  @UseGuards(JwtGuard)
  @Post('logout-all')
  logoutAll(@CurrentUser() user: JwtPayloadUser) {
    return this.authsService.logoutAll(user.uid);
  }
}
