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
import { CriteriaService } from './criteria.service';
import { CreateCriterionDto } from './dto/create-criterion.dto';
import { UpdateCriterionDto } from './dto/update-criterion.dto';

@ApiTags('KPI Form Config')
@ApiBearerAuth()
@UseGuards(JwtGuard, PermissionsGuard)
@Controller('kpi-form-config/criteria')
export class CriteriaController {
  constructor(private readonly criteriaService: CriteriaService) {}

  @ApiOperation({ summary: 'Tạo tiêu chí chấm điểm chung' })
  @Permissions(Permission.KPI_MANAGE)
  @Post()
  create(@Body() dto: CreateCriterionDto) {
    return this.criteriaService.create(dto);
  }

  @ApiOperation({ summary: 'Danh sách tiêu chí chấm điểm chung' })
  @Permissions(Permission.TASK_VIEW)
  @Get('all')
  findAll(@Query() query: PaginationQueryDto) {
    return this.criteriaService.findAll(query);
  }

  @ApiOperation({ summary: 'Tổng điểm tối đa của các tiêu chí đang hoạt động' })
  @Permissions(Permission.TASK_VIEW)
  @Get('summary')
  summary() {
    return this.criteriaService.summary();
  }

  @ApiOperation({ summary: 'Chi tiết tiêu chí' })
  @Permissions(Permission.TASK_VIEW)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.criteriaService.findOne(id);
  }

  @ApiOperation({ summary: 'Cập nhật tiêu chí' })
  @Permissions(Permission.KPI_MANAGE)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCriterionDto) {
    return this.criteriaService.update(id, dto);
  }

  @ApiOperation({ summary: 'Xoá tiêu chí' })
  @Permissions(Permission.KPI_MANAGE)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.criteriaService.remove(id);
  }
}
