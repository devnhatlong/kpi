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
import { Permissions } from '@/common/decorators';
import { Permission } from '@/common/enums/permission.enum';
import { PermissionsGuard } from '@/common/guards/permissions.guard';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { CreateWorkTaskDto } from './dto/create-work-task.dto';
import { UpdateWorkTaskDto } from './dto/update-work-task.dto';
import { WorkTaskQueryDto } from './dto/work-task-query.dto';
import { WorkTasksService } from './work-tasks.service';

@ApiTags('KPI Form Config')
@ApiBearerAuth()
@UseGuards(JwtGuard, PermissionsGuard)
@Controller('kpi-form-config/work-tasks')
export class WorkTasksController {
  constructor(private readonly workTasksService: WorkTasksService) {}

  @ApiOperation({ summary: 'Tạo nhiệm vụ (danh mục theo nội dung công việc)' })
  @Permissions(Permission.KPI_MANAGE)
  @Post()
  create(@Body() dto: CreateWorkTaskDto) {
    return this.workTasksService.create(dto);
  }

  @ApiOperation({
    summary: 'Danh sách nhiệm vụ; lọc theo workContentId cho form nhập',
  })
  @Permissions(Permission.TASK_VIEW)
  @Get('all')
  findAll(@Query() query: WorkTaskQueryDto) {
    return this.workTasksService.findAll(query, query.workContentId);
  }

  @ApiOperation({ summary: 'Chi tiết nhiệm vụ' })
  @Permissions(Permission.TASK_VIEW)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.workTasksService.findOne(id);
  }

  @ApiOperation({ summary: 'Cập nhật nhiệm vụ' })
  @Permissions(Permission.KPI_MANAGE)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateWorkTaskDto) {
    return this.workTasksService.update(id, dto);
  }

  @ApiOperation({ summary: 'Xoá nhiệm vụ' })
  @Permissions(Permission.KPI_MANAGE)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.workTasksService.remove(id);
  }
}
