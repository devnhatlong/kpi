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
import { CurrentUser, Roles } from '@/common/decorators';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';
import { RoleCode } from '@/common/enums/role-code.enum';
import type { JwtPayloadUser } from '@/common/interfaces';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { CreateWorkGroupDto } from './dto/create-work-group.dto';
import { UpdateWorkGroupDto } from './dto/update-work-group.dto';
import { CreateWorkContentDto } from './dto/create-work-content.dto';
import { UpdateWorkContentDto } from './dto/update-work-content.dto';
import { CreateTaskAssignmentDto } from './dto/create-task-assignment.dto';
import { UpdateTaskAssignmentDto } from './dto/update-task-assignment.dto';
import {
  TaskAssignmentListQueryDto,
  WorkContentListQueryDto,
} from './dto/kpi-list-query.dto';
import { KpiConfigService } from './kpi-config.service';
import { KpiWorkflowService } from './kpi-workflow.service';
import { KpiMasterFormService } from './kpi-master-form.service';
import { CreateKpiTemplateDto } from './dto/create-kpi-template.dto';
import { UpdateKpiTemplateDto } from './dto/update-kpi-template.dto';
import { CreateKpiPeriodDto } from './dto/create-kpi-period.dto';
import { UpdateKpiPeriodDto } from './dto/update-kpi-period.dto';
import { CreateUnitKpiSheetDto } from './dto/create-unit-kpi-sheet.dto';
import { UpdateUnitKpiSheetDto } from './dto/update-unit-kpi-sheet.dto';
import { CreateUnitHandoffDto } from './dto/create-unit-handoff.dto';
import {
  AcceptUnitHandoffDto,
  AssignTaskTargetDto,
  RejectUnitHandoffDto,
} from './dto/handoff-actions.dto';
import {
  UnitHandoffListQueryDto,
  UnitKpiSheetListQueryDto,
} from './dto/workflow-list-query.dto';
import {
  CreateKpiMasterFormDto,
  UpdateKpiMasterFormDto,
} from './dto/create-kpi-master-form.dto';
import { KpiMasterFormStatus } from './schemas/kpi-master-form.schema';
import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

class UpdateMasterFormStatusDto {
  @ApiProperty({ enum: KpiMasterFormStatus })
  @IsEnum(KpiMasterFormStatus)
  status!: KpiMasterFormStatus;
}

const KPI_OPERATORS = [
  RoleCode.SUPER_ADMIN,
  RoleCode.UNIT_ADMIN,
  RoleCode.MANAGER,
] as const;

const KPI_CATALOG_EDITORS = [RoleCode.SUPER_ADMIN, RoleCode.UNIT_ADMIN] as const;

@ApiTags('KPI Configuration')
@ApiBearerAuth()
@UseGuards(JwtGuard, RolesGuard)
@Roles(...KPI_OPERATORS)
@Controller('kpi-config')
export class KpiConfigController {
  constructor(
    private readonly service: KpiConfigService,
    private readonly workflow: KpiWorkflowService,
    private readonly masterForms: KpiMasterFormService,
  ) {}

  @ApiOperation({ summary: 'Tạo nhóm công việc' })
  @Roles(...KPI_CATALOG_EDITORS)
  @Post('groups')
  createGroup(@Body() dto: CreateWorkGroupDto) {
    return this.service.createGroup(dto);
  }

  @ApiOperation({ summary: 'Danh sách nhóm công việc' })
  @Get('groups/all')
  listGroups(@Query() query: PaginationQueryDto) {
    return this.service.listGroups(query);
  }

  @ApiOperation({ summary: 'Cập nhật nhóm công việc' })
  @Roles(...KPI_CATALOG_EDITORS)
  @Patch('groups/:id')
  updateGroup(@Param('id') id: string, @Body() dto: UpdateWorkGroupDto) {
    return this.service.updateGroup(id, dto);
  }

  @ApiOperation({ summary: 'Xoá nhóm công việc' })
  @Roles(...KPI_CATALOG_EDITORS)
  @Delete('groups/:id')
  deleteGroup(@Param('id') id: string) {
    return this.service.deleteGroup(id);
  }

  @ApiOperation({ summary: 'Tạo nội dung công việc' })
  @Roles(...KPI_CATALOG_EDITORS)
  @Post('contents')
  createContent(@Body() dto: CreateWorkContentDto) {
    return this.service.createContent(dto);
  }

  @ApiOperation({ summary: 'Danh sách nội dung công việc' })
  @Get('contents/all')
  listContents(@Query() query: WorkContentListQueryDto) {
    return this.service.listContents(query);
  }

  @ApiOperation({ summary: 'Cập nhật nội dung công việc' })
  @Roles(...KPI_CATALOG_EDITORS)
  @Patch('contents/:id')
  updateContent(@Param('id') id: string, @Body() dto: UpdateWorkContentDto) {
    return this.service.updateContent(id, dto);
  }

  @ApiOperation({ summary: 'Xoá nội dung công việc' })
  @Roles(...KPI_CATALOG_EDITORS)
  @Delete('contents/:id')
  deleteContent(@Param('id') id: string) {
    return this.service.deleteContent(id);
  }

  @ApiOperation({ summary: 'Giao nhiệm vụ KPI' })
  @Post('tasks')
  createTask(
    @Body() dto: CreateTaskAssignmentDto,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.service.createTask(dto, user.uid);
  }

  @ApiOperation({ summary: 'Danh sách nhiệm vụ KPI' })
  @Get('tasks/all')
  listTasks(@Query() query: TaskAssignmentListQueryDto) {
    return this.service.listTasks(query);
  }

  @ApiOperation({ summary: 'Cập nhật nhiệm vụ KPI' })
  @Patch('tasks/:id')
  updateTask(@Param('id') id: string, @Body() dto: UpdateTaskAssignmentDto) {
    return this.service.updateTask(id, dto);
  }

  @ApiOperation({ summary: 'Xoá nhiệm vụ KPI' })
  @Delete('tasks/:id')
  deleteTask(@Param('id') id: string) {
    return this.service.deleteTask(id);
  }

  @ApiOperation({ summary: 'Giao dọc nhiệm vụ (đội con / cán bộ)' })
  @Post('tasks/:id/assign-target')
  assignTaskTarget(
    @Param('id') id: string,
    @Body() dto: AssignTaskTargetDto,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.workflow.assignTaskTarget(id, dto, user);
  }

  @ApiOperation({ summary: 'Tạo biểu mẫu KPI' })
  @Roles(RoleCode.SUPER_ADMIN)
  @Post('templates')
  createTemplate(@Body() dto: CreateKpiTemplateDto) {
    return this.service.createTemplate(dto);
  }

  @ApiOperation({ summary: 'Danh sách biểu mẫu KPI' })
  @Get('templates/all')
  listTemplates(@Query() query: PaginationQueryDto) {
    return this.service.listTemplates(query);
  }

  @ApiOperation({ summary: 'Cập nhật biểu mẫu KPI' })
  @Roles(RoleCode.SUPER_ADMIN)
  @Patch('templates/:id')
  updateTemplate(
    @Param('id') id: string,
    @Body() dto: UpdateKpiTemplateDto,
  ) {
    return this.service.updateTemplate(id, dto);
  }

  @ApiOperation({ summary: 'Xoá biểu mẫu KPI' })
  @Roles(RoleCode.SUPER_ADMIN)
  @Delete('templates/:id')
  deleteTemplate(@Param('id') id: string) {
    return this.service.deleteTemplate(id);
  }

  // ── Periods ──────────────────────────────────────────────

  @ApiOperation({ summary: 'Tạo kỳ KPI' })
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.UNIT_ADMIN)
  @Post('periods')
  createPeriod(@Body() dto: CreateKpiPeriodDto) {
    return this.workflow.createPeriod(dto);
  }

  @ApiOperation({ summary: 'Danh sách kỳ KPI' })
  @Get('periods/all')
  listPeriods(@Query() query: PaginationQueryDto) {
    return this.workflow.listPeriods(query);
  }

  @ApiOperation({ summary: 'Cập nhật kỳ KPI' })
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.UNIT_ADMIN)
  @Patch('periods/:id')
  updatePeriod(@Param('id') id: string, @Body() dto: UpdateKpiPeriodDto) {
    return this.workflow.updatePeriod(id, dto);
  }

  @ApiOperation({ summary: 'Xoá kỳ KPI' })
  @Roles(RoleCode.SUPER_ADMIN)
  @Delete('periods/:id')
  deletePeriod(@Param('id') id: string) {
    return this.workflow.deletePeriod(id);
  }

  // ── Sheets Form 1 ────────────────────────────────────────

  @ApiOperation({ summary: 'Tạo Form KPI đơn vị (Form 1)' })
  @Post('sheets')
  createSheet(
    @Body() dto: CreateUnitKpiSheetDto,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.workflow.createSheet(dto, user);
  }

  @ApiOperation({ summary: 'Danh sách Form KPI đơn vị' })
  @Get('sheets/all')
  listSheets(
    @Query() query: UnitKpiSheetListQueryDto,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.workflow.listSheets(query, user);
  }

  @ApiOperation({ summary: 'Chi tiết Form KPI' })
  @Get('sheets/:id')
  getSheet(@Param('id') id: string, @CurrentUser() user: JwtPayloadUser) {
    return this.workflow.getSheet(id, user);
  }

  @ApiOperation({ summary: 'Cập nhật Form KPI' })
  @Patch('sheets/:id')
  updateSheet(
    @Param('id') id: string,
    @Body() dto: UpdateUnitKpiSheetDto,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.workflow.updateSheet(id, dto, user);
  }

  @ApiOperation({ summary: 'Danh sách nhiệm vụ trên Form 1' })
  @Get('sheets/:id/tasks')
  listSheetTasks(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.workflow.listSheetTasks(id, user);
  }

  @ApiOperation({ summary: 'Thêm nhiệm vụ vào Form 1' })
  @Post('sheets/:id/tasks')
  createSheetTask(
    @Param('id') id: string,
    @Body()
    body: {
      contentId: string;
      title: string;
      description?: string;
      dueDate: string;
      product: string;
      standardScore: number;
      note?: string;
      fieldValues?: Record<string, string | number>;
    },
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.workflow.createSheetTask(id, body, user);
  }

  // ── Handoffs Form 2 / 3 ──────────────────────────────────

  @ApiOperation({ summary: 'Giao ngang nhiệm vụ (Form 2)' })
  @Post('handoffs')
  createHandoff(
    @Body() dto: CreateUnitHandoffDto,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.workflow.createHandoff(dto, user);
  }

  @ApiOperation({ summary: 'Danh sách giao ngang (Form 2 out / Form 3 in)' })
  @Get('handoffs/all')
  listHandoffs(
    @Query() query: UnitHandoffListQueryDto,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.workflow.listHandoffs(query, user);
  }

  @ApiOperation({ summary: 'Tiếp nhận vào Form 1 (Form 3 → Form 1)' })
  @Post('handoffs/:id/accept')
  acceptHandoff(
    @Param('id') id: string,
    @Body() dto: AcceptUnitHandoffDto,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.workflow.acceptHandoff(id, dto, user);
  }

  @ApiOperation({ summary: 'Từ chối nhiệm vụ tiếp nhận' })
  @Post('handoffs/:id/reject')
  rejectHandoff(
    @Param('id') id: string,
    @Body() dto: RejectUnitHandoffDto,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.workflow.rejectHandoff(id, dto, user);
  }

  @ApiOperation({ summary: 'Huỷ giao ngang (bên chủ trì)' })
  @Post('handoffs/:id/cancel')
  cancelHandoff(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.workflow.cancelHandoff(id, user);
  }

  @ApiOperation({ summary: 'Đơn vị làm việc theo scope role' })
  @Get('my-departments')
  listMyDepartments(@CurrentUser() user: JwtPayloadUser) {
    return this.workflow.listMyWorkingDepartments(user);
  }

  @ApiOperation({ summary: 'Đơn vị ngang cấp (peer) để giao Form 2' })
  @Get('departments/:id/peers')
  listPeers(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.workflow.listPeerDepartments(id, user);
  }

  @ApiOperation({ summary: 'Đơn vị con trực tiếp (giao dọc)' })
  @Get('departments/:id/children')
  listChildren(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.workflow.listChildDepartments(id, user);
  }

  // ── Master forms (phát hành KPI cấp tỉnh) ─────────────────

  @ApiOperation({ summary: 'Tạo mẫu KPI cấp tỉnh' })
  @Roles(RoleCode.SUPER_ADMIN)
  @Post('master-forms')
  createMasterForm(
    @Body() dto: CreateKpiMasterFormDto,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.masterForms.create(dto, user);
  }

  @ApiOperation({ summary: 'Danh sách mẫu KPI' })
  @Get('master-forms/all')
  listMasterForms(
    @Query() query: PaginationQueryDto,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.masterForms.list(query, user);
  }

  @ApiOperation({ summary: 'Chi tiết mẫu KPI (Manager xem RO khi đã publish)' })
  @Get('master-forms/:id')
  getMasterForm(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.masterForms.getOne(id, user);
  }

  @ApiOperation({ summary: 'Cập nhật mẫu KPI (chỉ Nháp / Chờ phát hành)' })
  @Roles(RoleCode.SUPER_ADMIN)
  @Patch('master-forms/:id')
  updateMasterForm(
    @Param('id') id: string,
    @Body() dto: UpdateKpiMasterFormDto,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.masterForms.update(id, dto, user);
  }

  @ApiOperation({ summary: 'Chuyển Chờ phát hành' })
  @Roles(RoleCode.SUPER_ADMIN)
  @Post('master-forms/:id/ready')
  markMasterReady(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.masterForms.markReady(id, user);
  }

  @ApiOperation({ summary: 'Phát hành → auto Form KPI từng phòng' })
  @Roles(RoleCode.SUPER_ADMIN)
  @Post('master-forms/:id/publish')
  publishMasterForm(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.masterForms.publish(id, user);
  }

  @ApiOperation({ summary: 'Đổi trạng thái (khóa / kết thúc / hủy)' })
  @Roles(RoleCode.SUPER_ADMIN)
  @Post('master-forms/:id/status')
  setMasterStatus(
    @Param('id') id: string,
    @Body() dto: UpdateMasterFormStatusDto,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.masterForms.setStatus(id, dto.status, user);
  }

  @ApiOperation({ summary: 'Theo dõi thực hiện toàn tỉnh' })
  @Roles(RoleCode.SUPER_ADMIN)
  @Get('master-forms/:id/tracking')
  trackMasterForm(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.masterForms.tracking(id, user);
  }

  @ApiOperation({ summary: 'Xoá mẫu KPI (chưa phát hành)' })
  @Roles(RoleCode.SUPER_ADMIN)
  @Delete('master-forms/:id')
  deleteMasterForm(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.masterForms.delete(id, user);
  }
}
