import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { PermissionsGuard } from '@/common/guards/permissions.guard';
import type { JwtPayloadUser } from '@/common/interfaces/jwt-payload-user.interface';
import { JwtGuard } from '../auth/guards/jwt.guard';
import {
  DecideTeamReportDayDto,
  SaveTeamReportCommendationDto,
  TeamReportAdjustmentInboxQueryDto,
} from './dto/team-report.dto';
import { TeamReportCommendationService } from './team-report-commendation.service';

/**
 * Bảng đề xuất biểu dương, phê bình tháng của các phòng.
 *
 * KHÔNG gác mã quyền: ai lập / ai nhận suy từ luồng COMMENDATION - service
 * kiểm. Các route cố định ('access', 'incoming…') đứng TRÊN ':periodMonth'.
 */
@ApiTags('Team Report')
@ApiBearerAuth()
@UseGuards(JwtGuard, PermissionsGuard)
@Controller('team-report/commendations')
export class TeamReportCommendationController {
  constructor(private readonly service: TeamReportCommendationService) {}

  @ApiOperation({ summary: 'Tôi có được lập / nhận bảng biểu dương không' })
  @Get('access')
  async access(@CurrentUser() user: JwtPayloadUser) {
    return { message: 'OK', data: await this.service.access(user.uid) };
  }

  @ApiOperation({ summary: 'Bảng biểu dương, phê bình gửi tới tôi' })
  @Get('incoming')
  inbox(
    @CurrentUser() user: JwtPayloadUser,
    @Query() query: TeamReportAdjustmentInboxQueryDto,
  ) {
    return this.service.inbox(user.uid, query);
  }

  @ApiOperation({ summary: 'Mở một bảng biểu dương, phê bình gửi tới tôi' })
  @Get('incoming/:id')
  incomingDetail(@CurrentUser() user: JwtPayloadUser, @Param('id') id: string) {
    return this.service.incomingDetail(user.uid, id);
  }

  @ApiOperation({ summary: 'Duyệt / trả lại bảng biểu dương, phê bình' })
  @Post('incoming/:id/decide')
  decide(
    @CurrentUser() user: JwtPayloadUser,
    @Param('id') id: string,
    @Body() dto: DecideTeamReportDayDto,
  ) {
    return this.service.decide(user.uid, id, dto);
  }

  @ApiOperation({
    summary: 'Bảng biểu dương, phê bình của phòng tôi trong tháng',
  })
  @Get(':periodMonth')
  get(
    @CurrentUser() user: JwtPayloadUser,
    @Param('periodMonth') periodMonth: string,
  ) {
    return this.service.get(user.uid, periodMonth);
  }

  @ApiOperation({
    summary: 'Lưu bảng biểu dương, phê bình (nháp / bị trả lại)',
  })
  @Put(':periodMonth')
  save(
    @CurrentUser() user: JwtPayloadUser,
    @Param('periodMonth') periodMonth: string,
    @Body() dto: SaveTeamReportCommendationDto,
  ) {
    return this.service.save(user.uid, periodMonth, dto);
  }

  @ApiOperation({ summary: 'Gửi bảng theo luồng tới các đội Phòng Tham mưu' })
  @Post(':periodMonth/send')
  send(
    @CurrentUser() user: JwtPayloadUser,
    @Param('periodMonth') periodMonth: string,
  ) {
    return this.service.send(user.uid, periodMonth);
  }
}
