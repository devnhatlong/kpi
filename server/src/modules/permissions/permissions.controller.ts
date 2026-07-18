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

import { PermissionsService } from './permissions.service';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { PermissionsGuard } from '@/common/guards/permissions.guard';
import { Permissions } from '@/common/decorators';
import { Permission } from '@/common/enums/permission.enum';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';

@ApiTags('Permissions (Quyền)')
@Controller('permissions')
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tạo quyền' })
  @UseGuards(JwtGuard, PermissionsGuard)
  @Permissions(Permission.SYSTEM_CONFIG)
  @Post()
  create(@Body() dto: CreatePermissionDto) {
    return this.permissionsService.create(dto);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Danh sách quyền (phân trang)' })
  @UseGuards(JwtGuard, PermissionsGuard)
  @Permissions(Permission.ROLE_ASSIGN)
  @Get('all')
  findAll(@Query() query: PaginationQueryDto) {
    return this.permissionsService.findAll(query);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Chi tiết quyền' })
  @UseGuards(JwtGuard, PermissionsGuard)
  @Permissions(Permission.ROLE_ASSIGN)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.permissionsService.findOne(id);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cập nhật quyền' })
  @UseGuards(JwtGuard, PermissionsGuard)
  @Permissions(Permission.SYSTEM_CONFIG)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePermissionDto) {
    return this.permissionsService.update(id, dto);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Xóa quyền (không xóa quyền hệ thống)' })
  @UseGuards(JwtGuard, PermissionsGuard)
  @Permissions(Permission.SYSTEM_CONFIG)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.permissionsService.remove(id);
  }
}
