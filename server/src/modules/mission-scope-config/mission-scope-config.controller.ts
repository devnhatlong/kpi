import { Body, Controller, Get, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '@/common/decorators';
import { Permission } from '@/common/enums/permission.enum';
import { PermissionsGuard } from '@/common/guards/permissions.guard';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { SaveMissionScopeConfigDto } from './dto/mission-scope-config.dto';
import { MissionScopeConfigService } from './mission-scope-config.service';

@ApiTags('Mission Scope Config')
@ApiBearerAuth()
@UseGuards(JwtGuard, PermissionsGuard)
@Controller('mission-scope-config')
export class MissionScopeConfigController {
  constructor(private readonly service: MissionScopeConfigService) {}

  // Đọc và ghi cùng một quyền: chỉ màn cấu hình gọi endpoint này, để TASK_VIEW
  // thì ai xem nhiệm vụ cũng mở được trang mà không lưu nổi.
  @ApiOperation({ summary: 'Phạm vi giao nhiệm vụ của từng vai trò' })
  @Permissions(Permission.SYSTEM_CONFIG)
  @Get()
  findAll() {
    return this.service.findAll();
  }

  @ApiOperation({ summary: 'Lưu cấu hình phạm vi giao nhiệm vụ' })
  @Permissions(Permission.SYSTEM_CONFIG)
  @Put()
  save(@Body() dto: SaveMissionScopeConfigDto) {
    return this.service.save(dto);
  }

  @ApiOperation({ summary: 'Khôi phục cấu hình mặc định' })
  @Permissions(Permission.SYSTEM_CONFIG)
  @Post('reset')
  reset() {
    return this.service.resetToDefault();
  }
}
