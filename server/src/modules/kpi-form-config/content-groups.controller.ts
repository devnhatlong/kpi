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
import { ContentGroupsService } from './content-groups.service';
import { CreateContentGroupDto } from './dto/create-content-group.dto';
import { UpdateContentGroupDto } from './dto/update-content-group.dto';

@ApiTags('KPI Form Config')
@ApiBearerAuth()
@UseGuards(JwtGuard, PermissionsGuard)
@Controller('kpi-form-config/content-groups')
export class ContentGroupsController {
  constructor(private readonly contentGroupsService: ContentGroupsService) {}

  @ApiOperation({ summary: 'Tạo nhóm nội dung công việc' })
  @Permissions(Permission.KPI_MANAGE)
  @Post()
  create(@Body() dto: CreateContentGroupDto) {
    return this.contentGroupsService.create(dto);
  }

  @ApiOperation({ summary: 'Danh sách nhóm nội dung công việc' })
  @Permissions(Permission.TASK_VIEW)
  @Get('all')
  findAll(@Query() query: PaginationQueryDto) {
    return this.contentGroupsService.findAll(query);
  }

  @ApiOperation({ summary: 'Chi tiết nhóm nội dung công việc' })
  @Permissions(Permission.TASK_VIEW)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.contentGroupsService.findOne(id);
  }

  @ApiOperation({ summary: 'Cập nhật nhóm nội dung công việc' })
  @Permissions(Permission.KPI_MANAGE)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateContentGroupDto) {
    return this.contentGroupsService.update(id, dto);
  }

  @ApiOperation({ summary: 'Xoá nhóm nội dung công việc' })
  @Permissions(Permission.KPI_MANAGE)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.contentGroupsService.remove(id);
  }
}
