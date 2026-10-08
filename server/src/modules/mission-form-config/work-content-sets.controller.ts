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
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';
import { Permissions } from '@/common/decorators';
import { Permission } from '@/common/enums/permission.enum';
import { PermissionsGuard } from '@/common/guards/permissions.guard';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { CreateWorkContentSetDto } from './dto/create-work-content-set.dto';
import { UpdateWorkContentSetDto } from './dto/update-work-content-set.dto';
import { WorkContentSetsService } from './work-content-sets.service';

@ApiTags('Mission Form Config')
@ApiBearerAuth()
@UseGuards(JwtGuard, PermissionsGuard)
@Controller('mission-form-config/work-content-sets')
export class WorkContentSetsController {
  constructor(private readonly setsService: WorkContentSetsService) {}

  @ApiOperation({ summary: 'Tạo bộ nội dung công việc (phụ lục)' })
  @Permissions(Permission.MISSION_MANAGE)
  @Post()
  create(@Body() dto: CreateWorkContentSetDto) {
    return this.setsService.create(dto);
  }

  @ApiOperation({ summary: 'Danh sách bộ nội dung công việc' })
  @Permissions(Permission.TASK_VIEW)
  @Get('all')
  findAll(@Query() query: PaginationQueryDto) {
    return this.setsService.findAll(query);
  }

  @ApiOperation({ summary: 'Chi tiết bộ nội dung công việc' })
  @Permissions(Permission.TASK_VIEW)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.setsService.findOne(id);
  }

  @ApiOperation({ summary: 'Cập nhật bộ nội dung công việc' })
  @Permissions(Permission.MISSION_MANAGE)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateWorkContentSetDto) {
    return this.setsService.update(id, dto);
  }

  @ApiOperation({ summary: 'Xoá bộ nội dung công việc' })
  @Permissions(Permission.MISSION_MANAGE)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.setsService.remove(id);
  }
}
