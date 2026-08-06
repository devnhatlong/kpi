import {
  Body,
  Controller,
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
  ApproveKpiAssignmentDto,
  CreateKpiAssignmentBatchDto,
  DelegateKpiAssignmentDto,
  IssuedAssignmentQueryDto,
  ReceivedAssignmentQueryDto,
  RejectKpiAssignmentDto,
  ReportKpiAssignmentDto,
} from './dto/kpi-assignment.dto';
import { KpiAssignmentsService } from './kpi-assignments.service';

function roleCodesOf(user: JwtPayloadUser): string[] {
  return (user.role ?? []).map((item) => item.roleCode);
}

@ApiTags('KPI Assignments')
@ApiBearerAuth()
@UseGuards(JwtGuard, PermissionsGuard)
@Controller('kpi-assignments')
export class KpiAssignmentsController {
  constructor(private readonly service: KpiAssignmentsService) {}

  @ApiOperation({ summary: 'Giao nhiều nhiệm vụ KPI xuống trong một lần' })
  @Permissions(Permission.TASK_ASSIGN)
  @Post()
  create(
    @CurrentUser() user: JwtPayloadUser,
    @Body() dto: CreateKpiAssignmentBatchDto,
  ) {
    return this.service.create(user.uid, roleCodesOf(user), dto);
  }

  @ApiOperation({ summary: 'Nơi nhận hợp lệ theo phạm vi vai trò của người giao' })
  @Permissions(Permission.TASK_ASSIGN)
  @Get('targets')
  findTargets(@CurrentUser() user: JwtPayloadUser) {
    return this.service.findTargets(user.uid, roleCodesOf(user));
  }

  @ApiOperation({ summary: 'Nhiệm vụ đang nằm ở chỗ tôi' })
  @Permissions(Permission.TASK_VIEW)
  @Get('received')
  findReceived(
    @CurrentUser() user: JwtPayloadUser,
    @Query() query: ReceivedAssignmentQueryDto,
  ) {
    return this.service.findReceived(user.uid, roleCodesOf(user), query);
  }

  @ApiOperation({ summary: 'Nhiệm vụ tôi đã giao đi' })
  @Permissions(Permission.TASK_ASSIGN)
  @Get('issued')
  findIssued(
    @CurrentUser() user: JwtPayloadUser,
    @Query() query: IssuedAssignmentQueryDto,
  ) {
    return this.service.findIssued(user.uid, roleCodesOf(user), query);
  }

  @ApiOperation({ summary: 'Chi tiết nhiệm vụ' })
  @Permissions(Permission.TASK_VIEW)
  @Get(':id')
  findOne(@CurrentUser() user: JwtPayloadUser, @Param('id') id: string) {
    return this.service.findOne(user.uid, roleCodesOf(user), id);
  }

  @ApiOperation({ summary: 'Giao tiếp nhiệm vụ xuống cấp dưới' })
  @Permissions(Permission.TASK_ASSIGN)
  @Patch(':id/delegate')
  delegate(
    @CurrentUser() user: JwtPayloadUser,
    @Param('id') id: string,
    @Body() dto: DelegateKpiAssignmentDto,
  ) {
    return this.service.delegate(user.uid, roleCodesOf(user), id, dto);
  }

  @ApiOperation({ summary: 'Nhận thực hiện nhiệm vụ' })
  @Permissions(Permission.EVALUATION_SELF)
  @Patch(':id/start')
  start(@CurrentUser() user: JwtPayloadUser, @Param('id') id: string) {
    return this.service.start(user.uid, roleCodesOf(user), id);
  }

  @ApiOperation({ summary: 'Cập nhật kết quả thực hiện' })
  @Permissions(Permission.EVALUATION_SELF)
  @Patch(':id/report')
  report(
    @CurrentUser() user: JwtPayloadUser,
    @Param('id') id: string,
    @Body() dto: ReportKpiAssignmentDto,
  ) {
    return this.service.report(user.uid, roleCodesOf(user), id, dto);
  }

  @ApiOperation({ summary: 'Gửi kết quả lên cấp giao' })
  @Permissions(Permission.EVALUATION_SELF)
  @Patch(':id/submit')
  submit(@CurrentUser() user: JwtPayloadUser, @Param('id') id: string) {
    return this.service.submit(user.uid, roleCodesOf(user), id);
  }

  @ApiOperation({ summary: 'Duyệt kết quả nhiệm vụ' })
  @Permissions(Permission.EVALUATION_APPROVE)
  @Patch(':id/approve')
  approve(
    @CurrentUser() user: JwtPayloadUser,
    @Param('id') id: string,
    @Body() dto: ApproveKpiAssignmentDto,
  ) {
    return this.service.approve(user.uid, roleCodesOf(user), id, dto);
  }

  @ApiOperation({ summary: 'Trả lại nhiệm vụ' })
  @Permissions(Permission.EVALUATION_APPROVE)
  @Patch(':id/reject')
  reject(
    @CurrentUser() user: JwtPayloadUser,
    @Param('id') id: string,
    @Body() dto: RejectKpiAssignmentDto,
  ) {
    return this.service.reject(user.uid, roleCodesOf(user), id, dto);
  }
}
