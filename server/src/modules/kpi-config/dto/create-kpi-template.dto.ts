import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsMongoId,
  IsNumber,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  BooleanNotRequired,
  StringNotRequired,
  StringRequired,
} from '@/common/decorators';
import { TemplateVisibilityScope } from '../schemas/kpi-template.schema';
import { TemplateColumnDto } from './template-column.dto';
import { TemplateHeaderGroupDto } from './template-header-group.dto';

export class CreateKpiTemplateDto {
  @StringRequired('Tên biểu mẫu', { example: 'Biểu mẫu KPI mặc định' })
  name!: string;

  @StringRequired('Mã biểu mẫu', { example: 'KPI_DEFAULT' })
  code!: string;

  @ApiPropertyOptional({ type: [TemplateColumnDto], default: [] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TemplateColumnDto)
  columns?: TemplateColumnDto[];

  @ApiPropertyOptional({ type: [TemplateHeaderGroupDto], default: [] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TemplateHeaderGroupDto)
  headerGroups?: TemplateHeaderGroupDto[];

  @ApiPropertyOptional({ type: [String], default: [] })
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true, message: 'Nội dung công việc không hợp lệ.' })
  includedContentIds?: string[];

  @ApiPropertyOptional({ example: 50 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  progressWeight?: number;

  @ApiPropertyOptional({ example: 50 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  qualityWeight?: number;

  @ApiPropertyOptional({ enum: TemplateVisibilityScope, default: 'ALL' })
  @IsOptional()
  @IsEnum(TemplateVisibilityScope, {
    message: 'Phạm vi xem biểu mẫu không hợp lệ.',
  })
  visibilityScope?: TemplateVisibilityScope;

  @ApiPropertyOptional({ type: [String], default: [] })
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true, message: 'Role không hợp lệ.' })
  assignedRoleIds?: string[];

  @ApiPropertyOptional({ type: [String], default: [] })
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true, message: 'Tài khoản không hợp lệ.' })
  assignedUserIds?: string[];

  @BooleanNotRequired('Trạng thái hoạt động', { example: true })
  isActive?: boolean;
}
