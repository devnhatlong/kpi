import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsMongoId,
  IsNumber,
  IsOptional,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  StringNotRequired,
  StringRequired,
} from '@/common/decorators';
import {
  KpiMasterFormScope,
  KpiMasterFormStatus,
} from '../schemas/kpi-master-form.schema';

export class KpiIndicatorDto {
  @StringRequired('Mã chỉ tiêu')
  code!: string;

  @StringRequired('Tên chỉ tiêu')
  name!: string;

  @StringNotRequired('Mô tả')
  description?: string;

  @ApiProperty({ example: 30 })
  @IsNumber()
  @Min(0)
  @Max(100)
  weight!: number;

  @StringNotRequired('Tiêu chí đánh giá')
  criteria?: string;

  @StringNotRequired('Đơn vị tính')
  unit?: string;

  @StringNotRequired('Minh chứng bắt buộc')
  evidenceRequired?: string;

  @StringNotRequired('Cách tính điểm')
  scoringMethod?: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  sortOrder?: number;
}

export class CreateKpiMasterFormDto {
  @StringRequired('Tên form')
  name!: string;

  @StringRequired('Mã form')
  @MinLength(2)
  code!: string;

  @StringNotRequired('Mô tả')
  description?: string;

  @ApiPropertyOptional({ example: 'KPI' })
  @StringNotRequired('Loại form')
  formType?: string;

  @ApiProperty()
  @IsMongoId({ message: 'Kỳ KPI không hợp lệ.' })
  periodId!: string;

  @ApiProperty({ description: 'Template header/cột Form 1' })
  @IsMongoId({ message: 'Biểu mẫu cột không hợp lệ.' })
  templateId!: string;

  @ApiPropertyOptional({ enum: KpiMasterFormScope })
  @IsOptional()
  @IsEnum(KpiMasterFormScope)
  scopeType?: KpiMasterFormScope;

  @ApiPropertyOptional({ description: 'CAT khi scope = PROVINCE' })
  @IsOptional()
  @IsMongoId()
  provinceDepartmentId?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  targetDepartmentIds?: string[];

  @ApiProperty({ type: [KpiIndicatorDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'Cần ít nhất một chỉ tiêu.' })
  @ValidateNested({ each: true })
  @Type(() => KpiIndicatorDto)
  indicators!: KpiIndicatorDto[];
}

export class UpdateKpiMasterFormDto {
  @StringNotRequired('Tên form')
  name?: string;

  @StringNotRequired('Mô tả')
  description?: string;

  @StringNotRequired('Loại form')
  formType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  periodId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  templateId?: string;

  @ApiPropertyOptional({ enum: KpiMasterFormScope })
  @IsOptional()
  @IsEnum(KpiMasterFormScope)
  scopeType?: KpiMasterFormScope;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  provinceDepartmentId?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  targetDepartmentIds?: string[];

  @ApiPropertyOptional({ type: [KpiIndicatorDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => KpiIndicatorDto)
  indicators?: KpiIndicatorDto[];

  @ApiPropertyOptional({ enum: KpiMasterFormStatus })
  @IsOptional()
  @IsEnum(KpiMasterFormStatus)
  status?: KpiMasterFormStatus;
}
