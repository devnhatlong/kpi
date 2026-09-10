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
import { Permissions } from '@/common/decorators/permissions.decorator';
import { Permission } from '@/common/enums/permission.enum';
import { PermissionsGuard } from '@/common/guards/permissions.guard';
import type { JwtPayloadUser } from '@/common/interfaces/jwt-payload-user.interface';
import { JwtGuard } from '../auth/guards/jwt.guard';
import {
  ChangeTeamReportSummaryTasksDto,
  CreateTeamReportSummaryDto,
  EditTeamReportSummaryDto,
  PreviewTeamReportSummaryDto,
  SendTeamReportSummaryDto,
  TeamReportSummaryCandidatesQueryDto,
  TeamReportSummaryListQueryDto,
} from './dto/team-report.dto';
import { TeamReportService } from './team-report.service';

/**
 * Báo cáo tổng hợp của CẤP TRÊN: phòng gộp việc của các đội rồi trình lên tỉnh.
 *
 * Vì sao là một controller riêng chứ không thêm quyền vào các route sẵn có:
 * `PermissionsGuard` đòi ĐỦ mọi quyền khai trên route, nên một route gắn cả
 * ENTRY lẫn REVIEW sẽ chặn cả hai bên - đội không có REVIEW, phòng không có
 * ENTRY. Hai đường vào, mỗi đường một quyền.
 *
 * Nghiệp vụ thì DÙNG CHUNG y hệt: cùng service, cùng collection, cùng luật
 * trạng thái. Khác biệt duy nhất nằm ở phạm vi lấy nhiệm vụ, mà cái đó service
 * tự suy từ cây đơn vị (`scopeDepartmentIds`) chứ không hỏi vai trò - đội không
 * có đơn vị con nên phạm vi thu về đúng đội đó, phòng thì trải ra cả các đội.
 *
 * Nhờ vậy bản của phòng đi tiếp lên tỉnh bằng đúng đường của bản đội: tỉnh mở ở
 * 'summary/incoming', duyệt ở 'summary/:id/decide', chỉnh ở 'summary/:id/review'.
 */
@ApiTags('Team Report')
@ApiBearerAuth()
@UseGuards(JwtGuard, PermissionsGuard)
@Controller('team-report/unit-summary')
export class TeamReportUnitSummaryController {
  constructor(private readonly teamReportService: TeamReportService) {}

  /* Route cụ thể đứng TRÊN ':id' - Nest khớp theo thứ tự khai báo. */

  @ApiOperation({ summary: 'Nhiệm vụ của các đội, để phòng tích chọn' })
  @Permissions(Permission.TEAM_REPORT_REVIEW)
  @Get('candidates')
  candidates(
    @CurrentUser() user: JwtPayloadUser,
    @Query() query: TeamReportSummaryCandidatesQueryDto,
  ) {
    return this.teamReportService.summaryCandidates(user.uid, query);
  }

  @ApiOperation({ summary: 'Cấp trên của phòng - thường là tỉnh' })
  @Permissions(Permission.TEAM_REPORT_REVIEW)
  @Get('recipients')
  recipients(@CurrentUser() user: JwtPayloadUser, @Query('q') q?: string) {
    return this.teamReportService.summaryRecipients(user.uid, q);
  }

  @ApiOperation({ summary: 'Xem trước điểm của tập nhiệm vụ đang tích' })
  @Permissions(Permission.TEAM_REPORT_REVIEW)
  @Post('preview')
  preview(
    @CurrentUser() user: JwtPayloadUser,
    @Body() dto: PreviewTeamReportSummaryDto,
  ) {
    return this.teamReportService.previewSummaryScore(user.uid, dto);
  }

  @ApiOperation({ summary: 'Phòng lập một bản tổng hợp (nháp)' })
  @Permissions(Permission.TEAM_REPORT_REVIEW)
  @Post()
  create(
    @CurrentUser() user: JwtPayloadUser,
    @Body() dto: CreateTeamReportSummaryDto,
  ) {
    return this.teamReportService.createSummary(user.uid, dto);
  }

  @ApiOperation({ summary: 'Bản tổng hợp phòng đã lập' })
  @Permissions(Permission.TEAM_REPORT_REVIEW)
  @Get()
  list(
    @CurrentUser() user: JwtPayloadUser,
    @Query() query: TeamReportSummaryListQueryDto,
  ) {
    return this.teamReportService.listSummaries(user.uid, query);
  }

  @ApiOperation({ summary: 'Phòng chấm lại một dòng trên bản của mình' })
  @Permissions(Permission.TEAM_REPORT_REVIEW)
  @Patch(':id/rows')
  editRows(
    @CurrentUser() user: JwtPayloadUser,
    @Param('id') id: string,
    @Body() dto: EditTeamReportSummaryDto,
  ) {
    return this.teamReportService.editSummaryRows(user.uid, id, dto);
  }

  @ApiOperation({ summary: 'Phòng thêm / bớt nhiệm vụ của bản mình lập' })
  @Permissions(Permission.TEAM_REPORT_REVIEW)
  @Patch(':id/tasks')
  changeTasks(
    @CurrentUser() user: JwtPayloadUser,
    @Param('id') id: string,
    @Body() dto: ChangeTeamReportSummaryTasksDto,
  ) {
    return this.teamReportService.changeSummaryTasks(user.uid, id, dto);
  }

  @ApiOperation({ summary: 'Trình bản tổng hợp của phòng lên cấp trên' })
  @Permissions(Permission.TEAM_REPORT_REVIEW)
  @Post(':id/send')
  send(
    @CurrentUser() user: JwtPayloadUser,
    @Param('id') id: string,
    @Body() dto: SendTeamReportSummaryDto,
  ) {
    return this.teamReportService.sendSummary(user.uid, id, dto);
  }

  @ApiOperation({ summary: 'Chi tiết một bản tổng hợp của phòng' })
  @Permissions(Permission.TEAM_REPORT_REVIEW)
  @Get(':id')
  detail(@CurrentUser() user: JwtPayloadUser, @Param('id') id: string) {
    return this.teamReportService.summaryDetail(user.uid, id);
  }

  @ApiOperation({ summary: 'Xoá một bản tổng hợp còn nháp của phòng' })
  @Permissions(Permission.TEAM_REPORT_REVIEW)
  @Delete(':id')
  remove(@CurrentUser() user: JwtPayloadUser, @Param('id') id: string) {
    return this.teamReportService.deleteSummary(user.uid, id);
  }
}
