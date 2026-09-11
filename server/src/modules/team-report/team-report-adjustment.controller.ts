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
  SaveTeamReportAdjustmentAccessDto,
  TeamReportAdjustmentQueryDto,
  UpdateTeamReportAdjustmentEntryDto,
} from './dto/team-report.dto';
import { TeamReportAdjustmentAccessService } from './team-report-adjustment-access.service';
import { TeamReportAdjustmentService } from './team-report-adjustment.service';

/**
 * Bảng điểm cộng / điểm trừ / xếp loại của đội - tháng một bản.
 *
 * KHÔNG gác bằng mã quyền cứng: ai được nhập do quản trị đặt (vai trò / tài
 * khoản / đơn vị), service kiểm bằng `assertAllowed`. Chỉ cần đăng nhập là tới
 * được đây; riêng hai route đọc / đặt luật thì gác MISSION_MANAGE.
 */
@ApiTags('Team Report')
@ApiBearerAuth()
@UseGuards(JwtGuard, PermissionsGuard)
@Controller('team-report/adjustments')
export class TeamReportAdjustmentController {
  constructor(
    private readonly service: TeamReportAdjustmentService,
    private readonly accessService: TeamReportAdjustmentAccessService,
  ) {}

  /* Các route 'access…' đứng TRÊN ':periodMonth/…' - Nest khớp theo thứ tự. */

  @ApiOperation({ summary: 'Tôi có được nhập bảng này không' })
  @Get('access')
  async access(@CurrentUser() user: JwtPayloadUser) {
    return { message: 'OK', data: await this.accessService.check(user.uid) };
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
  @Get()
  sheet(
    @CurrentUser() user: JwtPayloadUser,
    @Query() query: TeamReportAdjustmentQueryDto,
  ) {
    return this.service.sheet(user.uid, query);
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
