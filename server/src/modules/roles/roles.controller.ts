import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RolesService } from './roles.service';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { PermissionsGuard } from '@/common/guards/permissions.guard';
import { Permissions } from '@/common/decorators';
import { Permission } from '@/common/enums/permission.enum';

@ApiTags('Roles (Vai trò)')
@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Danh sách vai trò' })
  @UseGuards(JwtGuard, PermissionsGuard)
  @Permissions(Permission.ROLE_ASSIGN)
  @Get('all')
  async getAllRoles() {
    return await this.rolesService.findAll();
  }
}
