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
import { CurrentUser, Permissions } from '@/common/decorators';
import { Permission } from '@/common/enums/permission.enum';
import { PermissionsGuard } from '@/common/guards/permissions.guard';
import type { JwtPayloadUser } from '@/common/interfaces/jwt-payload-user.interface';
import { JwtGuard } from '../auth/guards/jwt.guard';
import {
  CreatePersonalKpiBatchDto,
  PersonalKpiListQueryDto,
  PersonalKpiReportsQueryDto,
  SendPersonalKpiDto,
  UpdatePersonalKpiDto,
} from './dto/personal-kpi.dto';
import { PersonalKpiService } from './personal-kpi.service';

@ApiTags('Personal KPI')
@ApiBearerAuth()
@UseGuards(JwtGuard, PermissionsGuard)
@Controller('personal-kpi')
export class PersonalKpiController {
  constructor(private readonly personalKpiService: PersonalKpiService) {}

  @ApiOperation({ summary: 'Tạo nhiều nhiệm vụ nháp KPI cá nhân' })
  @Permissions(Permission.EVALUATION_SELF)
  @Post('batch')
  createBatch(
    @CurrentUser() user: JwtPayloadUser,
    @Body() dto: CreatePersonalKpiBatchDto,
  ) {
    return this.personalKpiService.createMany(user.uid, dto);
  }

  @ApiOperation({ summary: 'Danh sách báo cáo theo ngày (tổng hợp)' })
  @Permissions(Permission.EVALUATION_SELF)
  @Get('reports')
  findReports(
    @CurrentUser() user: JwtPayloadUser,
    @Query() query: PersonalKpiReportsQueryDto,
  ) {
    return this.personalKpiService.findReports(user.uid, query);
  }

  @ApiOperation({
    summary: 'Danh sách người nhận cấp trên 1 bậc (đơn vị cha) để chọn khi gửi',
  })
  @Permissions(Permission.EVALUATION_SELF)
  @Get('recipients')
  listRecipients(
    @CurrentUser() user: JwtPayloadUser,
    @Query('q') q?: string,
  ) {
    return this.personalKpiService.listRecipients(user.uid, q);
  }

  @ApiOperation({ summary: 'Danh sách nhiệm vụ KPI cá nhân của tôi' })
  @Permissions(Permission.EVALUATION_SELF)
  @Get('mine')
  findMine(
    @CurrentUser() user: JwtPayloadUser,
    @Query() query: PersonalKpiListQueryDto,
  ) {
    return this.personalKpiService.findMine(user.uid, query);
  }

  @ApiOperation({ summary: 'Gửi toàn bộ nhiệm vụ nháp/từ chối của một ngày' })
  @Permissions(Permission.EVALUATION_SELF)
  @Post('reports/:reportDate/send')
  sendReport(
    @CurrentUser() user: JwtPayloadUser,
    @Param('reportDate') reportDate: string,
    @Body() dto: SendPersonalKpiDto,
  ) {
    return this.personalKpiService.sendReport(user.uid, reportDate, dto);
  }

  @ApiOperation({ summary: 'Chi tiết nhiệm vụ KPI cá nhân' })
  @Permissions(Permission.EVALUATION_SELF)
  @Get(':id')
  findOne(@CurrentUser() user: JwtPayloadUser, @Param('id') id: string) {
    return this.personalKpiService.findOne(user.uid, id);
  }

  @ApiOperation({ summary: 'Cập nhật nhiệm vụ nháp / từ chối' })
  @Permissions(Permission.EVALUATION_SELF)
  @Patch(':id')
  update(
    @CurrentUser() user: JwtPayloadUser,
    @Param('id') id: string,
    @Body() dto: UpdatePersonalKpiDto,
  ) {
    return this.personalKpiService.update(user.uid, id, dto);
  }

  @ApiOperation({ summary: 'Gửi nhiệm vụ' })
  @Permissions(Permission.EVALUATION_SELF)
  @Post(':id/send')
  send(
    @CurrentUser() user: JwtPayloadUser,
    @Param('id') id: string,
    @Body() dto: SendPersonalKpiDto,
  ) {
    return this.personalKpiService.send(user.uid, id, dto);
  }

  @ApiOperation({ summary: 'Xoá nhiệm vụ nháp / từ chối' })
  @Permissions(Permission.EVALUATION_SELF)
  @Delete(':id')
  remove(@CurrentUser() user: JwtPayloadUser, @Param('id') id: string) {
    return this.personalKpiService.remove(user.uid, id);
  }
}
