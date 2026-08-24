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
import { Permissions } from '@/common/decorators';
import { Permission } from '@/common/enums/permission.enum';
import { PermissionsGuard } from '@/common/guards/permissions.guard';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { ReportTemplatesService } from './report-templates.service';
import { CreateReportTemplateDto } from './dto/create-report-template.dto';
import { UpdateReportTemplateDto } from './dto/update-report-template.dto';

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

  /* Đặt trên ':id' - để dưới thì 'current' bị bắt làm id rồi trả 404. */
  @ApiOperation({ summary: 'Mẫu báo cáo đang áp dụng của một năm' })
  @ApiQuery({
    name: 'year',
    required: false,
    description: 'Bỏ trống = năm hiện tại theo giờ server',
  })
  @Permissions(Permission.TASK_VIEW)
  @Get('current')
  findCurrent(@Query('year') year?: string) {
    const parsed = year ? Number(year) : undefined;
    return this.reportTemplatesService.findCurrent(
      Number.isFinite(parsed) ? parsed : undefined,
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

  @ApiOperation({ summary: 'Xoá mẫu báo cáo' })
  @Permissions(Permission.KPI_MANAGE)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.reportTemplatesService.remove(id);
  }
}
