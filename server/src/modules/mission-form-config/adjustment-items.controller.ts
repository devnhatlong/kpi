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

import { Permissions } from '@/common/decorators';
import { Permission } from '@/common/enums/permission.enum';
import { PermissionsGuard } from '@/common/guards/permissions.guard';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { AdjustmentItemsService } from './adjustment-items.service';
import {
  AdjustmentItemQueryDto,
  CreateAdjustmentItemDto,
} from './dto/create-adjustment-item.dto';
import { UpdateAdjustmentItemDto } from './dto/update-adjustment-item.dto';

/** Danh mục điểm cộng / điểm trừ / điều chỉnh xếp loại - quản trị khai sẵn. */
@ApiTags('Mission Form Config')
@ApiBearerAuth()
@UseGuards(JwtGuard, PermissionsGuard)
@Controller('mission-form-config/adjustments')
export class AdjustmentItemsController {
  constructor(private readonly service: AdjustmentItemsService) {}

  @ApiOperation({ summary: 'Thêm một dòng điểm cộng / trừ / xếp loại' })
  @Permissions(Permission.MISSION_MANAGE)
  @Post()
  create(@Body() dto: CreateAdjustmentItemDto) {
    return this.service.create(dto);
  }

  @ApiOperation({ summary: 'Danh sách, lọc được theo phần' })
  @Permissions(Permission.TASK_VIEW)
  @Get('all')
  findAll(@Query() query: AdjustmentItemQueryDto) {
    return this.service.findAll(query);
  }

  @ApiOperation({ summary: 'Số dòng từng phần và tổng điểm cộng tối đa' })
  @Permissions(Permission.TASK_VIEW)
  @Get('summary')
  summary() {
    return this.service.summary();
  }

  @ApiOperation({ summary: 'Chi tiết một dòng' })
  @Permissions(Permission.TASK_VIEW)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @ApiOperation({ summary: 'Cập nhật một dòng' })
  @Permissions(Permission.MISSION_MANAGE)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAdjustmentItemDto) {
    return this.service.update(id, dto);
  }

  @ApiOperation({ summary: 'Xoá một dòng' })
  @Permissions(Permission.MISSION_MANAGE)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
