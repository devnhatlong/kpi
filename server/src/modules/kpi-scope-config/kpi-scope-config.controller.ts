import { Body, Controller, Get, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '@/common/decorators';
import { Permission } from '@/common/enums/permission.enum';
import { PermissionsGuard } from '@/common/guards/permissions.guard';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { SaveKpiScopeConfigDto } from './dto/kpi-scope-config.dto';
import { KpiScopeConfigService } from './kpi-scope-config.service';

@ApiTags('KPI Scope Config')
@ApiBearerAuth()
@UseGuards(JwtGuard, PermissionsGuard)
@Controller('kpi-scope-config')
export class KpiScopeConfigController {
  constructor(private readonly service: KpiScopeConfigService) {}

  // Đọc và ghi cùng một quyền: chỉ màn cấu hình gọi endpoint này, để TASK_VIEW
  // thì ai xem nhiệm vụ cũng mở được trang mà không lưu nổi.
  @ApiOperation({ summary: 'Phạm vi giao KPI của từng vai trò' })
  @Permissions(Permission.SYSTEM_CONFIG)
  @Get()
  findAll() {
    return this.service.findAll();
  }

  @ApiOperation({ summary: 'Lưu cấu hình phạm vi giao KPI' })
  @Permissions(Permission.SYSTEM_CONFIG)
  @Put()
  save(@Body() dto: SaveKpiScopeConfigDto) {
    return this.service.save(dto);
  }

  @ApiOperation({ summary: 'Khôi phục cấu hình mặc định' })
  @Permissions(Permission.SYSTEM_CONFIG)
  @Post('reset')
  reset() {
    return this.service.resetToDefault();
  }
}
