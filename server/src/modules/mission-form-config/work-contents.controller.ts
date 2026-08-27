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
import { CreateWorkContentDto } from './dto/create-work-content.dto';
import { UpdateWorkContentDto } from './dto/update-work-content.dto';
import { WorkContentsService } from './work-contents.service';

@ApiTags('Mission Form Config')
@ApiBearerAuth()
@UseGuards(JwtGuard, PermissionsGuard)
@Controller('mission-form-config/work-contents')
export class WorkContentsController {
  constructor(private readonly workContentsService: WorkContentsService) {}

  @ApiOperation({ summary: 'Tạo nội dung công việc (danh mục form nhiệm vụ)' })
  @Permissions(Permission.MISSION_MANAGE)
  @Post()
  create(@Body() dto: CreateWorkContentDto) {
    return this.workContentsService.create(dto);
  }

  @ApiOperation({ summary: 'Danh sách nội dung công việc' })
  @Permissions(Permission.TASK_VIEW)
  @Get('all')
  findAll(@Query() query: PaginationQueryDto) {
    return this.workContentsService.findAll(query);
  }

  @ApiOperation({ summary: 'Chi tiết nội dung công việc' })
  @Permissions(Permission.TASK_VIEW)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.workContentsService.findOne(id);
  }

  @ApiOperation({ summary: 'Cập nhật nội dung công việc' })
  @Permissions(Permission.MISSION_MANAGE)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateWorkContentDto) {
    return this.workContentsService.update(id, dto);
  }

  @ApiOperation({ summary: 'Xoá nội dung công việc' })
  @Permissions(Permission.MISSION_MANAGE)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.workContentsService.remove(id);
  }
}
