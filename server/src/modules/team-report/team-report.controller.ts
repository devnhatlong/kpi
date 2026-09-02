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
  ClassifyTeamReportTaskDto,
  CloseTeamReportTaskDto,
  CreateTeamReportTaskDto,
  DecideTeamReportDayDto,
  PromoteTeamReportDto,
  ReviewTeamReportDayDto,
  SubmitTeamReportDayDto,
  TeamReportClassifyQueryDto,
  TeamReportInboxQueryDto,
  TeamReportSheetQueryDto,
  UpdateTeamReportTaskDto,
} from './dto/team-report.dto';
import { TeamReportService } from './team-report.service';

@ApiTags('Team Report')
@ApiBearerAuth()
@UseGuards(JwtGuard, PermissionsGuard)
@Controller('team-report')
export class TeamReportController {
  constructor(private readonly teamReportService: TeamReportService) {}

  // ------------------------------------------------ giai đoạn 1: nhập thô

  @ApiOperation({ summary: 'Bảng nhập của đội cho một ngày' })
  @Permissions(Permission.TEAM_REPORT_ENTRY)
  @Get('sheet')
  sheet(
    @CurrentUser() user: JwtPayloadUser,
    @Query() query: TeamReportSheetQueryDto,
  ) {
    return this.teamReportService.sheet(user.uid, query);
  }

  @ApiOperation({ summary: 'Thêm một nhiệm vụ vào bảng' })
  @Permissions(Permission.TEAM_REPORT_ENTRY)
  @Post('tasks')
  createTask(
    @CurrentUser() user: JwtPayloadUser,
    @Body() dto: CreateTeamReportTaskDto,
  ) {
    return this.teamReportService.createTask(user.uid, dto);
  }

  /*
    Ba route dưới đây đứng TRÊN mọi route có ':id' khác cùng dạng - Nest khớp
    theo thứ tự khai báo. Ở đây không có xung đột vì tất cả đều nằm dưới
    'tasks/:id', nhưng giữ thói quen xếp cụ thể trước, tổng quát sau.
  */

  @ApiOperation({ summary: 'Sửa một nhiệm vụ (giai đoạn 1)' })
  @Permissions(Permission.TEAM_REPORT_ENTRY)
  @Patch('tasks/:id')
  updateTask(
    @CurrentUser() user: JwtPayloadUser,
    @Param('id') id: string,
    @Body() dto: UpdateTeamReportTaskDto,
  ) {
    return this.teamReportService.updateTask(user.uid, id, dto);
  }

  @ApiOperation({ summary: 'Phân loại và chấm một nhiệm vụ (giai đoạn 2)' })
  @Permissions(Permission.TEAM_REPORT_ENTRY)
  @Patch('tasks/:id/classify')
  classifyTask(
    @CurrentUser() user: JwtPayloadUser,
    @Param('id') id: string,
    @Body() dto: ClassifyTeamReportTaskDto,
  ) {
    return this.teamReportService.classifyTask(user.uid, id, dto);
  }

  @ApiOperation({ summary: 'Dừng một nhiệm vụ giữa chừng' })
  @Permissions(Permission.TEAM_REPORT_ENTRY)
  @Patch('tasks/:id/close')
  closeTask(
    @CurrentUser() user: JwtPayloadUser,
    @Param('id') id: string,
    @Body() dto: CloseTeamReportTaskDto,
  ) {
    return this.teamReportService.closeTask(user.uid, id, dto);
  }

  @ApiOperation({ summary: 'Xoá một nhiệm vụ chưa từng gửi đi' })
  @Permissions(Permission.TEAM_REPORT_ENTRY)
  @Delete('tasks/:id')
  deleteTask(@CurrentUser() user: JwtPayloadUser, @Param('id') id: string) {
    return this.teamReportService.deleteTask(user.uid, id);
  }

  // ------------------------------------------------ giai đoạn 2: phân loại

  @ApiOperation({ summary: 'Bảng phân loại, kèm danh mục nội dung công việc' })
  @Permissions(Permission.TEAM_REPORT_ENTRY)
  @Get('classify')
  classifyBoard(
    @CurrentUser() user: JwtPayloadUser,
    @Query() query: TeamReportClassifyQueryDto,
  ) {
    return this.teamReportService.classifyBoard(user.uid, query);
  }

  @ApiOperation({ summary: 'Gửi báo cáo ngày lên cấp trên' })
  @Permissions(Permission.TEAM_REPORT_ENTRY)
  @Post('days/submit')
  submitDay(
    @CurrentUser() user: JwtPayloadUser,
    @Body() dto: SubmitTeamReportDayDto,
  ) {
    return this.teamReportService.submitDay(user.uid, dto);
  }

  // ------------------------------------------------------ cấp trên duyệt

  @ApiOperation({ summary: 'Báo cáo các đội gửi lên đơn vị của tôi' })
  @Permissions(Permission.TEAM_REPORT_REVIEW)
  @Get('incoming')
  inbox(
    @CurrentUser() user: JwtPayloadUser,
    @Query() query: TeamReportInboxQueryDto,
  ) {
    return this.teamReportService.inbox(user.uid, query);
  }

  @ApiOperation({ summary: 'Bản gộp các phòng trình lên' })
  @Permissions(Permission.TEAM_REPORT_REVIEW)
  @Get('incoming/units')
  unitInbox(
    @CurrentUser() user: JwtPayloadUser,
    @Query() query: TeamReportInboxQueryDto,
  ) {
    return this.teamReportService.unitInbox(user.uid, query);
  }

  @ApiOperation({ summary: 'Gộp báo cáo các đội đã duyệt, trình lên cấp trên' })
  @Permissions(Permission.TEAM_REPORT_REVIEW)
  @Post('promote')
  promote(
    @CurrentUser() user: JwtPayloadUser,
    @Body() dto: PromoteTeamReportDto,
  ) {
    return this.teamReportService.promote(user.uid, dto);
  }

  @ApiOperation({ summary: 'Chi tiết một báo cáo ngày' })
  @Permissions(Permission.TEAM_REPORT_REVIEW)
  @Get('days/:id')
  dayDetail(@CurrentUser() user: JwtPayloadUser, @Param('id') id: string) {
    return this.teamReportService.dayDetail(user.uid, id);
  }

  @ApiOperation({ summary: 'Chỉnh số trên báo cáo đã nhận' })
  @Permissions(Permission.TEAM_REPORT_REVIEW)
  @Patch('days/:id/review')
  reviewEdit(
    @CurrentUser() user: JwtPayloadUser,
    @Param('id') id: string,
    @Body() dto: ReviewTeamReportDayDto,
  ) {
    return this.teamReportService.reviewEdit(user.uid, id, dto);
  }

  @ApiOperation({ summary: 'Duyệt hoặc trả lại một báo cáo ngày' })
  @Permissions(Permission.TEAM_REPORT_REVIEW)
  @Post('days/:id/decide')
  decideDay(
    @CurrentUser() user: JwtPayloadUser,
    @Param('id') id: string,
    @Body() dto: DecideTeamReportDayDto,
  ) {
    return this.teamReportService.decideDay(user.uid, id, dto);
  }
}
