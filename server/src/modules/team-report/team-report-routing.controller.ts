import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Permissions } from '@/common/decorators/permissions.decorator';
import { Permission } from '@/common/enums/permission.enum';
import { PermissionsGuard } from '@/common/guards/permissions.guard';
import type { JwtPayloadUser } from '@/common/interfaces/jwt-payload-user.interface';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { SaveTeamReportAdjustmentRoutesDto } from './dto/team-report.dto';
import {
  TEAM_REPORT_ROUTE_KINDS,
  type TeamReportRouteKind,
} from './schemas/team-report-adjustment-route.schema';
import { TeamReportAdjustmentRoutingService } from './team-report-adjustment-routing.service';

/**
 * Luồng trình theo LOẠI báo cáo - quản trị đặt. 'summary' = báo cáo tổng
 * hợp, 'adjustment' = bảng điểm cộng / trừ / xếp loại. Mỗi loại một bộ luồng.
 */
@ApiTags('Team Report')
@ApiBearerAuth()
@UseGuards(JwtGuard, PermissionsGuard)
@Controller('team-report/routing')
export class TeamReportRoutingController {
  constructor(private readonly routing: TeamReportAdjustmentRoutingService) {}

  @ApiOperation({ summary: 'Các luồng trình của một loại báo cáo' })
  @Permissions(Permission.MISSION_MANAGE)
  @Get(':kind/routes')
  routes(@Param('kind') kind: string) {
    return this.routing.list(this.kindOf(kind));
  }

  @ApiOperation({
    summary: 'Thay toàn bộ luồng của một loại (thứ tự mảng = thứ tự xét)',
  })
  @Permissions(Permission.MISSION_MANAGE)
  @Put(':kind/routes')
  saveRoutes(
    @CurrentUser() user: JwtPayloadUser,
    @Param('kind') kind: string,
    @Body() dto: SaveTeamReportAdjustmentRoutesDto,
  ) {
    return this.routing.saveAll(this.kindOf(kind), user.uid, dto);
  }

  private kindOf(raw: string): TeamReportRouteKind {
    const kind = raw.toUpperCase() as TeamReportRouteKind;
    if (!TEAM_REPORT_ROUTE_KINDS.includes(kind)) {
      throw new BadRequestException('Loại báo cáo không hợp lệ.');
    }
    return kind;
  }
}
