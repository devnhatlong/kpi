import { Body, Controller, Get, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Permissions } from '@/common/decorators/permissions.decorator';
import { Permission } from '@/common/enums/permission.enum';
import { PermissionsGuard } from '@/common/guards/permissions.guard';
import type { JwtPayloadUser } from '@/common/interfaces/jwt-payload-user.interface';
import { JwtGuard } from '../auth/guards/jwt.guard';
import {
  SaveTeamReportOverviewSettingsDto,
  TeamReportOverviewQueryDto,
} from './dto/team-report.dto';
import { TeamReportOverviewService } from './team-report-overview.service';

/**
 * Số liệu tổng hợp cho văn bản báo cáo.
 *
 * Route đọc số không gác mã quyền: ai đăng nhập cũng xem được, nhưng phạm vi
 * do service khoá (quản trị: toàn bộ; còn lại: đơn vị mình + cấp dưới).
 */
@ApiTags('Team Report')
@ApiBearerAuth()
@UseGuards(JwtGuard, PermissionsGuard)
@Controller('team-report/overview')
export class TeamReportOverviewController {
  constructor(private readonly overviewService: TeamReportOverviewService) {}

  @ApiOperation({ summary: 'Hạn trình báo cáo tháng (ngày 14 + N ngày)' })
  @Get('settings')
  settings() {
    return this.overviewService.settings();
  }

  @ApiOperation({ summary: 'Đặt hạn trình báo cáo tháng' })
  @Permissions(Permission.SYSTEM_CONFIG)
  @Put('settings')
  saveSettings(
    @CurrentUser() user: JwtPayloadUser,
    @Body() dto: SaveTeamReportOverviewSettingsDto,
  ) {
    return this.overviewService.saveSettings(user.uid, dto);
  }

  @ApiOperation({ summary: 'Số nhiệm vụ, báo cáo đã trình, tỷ lệ đúng hạn' })
  @Get()
  overview(
    @CurrentUser() user: JwtPayloadUser,
    @Query() query: TeamReportOverviewQueryDto,
  ) {
    return this.overviewService.overview(user.uid, query);
  }
}
