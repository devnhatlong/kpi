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
  SaveTeamReportAppraisalDto,
  SendTeamReportAppraisalDto,
  TeamReportAdjustmentInboxQueryDto,
} from './dto/team-report.dto';
import { TeamReportAppraisalService } from './team-report-appraisal.service';

/**
 * Phụ lục theo dõi, thẩm định tháng của các đội PV01.
 *
 * KHÔNG gác mã quyền: ai lập / ai nhận suy từ luồng APPRAISAL - service kiểm.
 * Các route cố định ('access', 'incoming…') đứng TRÊN ':periodMonth'.
 */
@ApiTags('Team Report')
@ApiBearerAuth()
@UseGuards(JwtGuard, PermissionsGuard)
@Controller('team-report/appraisals')
export class TeamReportAppraisalController {
  constructor(private readonly service: TeamReportAppraisalService) {}

  @ApiOperation({ summary: 'Tôi có được lập / nhận bảng thẩm định không' })
  @Get('access')
  async access(@CurrentUser() user: JwtPayloadUser) {
    return { message: 'OK', data: await this.service.access(user.uid) };
  }

  @ApiOperation({ summary: 'Các đơn vị thẩm định trình tới tôi' })
  @Get('incoming')
  inbox(
    @CurrentUser() user: JwtPayloadUser,
    @Query() query: TeamReportAdjustmentInboxQueryDto,
  ) {
    return this.service.inbox(user.uid, query);
  }

  @ApiOperation({
    summary:
      'Bảng duyệt: TOÀN BỘ đơn vị thẩm định trình tới tôi theo bộ lọc, đủ chi tiết',
  })
  @Get('incoming/board')
  board(
    @CurrentUser() user: JwtPayloadUser,
    @Query() query: TeamReportAdjustmentInboxQueryDto,
  ) {
    return this.service.board(user.uid, query);
  }

  @ApiOperation({
    summary:
      'Mở một đơn vị thẩm định trình tới tôi (:id = id đơn vị trong bảng)',
  })
  @Get('incoming/:id')
  incomingDetail(@CurrentUser() user: JwtPayloadUser, @Param('id') id: string) {
    return this.service.incomingDetail(user.uid, id);
  }

  @ApiOperation({ summary: 'Duyệt / trả lại một đơn vị thẩm định' })
  @Post('incoming/:id/decide')
  decide(
    @CurrentUser() user: JwtPayloadUser,
    @Param('id') id: string,
    @Body() dto: DecideTeamReportDayDto,
  ) {
    return this.service.decide(user.uid, id, dto);
  }

  @ApiOperation({ summary: 'Bảng thẩm định của đội tôi trong tháng' })
  @Get(':periodMonth')
  get(
    @CurrentUser() user: JwtPayloadUser,
    @Param('periodMonth') periodMonth: string,
  ) {
    return this.service.get(user.uid, periodMonth);
  }

  @ApiOperation({ summary: 'Lưu bảng thẩm định (nháp / bị trả lại)' })
  @Put(':periodMonth')
  save(
    @CurrentUser() user: JwtPayloadUser,
    @Param('periodMonth') periodMonth: string,
    @Body() dto: SaveTeamReportAppraisalDto,
  ) {
    return this.service.save(user.uid, periodMonth, dto);
  }

  @ApiOperation({ summary: 'Trình RIÊNG các đơn vị đã chọn theo luồng' })
  @Post(':periodMonth/send')
  send(
    @CurrentUser() user: JwtPayloadUser,
    @Param('periodMonth') periodMonth: string,
    @Body() dto: SendTeamReportAppraisalDto,
  ) {
    return this.service.send(user.uid, periodMonth, dto);
  }
}
