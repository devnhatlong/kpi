import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { RolesService } from './roles.service';
import { JwtGuard } from '../auth/guards/jwt.guard';

@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) { }

  @UseGuards(JwtGuard)
  @Get('all')
  async getAllRoles(@Req() req: any) {
    return await this.rolesService.findAll();
  }
}
