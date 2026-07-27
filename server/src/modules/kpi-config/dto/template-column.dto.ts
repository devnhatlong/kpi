import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { StringRequired } from '@/common/decorators';
import { TemplateColumnDataType } from '../schemas/kpi-template.schema';

export class TemplateColumnDto {
  @StringRequired('ID cột')
  id!: string;

  @StringRequired('Mã trường')
  key!: string;

  @StringRequired('Nhãn cột')
  title!: string;

  @ApiPropertyOptional({ type: [String], default: [] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  headerPath?: string[];

  @ApiProperty({ example: 140, minimum: 1 })
  @IsNumber()
  @Min(1)
  width!: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  visible?: boolean;

  @ApiPropertyOptional({ example: 'MANAGER' })
  @IsOptional()
  @IsString()
  inputRoleCode?: string;

  @ApiProperty({ enum: TemplateColumnDataType })
  @IsEnum(TemplateColumnDataType, { message: 'Kiểu dữ liệu không hợp lệ.' })
  dataType!: TemplateColumnDataType;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  required?: boolean;
}
