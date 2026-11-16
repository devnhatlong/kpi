import {
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

import { CurrentUser } from '@/common/decorators/current-user.decorator';
import type { JwtPayloadUser } from '@/common/interfaces/jwt-payload-user.interface';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { NotificationsService } from './notifications.service';

export class NotificationListQueryDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ description: 'true = chỉ thông báo chưa đọc' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  unread?: boolean;
}

/**
 * Thông báo của CHÍNH tài khoản đang đăng nhập - không route nào đọc hay sửa
 * được thông báo của người khác (mọi truy vấn đều lọc theo `user.uid`).
 */
@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @ApiOperation({ summary: 'Thông báo của tôi, mới nhất trước' })
  @Get()
  list(
    @CurrentUser() user: JwtPayloadUser,
    @Query() query: NotificationListQueryDto,
  ) {
    return this.notificationsService.list(user.uid, query);
  }

  @ApiOperation({ summary: 'Số thông báo chưa đọc' })
  @Get('unread-count')
  unreadCount(@CurrentUser() user: JwtPayloadUser) {
    return this.notificationsService.unreadCount(user.uid);
  }

  @ApiOperation({ summary: 'Đánh dấu đã đọc hết' })
  @Post('read-all')
  markAllRead(@CurrentUser() user: JwtPayloadUser) {
    return this.notificationsService.markAllRead(user.uid);
  }

  @ApiOperation({ summary: 'Đánh dấu một thông báo đã đọc' })
  @Patch(':id/read')
  markRead(@CurrentUser() user: JwtPayloadUser, @Param('id') id: string) {
    return this.notificationsService.markRead(user.uid, id);
  }
}
