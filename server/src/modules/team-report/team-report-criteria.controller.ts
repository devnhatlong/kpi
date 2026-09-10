import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Permissions } from '@/common/decorators/permissions.decorator';
import { Permission } from '@/common/enums/permission.enum';
import { PermissionsGuard } from '@/common/guards/permissions.guard';
import type { JwtPayloadUser } from '@/common/interfaces/jwt-payload-user.interface';
import { JwtGuard } from '../auth/guards/jwt.guard';
import {
  SaveTeamReportCriteriaDto,
  TeamReportCriteriaQueryDto,
} from './dto/team-report.dto';
import { TeamReportCriteriaService } from './team-report-criteria.service';

/** Bảng A "Danh mục điểm tiêu chí chung" của đội - tháng một bản. */
@ApiTags('Team Report')
@ApiBearerAuth()
@UseGuards(JwtGuard, PermissionsGuard)
@Controller('team-report/criteria')
export class TeamReportCriteriaController {
  constructor(private readonly criteriaService: TeamReportCriteriaService) {}

  @ApiOperation({ summary: 'Bảng tiêu chí chung của một tháng' })
  @Permissions(Permission.TEAM_REPORT_ENTRY)
  @Get()
  sheet(
    @CurrentUser() user: JwtPayloadUser,
    @Query() query: TeamReportCriteriaQueryDto,
  ) {
    return this.criteriaService.sheet(user.uid, query);
  }

  @ApiOperation({ summary: 'Chấm các ô của bảng tiêu chí chung' })
  @Permissions(Permission.TEAM_REPORT_ENTRY)
  @Patch(':periodMonth')
  save(
    @CurrentUser() user: JwtPayloadUser,
    @Param('periodMonth') periodMonth: string,
    @Body() dto: SaveTeamReportCriteriaDto,
  ) {
    return this.criteriaService.save(user.uid, periodMonth, dto);
  }
}
