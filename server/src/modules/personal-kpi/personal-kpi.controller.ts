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
import { CurrentUser, Permissions } from '@/common/decorators';
import { Permission } from '@/common/enums/permission.enum';
import { PermissionsGuard } from '@/common/guards/permissions.guard';
import type { JwtPayloadUser } from '@/common/interfaces/jwt-payload-user.interface';
import { JwtGuard } from '../auth/guards/jwt.guard';
import {
  CreatePersonalKpiBatchDto,
  ForwardPersonalKpiDto,
  PersonalKpiBoardQueryDto,
  PersonalKpiListQueryDto,
  PersonalKpiReportsQueryDto,
  PersonalKpiStatisticsQueryDto,
  ReviewPersonalKpiDto,
  ReviewerEditPersonalKpiDto,
  SubmitPersonalKpiDto,
  UpdatePersonalKpiDto,
} from './dto/personal-kpi.dto';
import { PersonalKpiService } from './personal-kpi.service';

@ApiTags('Personal KPI')
@ApiBearerAuth()
@UseGuards(JwtGuard, PermissionsGuard)
@Controller('personal-kpi')
export class PersonalKpiController {
  constructor(private readonly personalKpiService: PersonalKpiService) {}

  // ------------------------------------------------------------ cán bộ nhập

  @ApiOperation({ summary: 'Tạo nhiều nhiệm vụ nháp KPI cá nhân' })
  @Permissions(Permission.EVALUATION_SELF)
  @Post('batch')
  createBatch(
    @CurrentUser() user: JwtPayloadUser,
    @Body() dto: CreatePersonalKpiBatchDto,
  ) {
    return this.personalKpiService.createMany(user.uid, dto);
  }

  @ApiOperation({ summary: 'Tóm tắt KPI cá nhân cho dashboard' })
  @Permissions(Permission.EVALUATION_SELF)
  @Get('summary')
  summary(@CurrentUser() user: JwtPayloadUser) {
    return this.personalKpiService.getDashboardSummary(user.uid);
  }

  @ApiOperation({ summary: 'Số liệu cho trang Thống kê' })
  @Permissions(Permission.EVALUATION_SELF)
  @Get('statistics')
  statistics(
    @CurrentUser() user: JwtPayloadUser,
    @Query() query: PersonalKpiStatisticsQueryDto,
  ) {
    return this.personalKpiService.statistics(user.uid, query);
  }

  @ApiOperation({ summary: 'Danh sách báo cáo theo ngày của tôi' })
  @Permissions(Permission.EVALUATION_SELF)
  @Get('reports')
  reports(
    @CurrentUser() user: JwtPayloadUser,
    @Query() query: PersonalKpiReportsQueryDto,
  ) {
    return this.personalKpiService.findReports(user.uid, query);
  }

  @ApiOperation({ summary: 'Cấp trên nhận được báo cáo của tôi' })
  @Permissions(Permission.EVALUATION_SELF)
  @Get('recipients')
  recipients(
    @CurrentUser() user: JwtPayloadUser,
    @Query('q') q?: string,
  ) {
    return this.personalKpiService.listRecipients(user.uid, q);
  }

  @ApiOperation({ summary: 'Nhiệm vụ KPI cá nhân của tôi' })
  @Permissions(Permission.EVALUATION_SELF)
  @Get('mine')
  mine(
    @CurrentUser() user: JwtPayloadUser,
    @Query() query: PersonalKpiListQueryDto,
  ) {
    return this.personalKpiService.findMine(user.uid, query);
  }

  @ApiOperation({ summary: 'Gửi báo cáo ngày lên cấp trên' })
  @Permissions(Permission.EVALUATION_SELF)
  @Post('reports/:reportDate/submit')
  submit(
    @CurrentUser() user: JwtPayloadUser,
    @Param('reportDate') reportDate: string,
    @Body() dto: SubmitPersonalKpiDto,
  ) {
    return this.personalKpiService.submit(user.uid, reportDate, dto);
  }

  // ----------------------------------------------------------- cấp trên duyệt

  @ApiOperation({
    summary: 'Bảng tổng theo trục - nhiệm vụ đang nằm ở chỗ tôi',
  })
  @Permissions(Permission.EVALUATION_APPROVE)
  @Get('board')
  board(
    @CurrentUser() user: JwtPayloadUser,
    @Query() query: PersonalKpiBoardQueryDto,
  ) {
    return this.personalKpiService.board(user.uid, query);
  }

  @ApiOperation({ summary: 'Các lượt gửi đến tôi' })
  @Permissions(Permission.EVALUATION_APPROVE)
  @Get('submissions')
  submissions(
    @CurrentUser() user: JwtPayloadUser,
    @Query() query: PersonalKpiReportsQueryDto,
  ) {
    return this.personalKpiService.inboxSubmissions(user.uid, query);
  }

  @ApiOperation({ summary: 'Duyệt hoặc trả lại các nhiệm vụ đã tích' })
  @Permissions(Permission.EVALUATION_APPROVE)
  @Post('review')
  review(
    @CurrentUser() user: JwtPayloadUser,
    @Body() dto: ReviewPersonalKpiDto,
  ) {
    return this.personalKpiService.review(user.uid, dto);
  }

  @ApiOperation({ summary: 'Gửi tiếp các nhiệm vụ đã duyệt lên cấp trên' })
  @Permissions(Permission.EVALUATION_APPROVE)
  @Post('forward')
  forward(
    @CurrentUser() user: JwtPayloadUser,
    @Body() dto: ForwardPersonalKpiDto,
  ) {
    return this.personalKpiService.forward(user.uid, dto);
  }

  @ApiOperation({ summary: 'Cấp trên sửa nội dung nhiệm vụ (có lưu vết)' })
  @Permissions(Permission.EVALUATION_APPROVE)
  @Patch(':id/reviewer-edit')
  reviewerEdit(
    @CurrentUser() user: JwtPayloadUser,
    @Param('id') id: string,
    @Body() dto: ReviewerEditPersonalKpiDto,
  ) {
    return this.personalKpiService.reviewerEdit(user.uid, id, dto);
  }

  // -------------------------------------------------------------- dùng chung

  @ApiOperation({ summary: 'Lịch sử một nhiệm vụ: lượt gửi và lần sửa' })
  @Permissions(Permission.EVALUATION_SELF)
  @Get(':id/history')
  history(@CurrentUser() user: JwtPayloadUser, @Param('id') id: string) {
    return this.personalKpiService.history(user.uid, id);
  }

  @ApiOperation({ summary: 'Chi tiết nhiệm vụ của tôi' })
  @Permissions(Permission.EVALUATION_SELF)
  @Get(':id')
  findOne(@CurrentUser() user: JwtPayloadUser, @Param('id') id: string) {
    return this.personalKpiService.findOne(user.uid, id);
  }

  @ApiOperation({ summary: 'Sửa nhiệm vụ nháp / bị trả lại của tôi' })
  @Permissions(Permission.EVALUATION_SELF)
  @Patch(':id')
  update(
    @CurrentUser() user: JwtPayloadUser,
    @Param('id') id: string,
    @Body() dto: UpdatePersonalKpiDto,
  ) {
    return this.personalKpiService.update(user.uid, id, dto);
  }

  @ApiOperation({ summary: 'Xoá nhiệm vụ chưa gửi' })
  @Permissions(Permission.EVALUATION_SELF)
  @Delete(':id')
  remove(@CurrentUser() user: JwtPayloadUser, @Param('id') id: string) {
    return this.personalKpiService.remove(user.uid, id);
  }
}
