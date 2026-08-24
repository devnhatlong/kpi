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
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';
import { CurrentUser, Permissions } from '@/common/decorators';
import { Permission } from '@/common/enums/permission.enum';
import { PermissionsGuard } from '@/common/guards/permissions.guard';
import type { JwtPayloadUser } from '@/common/interfaces';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { ReportTemplatesService } from './report-templates.service';
import { CreateReportTemplateDto } from './dto/create-report-template.dto';
import { UpdateReportTemplateDto } from './dto/update-report-template.dto';

/** Năm gửi lên dạng chuỗi; sai định dạng thì bỏ qua để server tự chốt năm. */
function parseYear(value?: string): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

@ApiTags('KPI Form Config')
@ApiBearerAuth()
@UseGuards(JwtGuard, PermissionsGuard)
@Controller('kpi-form-config/report-templates')
export class ReportTemplatesController {
  constructor(
    private readonly reportTemplatesService: ReportTemplatesService,
  ) {}

  @ApiOperation({ summary: 'Tạo mẫu báo cáo' })
  @Permissions(Permission.KPI_MANAGE)
  @Post()
  create(@Body() dto: CreateReportTemplateDto) {
    return this.reportTemplatesService.create(dto);
  }

  @ApiOperation({ summary: 'Danh sách mẫu báo cáo' })
  @Permissions(Permission.TASK_VIEW)
  @Get('all')
  findAll(@Query() query: PaginationQueryDto) {
    return this.reportTemplatesService.findAll(query);
  }

  /*
    Các route chữ cố định phải đứng TRÊN ':id' - để dưới thì 'mine' và 'resolve'
    bị bắt làm id rồi trả 404.
  */
  @ApiOperation({
    summary: 'Mẫu báo cáo áp dụng cho đơn vị của người đang đăng nhập',
  })
  @ApiQuery({ name: 'year', required: false })
  @Permissions(Permission.TASK_VIEW)
  @Get('mine')
  resolveMine(
    @CurrentUser() user: JwtPayloadUser,
    @Query('year') year?: string,
  ) {
    return this.reportTemplatesService.resolveForUser(
      user.uid,
      parseYear(year),
    );
  }

  @ApiOperation({ summary: 'Mẫu báo cáo áp dụng cho một đơn vị bất kỳ' })
  @ApiQuery({ name: 'year', required: false })
  @Permissions(Permission.KPI_MANAGE)
  @Get('resolve/:departmentId')
  resolveForDepartment(
    @Param('departmentId') departmentId: string,
    @Query('year') year?: string,
  ) {
    return this.reportTemplatesService.resolveForDepartment(
      departmentId,
      parseYear(year),
    );
  }

  @ApiOperation({ summary: 'Chi tiết mẫu báo cáo' })
  @Permissions(Permission.TASK_VIEW)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.reportTemplatesService.findOne(id);
  }

  @ApiOperation({ summary: 'Cập nhật mẫu báo cáo' })
  @Permissions(Permission.KPI_MANAGE)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateReportTemplateDto) {
    return this.reportTemplatesService.update(id, dto);
  }

  @ApiOperation({ summary: 'Áp dụng mẫu báo cáo cho năm của nó' })
  @Permissions(Permission.KPI_MANAGE)
  @Post(':id/apply')
  apply(@Param('id') id: string) {
    return this.reportTemplatesService.apply(id);
  }

  @ApiOperation({ summary: 'Gỡ áp dụng mẫu báo cáo' })
  @Permissions(Permission.KPI_MANAGE)
  @Post(':id/unapply')
  unapply(@Param('id') id: string) {
    return this.reportTemplatesService.unapply(id);
  }

  @ApiOperation({ summary: 'Xoá mẫu báo cáo' })
  @Permissions(Permission.KPI_MANAGE)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.reportTemplatesService.remove(id);
  }
}
