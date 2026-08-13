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
  ChangeSummaryItemsDto,
  CreateSummaryReportDto,
  SummaryCandidatesQueryDto,
  SummaryReportListQueryDto,
  UpdateSummaryReportDto,
} from './dto/kpi-summary-report.dto';
import { KpiSummaryReportsService } from './kpi-summary-reports.service';

/**
 * Tiền tố riêng chứ không nằm dưới /personal-kpi: controller đó có @Get(':id')
 * bắt mọi đoạn đường còn lại, thêm route con vào sẽ bị nó nuốt.
 */
@ApiTags('KPI Summary Reports')
@ApiBearerAuth()
@UseGuards(JwtGuard, PermissionsGuard)
@Permissions(Permission.EVALUATION_APPROVE)
@Controller('kpi-summary-reports')
export class KpiSummaryReportsController {
  constructor(private readonly service: KpiSummaryReportsService) {}

  @ApiOperation({
    summary: 'Kho nhiệm vụ đã hoàn thành để nhặt vào báo cáo, gom theo trục',
  })
  @Get('candidates')
  candidates(
    @CurrentUser() user: JwtPayloadUser,
    @Query() query: SummaryCandidatesQueryDto,
  ) {
    return this.service.candidates(user.uid, query);
  }

  @ApiOperation({ summary: 'Danh sách báo cáo tổng của tôi' })
  @Get()
  findAll(
    @CurrentUser() user: JwtPayloadUser,
    @Query() query: SummaryReportListQueryDto,
  ) {
    return this.service.findAll(user.uid, query);
  }

  @ApiOperation({ summary: 'Tạo báo cáo tổng từ các nhiệm vụ đã tích' })
  @Post()
  create(
    @CurrentUser() user: JwtPayloadUser,
    @Body() dto: CreateSummaryReportDto,
  ) {
    return this.service.create(user.uid, dto);
  }

  @ApiOperation({ summary: 'Chi tiết báo cáo tổng - nhiệm vụ gom theo trục' })
  @Get(':id')
  findOne(@CurrentUser() user: JwtPayloadUser, @Param('id') id: string) {
    return this.service.findOne(user.uid, id);
  }

  @ApiOperation({ summary: 'Sửa thông tin / danh sách nhiệm vụ của báo cáo' })
  @Patch(':id')
  update(
    @CurrentUser() user: JwtPayloadUser,
    @Param('id') id: string,
    @Body() dto: UpdateSummaryReportDto,
  ) {
    return this.service.update(user.uid, id, dto);
  }

  @ApiOperation({ summary: 'Thêm nhiệm vụ vào báo cáo nháp' })
  @Post(':id/items')
  addItems(
    @CurrentUser() user: JwtPayloadUser,
    @Param('id') id: string,
    @Body() dto: ChangeSummaryItemsDto,
  ) {
    return this.service.addItems(user.uid, id, dto);
  }

  @ApiOperation({ summary: 'Bỏ nhiệm vụ khỏi báo cáo nháp' })
  @Post(':id/items/remove')
  removeItems(
    @CurrentUser() user: JwtPayloadUser,
    @Param('id') id: string,
    @Body() dto: ChangeSummaryItemsDto,
  ) {
    return this.service.removeItems(user.uid, id, dto);
  }

  @ApiOperation({ summary: 'Chốt báo cáo tổng' })
  @Post(':id/finalize')
  finalize(@CurrentUser() user: JwtPayloadUser, @Param('id') id: string) {
    return this.service.finalize(user.uid, id);
  }

  @ApiOperation({ summary: 'Mở lại báo cáo đã chốt để sửa' })
  @Post(':id/reopen')
  reopen(@CurrentUser() user: JwtPayloadUser, @Param('id') id: string) {
    return this.service.reopen(user.uid, id);
  }

  @ApiOperation({ summary: 'Xoá báo cáo tổng còn nháp' })
  @Delete(':id')
  remove(@CurrentUser() user: JwtPayloadUser, @Param('id') id: string) {
    return this.service.remove(user.uid, id);
  }
}
