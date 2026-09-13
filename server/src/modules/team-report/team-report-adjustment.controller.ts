import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Permissions } from '@/common/decorators/permissions.decorator';
import { Permission } from '@/common/enums/permission.enum';
import { PermissionsGuard } from '@/common/guards/permissions.guard';
import type { JwtPayloadUser } from '@/common/interfaces/jwt-payload-user.interface';
import { JwtGuard } from '../auth/guards/jwt.guard';
import {
  AddTeamReportAdjustmentEntryDto,
  DecideTeamReportDayDto,
  SaveTeamReportAdjustmentAccessDto,
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
 * Gác bằng mã quyền: ADJUSTMENT_ENTRY để nhập / trình, ADJUSTMENT_REVIEW để mở
 * hộp đến và duyệt. Luật "Phân quyền nhập" (vai trò / tài khoản / đơn vị) chỉ
 * THU HẸP thêm trên nền quyền - service kiểm bằng `assertAllowed`.
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
  @Permissions(Permission.ADJUSTMENT_REVIEW)
  @Get('incoming')
  inbox(
    @CurrentUser() user: JwtPayloadUser,
    @Query() query: TeamReportAdjustmentInboxQueryDto,
  ) {
    return this.service.inbox(user.uid, query);
  }

  @ApiOperation({ summary: 'Chi tiết một bản trình tới đơn vị tôi' })
  @Permissions(Permission.ADJUSTMENT_REVIEW)
  @Get('incoming/:id')
  incomingDetail(@CurrentUser() user: JwtPayloadUser, @Param('id') id: string) {
    return this.service.incomingDetail(user.uid, id);
  }

  @ApiOperation({ summary: 'Duyệt hoặc trả lại' })
  @Permissions(Permission.ADJUSTMENT_REVIEW)
  @Post('incoming/:id/decide')
  decide(
    @CurrentUser() user: JwtPayloadUser,
    @Param('id') id: string,
    @Body() dto: DecideTeamReportDayDto,
  ) {
    return this.service.decide(user.uid, id, dto);
  }

  @ApiOperation({ summary: 'Cấp trên chỉnh một dòng của bản đang chờ duyệt' })
  @Permissions(Permission.ADJUSTMENT_REVIEW)
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
  @Permissions(Permission.ADJUSTMENT_ENTRY)
  @Get('recipients')
  recipients(@CurrentUser() user: JwtPayloadUser, @Query('q') q?: string) {
    return this.service.recipients(user.uid, q);
  }

  @ApiOperation({ summary: 'Luật ai được nhập - quản trị đọc' })
  @Permissions(Permission.MISSION_MANAGE)
  @Get('access/rule')
  accessRule() {
    return this.accessService.rule();
  }

  @ApiOperation({ summary: 'Đặt ai được nhập: vai trò / tài khoản / đơn vị' })
  @Permissions(Permission.MISSION_MANAGE)
  @Put('access/rule')
  saveAccessRule(
    @CurrentUser() user: JwtPayloadUser,
    @Body() dto: SaveTeamReportAdjustmentAccessDto,
  ) {
    return this.accessService.save(user.uid, dto);
  }

  @ApiOperation({
    summary:
      'Bảng điểm cộng, trừ & xếp loại của một tháng, kèm danh mục soi chiếu',
  })
  @Permissions(Permission.ADJUSTMENT_ENTRY)
  @Get()
  sheet(
    @CurrentUser() user: JwtPayloadUser,
    @Query() query: TeamReportAdjustmentQueryDto,
  ) {
    return this.service.sheet(user.uid, query);
  }

  @ApiOperation({ summary: 'Trình bảng của tháng lên cấp trên đã chọn' })
  @Permissions(Permission.ADJUSTMENT_ENTRY)
  @Post(':periodMonth/send')
  send(
    @CurrentUser() user: JwtPayloadUser,
    @Param('periodMonth') periodMonth: string,
    @Body() dto: SendTeamReportAdjustmentDto,
  ) {
    return this.service.send(user.uid, periodMonth, dto);
  }

  @ApiOperation({ summary: 'Thêm một dòng kết quả dưới một mục' })
  @Permissions(Permission.ADJUSTMENT_ENTRY)
  @Post(':periodMonth/entries')
  add(
    @CurrentUser() user: JwtPayloadUser,
    @Param('periodMonth') periodMonth: string,
    @Body() dto: AddTeamReportAdjustmentEntryDto,
  ) {
    return this.service.addEntry(user.uid, periodMonth, dto);
  }

  @ApiOperation({ summary: 'Sửa một dòng' })
  @Permissions(Permission.ADJUSTMENT_ENTRY)
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
  @Permissions(Permission.ADJUSTMENT_ENTRY)
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
