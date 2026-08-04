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
import { CreateScoreGroupDto } from './dto/create-score-group.dto';
import { UpdateScoreGroupDto } from './dto/update-score-group.dto';
import { ScoreGroupsService } from './score-groups.service';

@ApiTags('KPI Form Config')
@ApiBearerAuth()
@UseGuards(JwtGuard, PermissionsGuard)
@Controller('kpi-form-config/score-groups')
export class ScoreGroupsController {
  constructor(private readonly scoreGroupsService: ScoreGroupsService) {}

  @ApiOperation({ summary: 'Tạo nhóm điểm' })
  @Permissions(Permission.KPI_MANAGE)
  @Post()
  create(@Body() dto: CreateScoreGroupDto) {
    return this.scoreGroupsService.create(dto);
  }

  @ApiOperation({ summary: 'Danh sách nhóm điểm' })
  @Permissions(Permission.KPI_MANAGE, Permission.KPI_ASSIGN)
  @Get('all')
  findAll(@Query() query: PaginationQueryDto) {
    return this.scoreGroupsService.findAll(query);
  }

  @ApiOperation({ summary: 'Chi tiết nhóm điểm' })
  @Permissions(Permission.KPI_MANAGE, Permission.KPI_ASSIGN)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.scoreGroupsService.findOne(id);
  }

  @ApiOperation({ summary: 'Cập nhật nhóm điểm' })
  @Permissions(Permission.KPI_MANAGE)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateScoreGroupDto) {
    return this.scoreGroupsService.update(id, dto);
  }

  @ApiOperation({ summary: 'Xoá nhóm điểm' })
  @Permissions(Permission.KPI_MANAGE)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.scoreGroupsService.remove(id);
  }
}
