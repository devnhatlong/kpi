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
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';
import { Permissions } from '@/common/decorators';
import { Permission } from '@/common/enums/permission.enum';
import { PermissionsGuard } from '@/common/guards/permissions.guard';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { FormTemplatesService } from './form-templates.service';
import { CreateFormTemplateDto } from './dto/create-form-template.dto';
import { UpdateFormTemplateDto } from './dto/update-form-template.dto';

@ApiTags('KPI Form Config')
@ApiBearerAuth()
@UseGuards(JwtGuard, PermissionsGuard)
@Controller('kpi-form-config/form-templates')
export class FormTemplatesController {
  constructor(private readonly formTemplatesService: FormTemplatesService) {}

  @ApiOperation({ summary: 'Tạo mẫu bảng KPI' })
  @Permissions(Permission.KPI_MANAGE)
  @Post()
  create(@Body() dto: CreateFormTemplateDto) {
    return this.formTemplatesService.create(dto);
  }

  @ApiOperation({ summary: 'Danh sách mẫu bảng KPI' })
  @Permissions(Permission.TASK_VIEW)
  @Get('all')
  findAll(@Query() query: PaginationQueryDto) {
    return this.formTemplatesService.findAll(query);
  }

  @ApiOperation({ summary: 'Mẫu bảng đang áp dụng cho một trục' })
  @Permissions(Permission.TASK_VIEW)
  @Get('by-axis/:axisId')
  findByAxis(@Param('axisId') axisId: string) {
    return this.formTemplatesService.findByAxis(axisId);
  }

  @ApiOperation({ summary: 'Chi tiết mẫu bảng KPI' })
  @Permissions(Permission.TASK_VIEW)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.formTemplatesService.findOne(id);
  }

  @ApiOperation({ summary: 'Cập nhật mẫu bảng KPI' })
  @Permissions(Permission.KPI_MANAGE)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateFormTemplateDto) {
    return this.formTemplatesService.update(id, dto);
  }

  @ApiOperation({ summary: 'Xoá mẫu bảng KPI' })
  @Permissions(Permission.KPI_MANAGE)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.formTemplatesService.remove(id);
  }
}
