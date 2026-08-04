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
import { AxesService } from './axes.service';
import { CreateAxisDto } from './dto/create-axis.dto';
import { UpdateAxisDto } from './dto/update-axis.dto';

@ApiTags('KPI Form Config')
@ApiBearerAuth()
@UseGuards(JwtGuard, PermissionsGuard)
@Controller('kpi-form-config/axes')
export class AxesController {
  constructor(private readonly axesService: AxesService) {}

  @ApiOperation({ summary: 'Tạo trục KPI' })
  @Permissions(Permission.KPI_MANAGE)
  @Post()
  create(@Body() dto: CreateAxisDto) {
    return this.axesService.create(dto);
  }

  @ApiOperation({ summary: 'Danh sách trục KPI' })
  @Permissions(Permission.KPI_MANAGE, Permission.KPI_ASSIGN)
  @Get('all')
  findAll(@Query() query: PaginationQueryDto) {
    return this.axesService.findAll(query);
  }

  @ApiOperation({ summary: 'Chi tiết trục KPI' })
  @Permissions(Permission.KPI_MANAGE, Permission.KPI_ASSIGN)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.axesService.findOne(id);
  }

  @ApiOperation({ summary: 'Cập nhật trục KPI' })
  @Permissions(Permission.KPI_MANAGE)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAxisDto) {
    return this.axesService.update(id, dto);
  }

  @ApiOperation({ summary: 'Xoá trục KPI' })
  @Permissions(Permission.KPI_MANAGE)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.axesService.remove(id);
  }
}
