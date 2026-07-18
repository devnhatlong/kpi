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

import { DepartmentsService } from './departments.service';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { ImportDepartmentsDto } from './dto/import-departments.dto';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { PermissionsGuard } from '@/common/guards/permissions.guard';
import { Permissions } from '@/common/decorators';
import { Permission } from '@/common/enums/permission.enum';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';

@ApiTags('Departments (Đơn vị)')
@Controller('departments')
export class DepartmentsController {
  constructor(private readonly departmentsService: DepartmentsService) {}

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tạo đơn vị' })
  @UseGuards(JwtGuard, PermissionsGuard)
  @Permissions(Permission.DEPARTMENT_MANAGE)
  @Post()
  create(@Body() dto: CreateDepartmentDto) {
    return this.departmentsService.create(dto);
  }

  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Import hàng loạt đơn vị (theo mã cha / mã cấp)',
  })
  @UseGuards(JwtGuard, PermissionsGuard)
  @Permissions(Permission.DEPARTMENT_MANAGE)
  @Post('import')
  importMany(@Body() dto: ImportDepartmentsDto) {
    return this.departmentsService.importMany(dto.rows);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Danh sách đơn vị (phân trang)' })
  @UseGuards(JwtGuard, PermissionsGuard)
  @Permissions(Permission.DEPARTMENT_VIEW)
  @Get('all')
  findAll(@Query() query: PaginationQueryDto) {
    return this.departmentsService.findAll(query);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Chi tiết đơn vị' })
  @UseGuards(JwtGuard, PermissionsGuard)
  @Permissions(Permission.DEPARTMENT_VIEW)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.departmentsService.findOne(id);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cập nhật đơn vị' })
  @UseGuards(JwtGuard, PermissionsGuard)
  @Permissions(Permission.DEPARTMENT_MANAGE)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateDepartmentDto) {
    return this.departmentsService.update(id, dto);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Xóa đơn vị' })
  @UseGuards(JwtGuard, PermissionsGuard)
  @Permissions(Permission.DEPARTMENT_MANAGE)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.departmentsService.remove(id);
  }
}
