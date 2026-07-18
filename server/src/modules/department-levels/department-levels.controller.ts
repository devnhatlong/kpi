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

import { DepartmentLevelsService } from './department-levels.service';
import { CreateDepartmentLevelDto } from './dto/create-department-level.dto';
import { UpdateDepartmentLevelDto } from './dto/update-department-level.dto';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { PermissionsGuard } from '@/common/guards/permissions.guard';
import { Permissions } from '@/common/decorators';
import { Permission } from '@/common/enums/permission.enum';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';

@ApiTags('Department Levels (Cấp đơn vị)')
@Controller('department-levels')
export class DepartmentLevelsController {
  constructor(
    private readonly departmentLevelsService: DepartmentLevelsService,
  ) {}

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tạo cấp đơn vị' })
  @UseGuards(JwtGuard, PermissionsGuard)
  @Permissions(Permission.DEPARTMENT_MANAGE)
  @Post()
  create(@Body() dto: CreateDepartmentLevelDto) {
    return this.departmentLevelsService.create(dto);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Danh sách cấp đơn vị (phân trang)' })
  @UseGuards(JwtGuard, PermissionsGuard)
  @Permissions(Permission.DEPARTMENT_VIEW)
  @Get('all')
  findAll(@Query() query: PaginationQueryDto) {
    return this.departmentLevelsService.findAll(query);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Chi tiết cấp đơn vị' })
  @UseGuards(JwtGuard, PermissionsGuard)
  @Permissions(Permission.DEPARTMENT_VIEW)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.departmentLevelsService.findOne(id);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cập nhật cấp đơn vị' })
  @UseGuards(JwtGuard, PermissionsGuard)
  @Permissions(Permission.DEPARTMENT_MANAGE)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateDepartmentLevelDto) {
    return this.departmentLevelsService.update(id, dto);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Xóa cấp đơn vị' })
  @UseGuards(JwtGuard, PermissionsGuard)
  @Permissions(Permission.DEPARTMENT_MANAGE)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.departmentLevelsService.remove(id);
  }
}
