import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { PermissionsGuard } from '@/common/guards/permissions.guard';
import type { JwtPayloadUser } from '@/common/interfaces/jwt-payload-user.interface';
import { JwtGuard } from '../auth/guards/jwt.guard';
import {
  AddTeamReportAdjustmentEntryDto,
  DecideTeamReportDayDto,
  SendTeamReportAdjustmentDto,
  TeamReportAdjustmentInboxQueryDto,
  TeamReportAdjustmentQueryDto,
  UpdateTeamReportAdjustmentEntryDto,
} from './dto/team-report.dto';
import { TeamReportAdjustmentAccessService } from './team-report-adjustment-access.service';
import { TeamReportAdjustmentService } from './team-report-adjustment.service';
import { TeamReportService } from './team-report.service';

/**
 * Bảng điểm cộng / điểm trừ / xếp loại của đội - tháng một bản.
 *
 * KHÔNG gác mã quyền: ai nhập / ai nhận suy từ LUỒNG TRÌNH (vế "ai gửi" /
 * "gửi cho ai") - service kiểm bằng `assertAllowed` / `assertCanReceive`.
 * Chưa có luồng thì không ai vào được (trừ quản trị hệ thống).
 */
@ApiTags('Team Report')
@ApiBearerAuth()
@UseGuards(JwtGuard, PermissionsGuard)
@Controller('team-report/adjustments')
export class TeamReportAdjustmentController {
  constructor(
    private readonly service: TeamReportAdjustmentService,
    private readonly accessService: TeamReportAdjustmentAccessService,
    private readonly teamReportService: TeamReportService,
  ) {}

  /* Các route 'access…' đứng TRÊN ':periodMonth/…' - Nest khớp theo thứ tự. */

  @ApiOperation({ summary: 'Tôi có được nhập bảng này không' })
  @Get('access')
  async access(@CurrentUser() user: JwtPayloadUser) {
    const [entry, canReceive, canReceiveSummary] = await Promise.all([
      this.accessService.check(user.uid),
      this.accessService.canReceive(user.uid),
      this.teamReportService.canReceiveSummary(user.uid),
    ]);
    return {
      message: 'OK',
      data: { ...entry, canReceive, canReceiveSummary },
    };
  }

  /*
    Đường của NGƯỜI NHẬN, đứng trên ':periodMonth/…'. Không gác mã quyền: ai
    được nhận do luồng trình quản trị đặt (có thể là các đội, không có quyền
    duyệt) - service kiểm bằng `assertCanReceive` + `requireIncoming`.
  */

  @ApiOperation({
    summary: 'Bảng điểm cộng / trừ các đội trình lên đơn vị tôi',
  })
  @Get('incoming')
  inbox(
    @CurrentUser() user: JwtPayloadUser,
    @Query() query: TeamReportAdjustmentInboxQueryDto,
  ) {
    return this.service.inbox(user.uid, query);
  }

  @ApiOperation({ summary: 'Chi tiết một bản trình tới đơn vị tôi' })
  @Get('incoming/:id')
  incomingDetail(@CurrentUser() user: JwtPayloadUser, @Param('id') id: string) {
    return this.service.incomingDetail(user.uid, id);
  }

  @ApiOperation({ summary: 'Duyệt hoặc trả lại' })
  @Post('incoming/:id/decide')
  decide(
    @CurrentUser() user: JwtPayloadUser,
    @Param('id') id: string,
    @Body() dto: DecideTeamReportDayDto,
  ) {
    return this.service.decide(user.uid, id, dto);
  }

  @ApiOperation({ summary: 'Cấp trên chỉnh một dòng của bản đang chờ duyệt' })
  @Patch('incoming/:id/entries/:entryId')
  reviewEntry(
    @CurrentUser() user: JwtPayloadUser,
    @Param('id') id: string,
    @Param('entryId') entryId: string,
    @Body() dto: UpdateTeamReportAdjustmentEntryDto,
  ) {
    return this.service.reviewEntry(user.uid, id, entryId, dto);
  }

  @ApiOperation({ summary: 'Tôi được trình bảng này tới ai' })
  @Get('recipients')
  recipients(@CurrentUser() user: JwtPayloadUser, @Query('q') q?: string) {
    return this.service.recipients(user.uid, q);
  }

  @ApiOperation({
    summary:
      'Bảng điểm cộng, trừ & xếp loại của một tháng, kèm danh mục soi chiếu',
  })
  @Get()
  sheet(
    @CurrentUser() user: JwtPayloadUser,
    @Query() query: TeamReportAdjustmentQueryDto,
  ) {
    return this.service.sheet(user.uid, query);
  }

  @ApiOperation({ summary: 'Trình bảng của tháng lên cấp trên đã chọn' })
  @Post(':periodMonth/send')
  send(
    @CurrentUser() user: JwtPayloadUser,
    @Param('periodMonth') periodMonth: string,
    @Body() dto: SendTeamReportAdjustmentDto,
  ) {
    return this.service.send(user.uid, periodMonth, dto);
  }

  @ApiOperation({ summary: 'Thêm một dòng kết quả dưới một mục' })
  @Post(':periodMonth/entries')
  add(
    @CurrentUser() user: JwtPayloadUser,
    @Param('periodMonth') periodMonth: string,
    @Body() dto: AddTeamReportAdjustmentEntryDto,
  ) {
    return this.service.addEntry(user.uid, periodMonth, dto);
  }

  @ApiOperation({ summary: 'Sửa một dòng' })
  @Patch(':periodMonth/entries/:entryId')
  update(
    @CurrentUser() user: JwtPayloadUser,
    @Param('periodMonth') periodMonth: string,
    @Param('entryId') entryId: string,
    @Body() dto: UpdateTeamReportAdjustmentEntryDto,
  ) {
    return this.service.updateEntry(user.uid, periodMonth, entryId, dto);
  }

  @ApiOperation({ summary: 'Xoá một dòng' })
  @Delete(':periodMonth/entries/:entryId')
  remove(
    @CurrentUser() user: JwtPayloadUser,
    @Param('periodMonth') periodMonth: string,
    @Param('entryId') entryId: string,
    @Query('version') version: string,
  ) {
    return this.service.removeEntry(
      user.uid,
      periodMonth,
      entryId,
      Number(version ?? 0),
    );
  }
}
