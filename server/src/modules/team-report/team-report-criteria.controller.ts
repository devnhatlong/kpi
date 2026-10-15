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
@UseGuards(JwtGuard)
@Controller('team-report/criteria')
export class TeamReportCriteriaController {
  constructor(private readonly criteriaService: TeamReportCriteriaService) {}

  /*
    Không gắn @Permissions: guard đòi ĐỦ mọi quyền liệt kê, mà bảng A mở cho
    đội (nhập) HOẶC phòng / xã (duyệt + vai trưởng đơn vị). Service tự kiểm.
  */
  @ApiOperation({ summary: 'Bảng tiêu chí chung của một tháng' })
  @Get()
  sheet(
    @CurrentUser() user: JwtPayloadUser,
    @Query() query: TeamReportCriteriaQueryDto,
  ) {
    return this.criteriaService.sheet(user.uid, query);
  }

  @ApiOperation({
    summary: 'Bảng A các đơn vị trực thuộc đã gửi lên trong tháng - để tham khảo',
  })
  @Get('references')
  references(
    @CurrentUser() user: JwtPayloadUser,
    @Query() query: TeamReportCriteriaQueryDto,
  ) {
    return this.criteriaService.references(user.uid, query);
  }

  @ApiOperation({ summary: 'Chấm các ô của bảng tiêu chí chung' })
  @Patch(':periodMonth')
  save(
    @CurrentUser() user: JwtPayloadUser,
    @Param('periodMonth') periodMonth: string,
    @Body() dto: SaveTeamReportCriteriaDto,
  ) {
    return this.criteriaService.save(user.uid, periodMonth, dto);
  }
}
