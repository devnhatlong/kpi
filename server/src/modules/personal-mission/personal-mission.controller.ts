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
import { CurrentUser, Permissions } from '@/common/decorators';
import { Permission } from '@/common/enums/permission.enum';
import { PermissionsGuard } from '@/common/guards/permissions.guard';
import type { JwtPayloadUser } from '@/common/interfaces/jwt-payload-user.interface';
import { JwtGuard } from '../auth/guards/jwt.guard';
import {
  CreatePersonalMissionBatchDto,
  ForwardPersonalMissionDto,
  PersonalMissionBoardQueryDto,
  PersonalMissionListQueryDto,
  PersonalMissionReportsQueryDto,
  PersonalMissionStaffDayQueryDto,
  PersonalMissionStatisticsQueryDto,
  ReviewPersonalMissionDto,
  ReviewerEditPersonalMissionDto,
  ScorePersonalCriteriaSheetDto,
  ScorePersonalMissionDto,
  SavePersonalCriteriaSheetDto,
  SubmitPersonalMissionDto,
  UpdatePersonalCriteriaSheetDto,
  UpdatePersonalMissionDto,
  UpdatePersonalMissionProgressDto,
} from './dto/personal-mission.dto';
import { PersonalMissionService } from './personal-mission.service';

@ApiTags('Personal Mission')
@ApiBearerAuth()
@UseGuards(JwtGuard, PermissionsGuard)
@Controller('personal-mission')
export class PersonalMissionController {
  constructor(
    private readonly personalMissionService: PersonalMissionService,
  ) {}

  // ------------------------------------------------------------ cán bộ nhập

  @ApiOperation({ summary: 'Tạo nhiều nhiệm vụ nháp nhiệm vụ cá nhân' })
  @Permissions(Permission.EVALUATION_SELF)
  @Post('batch')
  createBatch(
    @CurrentUser() user: JwtPayloadUser,
    @Body() dto: CreatePersonalMissionBatchDto,
  ) {
    return this.personalMissionService.createMany(user.uid, dto);
  }

  @ApiOperation({ summary: 'Tóm tắt nhiệm vụ cá nhân cho dashboard' })
  @Permissions(Permission.EVALUATION_SELF)
  @Get('summary')
  summary(@CurrentUser() user: JwtPayloadUser) {
    return this.personalMissionService.getDashboardSummary(user.uid);
  }

  @ApiOperation({ summary: 'Số liệu cho trang Thống kê' })
  @Permissions(Permission.EVALUATION_SELF)
  @Get('statistics')
  statistics(
    @CurrentUser() user: JwtPayloadUser,
    @Query() query: PersonalMissionStatisticsQueryDto,
  ) {
    return this.personalMissionService.statistics(user.uid, query);
  }

  @ApiOperation({ summary: 'Danh sách báo cáo theo ngày của tôi' })
  @Permissions(Permission.EVALUATION_SELF)
  @Get('reports')
  reports(
    @CurrentUser() user: JwtPayloadUser,
    @Query() query: PersonalMissionReportsQueryDto,
  ) {
    return this.personalMissionService.findReports(user.uid, query);
  }

  @ApiOperation({ summary: 'Cấp trên nhận được báo cáo của tôi' })
  @Permissions(Permission.EVALUATION_SELF)
  @Get('recipients')
  recipients(@CurrentUser() user: JwtPayloadUser, @Query('q') q?: string) {
    return this.personalMissionService.listRecipients(user.uid, q);
  }

  /*
    Endpoint riêng thay vì dùng /users: danh sách người dùng đòi quyền USER_VIEW
    mà cán bộ (STAFF) không có - trong khi chính họ là người cần chọn đồng đội
    lúc khai nhiệm vụ. Đường này chặn bằng EVALUATION_SELF và chỉ trả người
    trong nhánh đơn vị của người gọi.
  */
  @ApiOperation({ summary: 'Cán bộ có thể chọn làm người phối hợp' })
  @Permissions(Permission.EVALUATION_SELF)
  @Get('colleagues')
  colleagues(@CurrentUser() user: JwtPayloadUser, @Query('q') q?: string) {
    return this.personalMissionService.listColleagues(user.uid, q);
  }

  @ApiOperation({ summary: 'Nhiệm vụ cá nhân của tôi' })
  @Permissions(Permission.EVALUATION_SELF)
  @Get('mine')
  mine(
    @CurrentUser() user: JwtPayloadUser,
    @Query() query: PersonalMissionListQueryDto,
  ) {
    return this.personalMissionService.findMine(user.uid, query);
  }

  @ApiOperation({
    summary: 'Số liệu tổng của màn nhập: đếm theo tab và theo từng ngày',
  })
  @Permissions(Permission.EVALUATION_SELF)
  @Get('mine/overview')
  myOverview(
    @CurrentUser() user: JwtPayloadUser,
    @Query() query: PersonalMissionListQueryDto,
  ) {
    return this.personalMissionService.myOverview(user.uid, query);
  }

  @ApiOperation({ summary: 'Gửi báo cáo ngày lên cấp trên' })
  @Permissions(Permission.EVALUATION_SELF)
  @Post('reports/:reportDate/submit')
  submit(
    @CurrentUser() user: JwtPayloadUser,
    @Param('reportDate') reportDate: string,
    @Body() dto: SubmitPersonalMissionDto,
  ) {
    return this.personalMissionService.submit(user.uid, reportDate, dto);
  }

  // ----------------------------------------------------------- cấp trên duyệt

  @ApiOperation({
    summary: 'Bảng tổng theo trục - nhiệm vụ đang nằm ở chỗ tôi',
  })
  @Permissions(Permission.EVALUATION_APPROVE)
  @Get('board')
  board(
    @CurrentUser() user: JwtPayloadUser,
    @Query() query: PersonalMissionBoardQueryDto,
  ) {
    return this.personalMissionService.board(user.uid, query);
  }

  @ApiOperation({
    summary: 'Toàn bộ báo cáo một ngày của một cán bộ cấp dưới',
  })
  @Permissions(Permission.EVALUATION_APPROVE)
  @Get('staff-day')
  staffDay(
    @CurrentUser() user: JwtPayloadUser,
    @Query() query: PersonalMissionStaffDayQueryDto,
  ) {
    return this.personalMissionService.staffDayReport(user.uid, query);
  }

  @ApiOperation({ summary: 'Các lượt gửi đến tôi' })
  @Permissions(Permission.EVALUATION_APPROVE)
  @Get('submissions')
  submissions(
    @CurrentUser() user: JwtPayloadUser,
    @Query() query: PersonalMissionReportsQueryDto,
  ) {
    return this.personalMissionService.inboxSubmissions(user.uid, query);
  }

  @ApiOperation({ summary: 'Duyệt hoặc trả lại các nhiệm vụ đã tích' })
  @Permissions(Permission.EVALUATION_APPROVE)
  @Post('review')
  review(
    @CurrentUser() user: JwtPayloadUser,
    @Body() dto: ReviewPersonalMissionDto,
  ) {
    return this.personalMissionService.review(user.uid, dto);
  }

  @ApiOperation({ summary: 'Gửi tiếp các nhiệm vụ đã duyệt lên cấp trên' })
  @Permissions(Permission.EVALUATION_APPROVE)
  @Post('forward')
  forward(
    @CurrentUser() user: JwtPayloadUser,
    @Body() dto: ForwardPersonalMissionDto,
  ) {
    return this.personalMissionService.forward(user.uid, dto);
  }

  /*
    Khối A của báo cáo cá nhân. PHẢI đứng trên mọi route có ':id' - Nest khớp
    theo thứ tự khai báo, để dưới thì 'criteria' bị @Get(':id') bắt làm id
    nhiệm vụ và trả lỗi "không tìm thấy".
  */
  @ApiOperation({
    summary: 'Bảng khối A của một THÁNG - danh mục tiêu chí kèm điểm đã chấm',
  })
  @Permissions(Permission.EVALUATION_SELF)
  @Get('criteria')
  getCriteriaSheet(
    @CurrentUser() user: JwtPayloadUser,
    @Query('period') period?: string,
  ) {
    return this.personalMissionService.getCriteriaSheet(user.uid, period);
  }

  @ApiOperation({
    summary:
      'Bảng khối A của tôi theo tháng, lọc bằng khoảng NGÀY - kèm điểm tổng',
  })
  @Permissions(Permission.EVALUATION_SELF)
  @Get('criteria/list')
  listCriteriaSheets(
    @CurrentUser() user: JwtPayloadUser,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    return this.personalMissionService.listCriteriaSheets(
      user.uid,
      fromDate,
      toDate,
    );
  }

  @ApiOperation({ summary: 'Lưu nháp bảng khối A của một ngày' })
  @Permissions(Permission.EVALUATION_SELF)
  @Put('criteria')
  saveCriteriaSheet(
    @CurrentUser() user: JwtPayloadUser,
    @Body() dto: SavePersonalCriteriaSheetDto,
  ) {
    return this.personalMissionService.saveCriteriaSheet(user.uid, dto);
  }

  @ApiOperation({
    summary: 'Cập nhật bảng khối A đã gửi - có ghi vết vào nhật ký',
  })
  @Permissions(Permission.EVALUATION_SELF)
  @Patch('criteria/progress')
  updateCriteriaSheet(
    @CurrentUser() user: JwtPayloadUser,
    @Body() dto: UpdatePersonalCriteriaSheetDto,
  ) {
    return this.personalMissionService.updateCriteriaSheet(user.uid, dto);
  }

  @ApiOperation({
    summary: 'Lịch sử một bảng khối A: đã đi qua những lượt gửi nào',
  })
  @Permissions(Permission.EVALUATION_SELF)
  @Get('criteria/:id/history')
  criteriaHistory(
    @CurrentUser() user: JwtPayloadUser,
    @Param('id') id: string,
  ) {
    return this.personalMissionService.criteriaHistory(user.uid, id);
  }

  @ApiOperation({ summary: 'Chỉ huy chấm lại và chốt một bảng khối A' })
  @Permissions(Permission.EVALUATION_APPROVE)
  @Post('criteria/:id/score')
  scoreCriteriaSheet(
    @CurrentUser() user: JwtPayloadUser,
    @Param('id') id: string,
    @Body() dto: ScorePersonalCriteriaSheetDto,
  ) {
    return this.personalMissionService.scoreCriteriaSheet(user.uid, id, dto);
  }

  @ApiOperation({ summary: 'Cấp trên sửa nội dung nhiệm vụ (có lưu vết)' })
  @Permissions(Permission.EVALUATION_APPROVE)
  @Patch(':id/reviewer-edit')
  reviewerEdit(
    @CurrentUser() user: JwtPayloadUser,
    @Param('id') id: string,
    @Body() dto: ReviewerEditPersonalMissionDto,
  ) {
    return this.personalMissionService.reviewerEdit(user.uid, id, dto);
  }

  // -------------------------------------------------------------- dùng chung

  @ApiOperation({ summary: 'Lịch sử một nhiệm vụ: lượt gửi và lần sửa' })
  @Permissions(Permission.EVALUATION_SELF)
  @Get(':id/history')
  history(@CurrentUser() user: JwtPayloadUser, @Param('id') id: string) {
    return this.personalMissionService.history(user.uid, id);
  }

  @ApiOperation({ summary: 'Chi tiết nhiệm vụ của tôi' })
  @Permissions(Permission.EVALUATION_SELF)
  @Get(':id')
  findOne(@CurrentUser() user: JwtPayloadUser, @Param('id') id: string) {
    return this.personalMissionService.findOne(user.uid, id);
  }

  @ApiOperation({ summary: 'Sửa nhiệm vụ nháp / bị trả lại của tôi' })
  @Permissions(Permission.EVALUATION_SELF)
  @Patch(':id')
  update(
    @CurrentUser() user: JwtPayloadUser,
    @Param('id') id: string,
    @Body() dto: UpdatePersonalMissionDto,
  ) {
    return this.personalMissionService.update(user.uid, id, dto);
  }

  @ApiOperation({
    summary: 'Cập nhật tiến độ hằng ngày - chạy được cả khi đã gửi lên trên',
  })
  @Permissions(Permission.EVALUATION_SELF)
  @Patch(':id/progress')
  updateProgress(
    @CurrentUser() user: JwtPayloadUser,
    @Param('id') id: string,
    @Body() dto: UpdatePersonalMissionProgressDto,
  ) {
    return this.personalMissionService.updateProgress(user.uid, id, dto);
  }

  @ApiOperation({
    summary: 'Chỉ huy chấm điểm và chốt hoàn thành một nhiệm vụ',
  })
  @Permissions(Permission.EVALUATION_APPROVE)
  @Post(':id/score')
  scoreAndComplete(
    @CurrentUser() user: JwtPayloadUser,
    @Param('id') id: string,
    @Body() dto: ScorePersonalMissionDto,
  ) {
    return this.personalMissionService.scoreAndComplete(user.uid, id, dto);
  }

  @ApiOperation({ summary: 'Xoá nhiệm vụ chưa gửi' })
  @Permissions(Permission.EVALUATION_SELF)
  @Delete(':id')
  remove(@CurrentUser() user: JwtPayloadUser, @Param('id') id: string) {
    return this.personalMissionService.remove(user.uid, id);
  }
}
