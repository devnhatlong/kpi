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

import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { AdminCreateUserDto } from './dto/admin-create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ImportUsersDto } from './dto/import-users.dto';
import { BulkDeleteUsersDto } from './dto/bulk-delete-users.dto';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { PermissionsGuard } from '@/common/guards/permissions.guard';
import { Permissions } from '@/common/decorators';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import type { JwtPayloadUser } from '@/common/interfaces/jwt-payload-user.interface';
import { Permission } from '@/common/enums/permission.enum';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';

@ApiTags('Users (Người dùng)')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @ApiOperation({ summary: 'Đăng ký tài khoản (username + password)' })
  @Post('register')
  register(@Body() createUserDto: CreateUserDto) {
    return this.usersService.register(createUserDto);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Thêm người dùng (admin)' })
  @UseGuards(JwtGuard, PermissionsGuard)
  @Permissions(Permission.USER_MANAGE)
  @Post()
  create(@Body() dto: AdminCreateUserDto) {
    return this.usersService.create(dto);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Import người dùng từ Excel (JSON rows)' })
  @UseGuards(JwtGuard, PermissionsGuard)
  @Permissions(Permission.USER_MANAGE)
  @Post('import')
  importMany(@Body() dto: ImportUsersDto) {
    return this.usersService.importMany(dto.rows);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Danh sách người dùng (phân trang)' })
  @UseGuards(JwtGuard, PermissionsGuard)
  @Permissions(Permission.USER_VIEW)
  @Get('all')
  findAll(@Query() query: PaginationQueryDto) {
    return this.usersService.findAll(query);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Xoá nhiều người dùng đã chọn' })
  @UseGuards(JwtGuard, PermissionsGuard)
  @Permissions(Permission.USER_MANAGE)
  @Post('bulk-delete')
  bulkRemove(
    @CurrentUser() user: JwtPayloadUser,
    @Body() dto: BulkDeleteUsersDto,
  ) {
    return this.usersService.removeMany(dto.ids, user.uid);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Chi tiết người dùng' })
  @UseGuards(JwtGuard, PermissionsGuard)
  @Permissions(Permission.USER_VIEW)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cập nhật thông tin người dùng' })
  @UseGuards(JwtGuard, PermissionsGuard)
  @Permissions(Permission.USER_MANAGE)
  @Patch(':id')
  update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(id, updateUserDto);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Xóa người dùng' })
  @UseGuards(JwtGuard, PermissionsGuard)
  @Permissions(Permission.USER_MANAGE)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }
}
