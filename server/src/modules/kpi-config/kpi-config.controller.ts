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
import { CreateKpiTemplateDto } from './dto/create-kpi-template.dto';
import { UpdateKpiTemplateDto } from './dto/update-kpi-template.dto';

@ApiTags('KPI Configuration')
@ApiBearerAuth()
@UseGuards(JwtGuard, RolesGuard)
@Roles(RoleCode.SUPER_ADMIN)
@Controller('kpi-config')
export class KpiConfigController {
  constructor(private readonly service: KpiConfigService) {}

  @ApiOperation({ summary: 'Tạo nhóm công việc' })
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
  @Patch('groups/:id')
  updateGroup(@Param('id') id: string, @Body() dto: UpdateWorkGroupDto) {
    return this.service.updateGroup(id, dto);
  }

  @ApiOperation({ summary: 'Xoá nhóm công việc' })
  @Delete('groups/:id')
  deleteGroup(@Param('id') id: string) {
    return this.service.deleteGroup(id);
  }

  @ApiOperation({ summary: 'Tạo nội dung công việc' })
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
  @Patch('contents/:id')
  updateContent(@Param('id') id: string, @Body() dto: UpdateWorkContentDto) {
    return this.service.updateContent(id, dto);
  }

  @ApiOperation({ summary: 'Xoá nội dung công việc' })
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

  @ApiOperation({ summary: 'Tạo biểu mẫu KPI' })
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
  @Patch('templates/:id')
  updateTemplate(
    @Param('id') id: string,
    @Body() dto: UpdateKpiTemplateDto,
  ) {
    return this.service.updateTemplate(id, dto);
  }

  @ApiOperation({ summary: 'Xoá biểu mẫu KPI' })
  @Delete('templates/:id')
  deleteTemplate(@Param('id') id: string) {
    return this.service.deleteTemplate(id);
  }
}
