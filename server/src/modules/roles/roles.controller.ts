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
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { PermissionsGuard } from '@/common/guards/permissions.guard';
import { Permissions } from '@/common/decorators';
import { Permission } from '@/common/enums/permission.enum';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';

@ApiTags('Roles (Vai trò)')
@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tạo vai trò' })
  @UseGuards(JwtGuard, PermissionsGuard)
  @Permissions(Permission.ROLE_ASSIGN)
  @Post()
  create(@Body() dto: CreateRoleDto) {
    return this.rolesService.create(dto);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Danh sách vai trò (phân trang)' })
  @UseGuards(JwtGuard, PermissionsGuard)
  @Permissions(Permission.ROLE_ASSIGN)
  @Get('all')
  findAll(@Query() query: PaginationQueryDto) {
    return this.rolesService.findAll(query);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Chi tiết vai trò' })
  @UseGuards(JwtGuard, PermissionsGuard)
  @Permissions(Permission.ROLE_ASSIGN)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.rolesService.findOne(id);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cập nhật vai trò' })
  @UseGuards(JwtGuard, PermissionsGuard)
  @Permissions(Permission.ROLE_ASSIGN)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
    return this.rolesService.update(id, dto);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Xóa vai trò (không xóa role hệ thống)' })
  @UseGuards(JwtGuard, PermissionsGuard)
  @Permissions(Permission.ROLE_ASSIGN)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.rolesService.remove(id);
  }
}
