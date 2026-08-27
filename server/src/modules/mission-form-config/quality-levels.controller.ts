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
import {
  CreateQualityLevelDto,
  UpdateQualityLevelDto,
} from './dto/quality-level.dto';
import { QualityLevelsService } from './quality-levels.service';

@ApiTags('Mission Form Config')
@ApiBearerAuth()
@UseGuards(JwtGuard, PermissionsGuard)
@Controller('mission-form-config/quality-levels')
export class QualityLevelsController {
  constructor(private readonly qualityLevelsService: QualityLevelsService) {}

  @ApiOperation({ summary: 'Tạo mức chất lượng thực hiện' })
  @Permissions(Permission.MISSION_MANAGE)
  @Post()
  create(@Body() dto: CreateQualityLevelDto) {
    return this.qualityLevelsService.create(dto);
  }

  @ApiOperation({ summary: 'Danh sách mức chất lượng thực hiện' })
  @Permissions(Permission.TASK_VIEW)
  @Get('all')
  findAll(@Query() query: PaginationQueryDto) {
    return this.qualityLevelsService.findAll(query);
  }

  @ApiOperation({ summary: 'Chi tiết mức chất lượng' })
  @Permissions(Permission.TASK_VIEW)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.qualityLevelsService.findOne(id);
  }

  @ApiOperation({ summary: 'Cập nhật mức chất lượng' })
  @Permissions(Permission.MISSION_MANAGE)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateQualityLevelDto) {
    return this.qualityLevelsService.update(id, dto);
  }

  @ApiOperation({ summary: 'Xoá mức chất lượng' })
  @Permissions(Permission.MISSION_MANAGE)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.qualityLevelsService.remove(id);
  }
}
