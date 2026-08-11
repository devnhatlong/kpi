import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import {
  BooleanNotRequired,
  NumberNotRequired,
  StringNotRequired,
  StringRequired,
} from '@/common/decorators';
import {
  FORM_COLUMN_DATA_TYPES,
  FORM_COLUMN_SEMANTICS,
  type FormColumnDataType,
  type FormColumnSemantic,
} from '../schemas/form-template.schema';

export class FormHeaderGroupDto {
  @StringRequired('ID nhóm header', { example: 'grp-1' })
  id!: string;

  @StringRequired('Tên nhóm header', { example: 'Kết quả theo dõi' })
  name!: string;

  @ApiPropertyOptional({ type: () => [FormHeaderGroupDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FormHeaderGroupDto)
  children?: FormHeaderGroupDto[];
}

export class FormTemplateColumnDto {
  @StringRequired('ID cột', { example: 'col-1' })
  id!: string;

  @StringRequired('Khoá cột', { example: 'task_title' })
  key!: string;

  @StringRequired('Tiêu đề cột', { example: 'Nhiệm vụ' })
  title!: string;

  @ApiPropertyOptional({ type: [String], description: 'Đường dẫn nhóm header' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true, message: 'headerPath phải là mảng chuỗi.' })
  headerPath?: string[];

  @NumberNotRequired('Độ rộng cột (px)', { example: 160 })
  width?: number;

  @BooleanNotRequired('Hiển thị cột', { example: true })
  visible?: boolean;

  @ApiProperty({ enum: FORM_COLUMN_DATA_TYPES, default: 'text' })
  @IsOptional()
  @IsEnum(FORM_COLUMN_DATA_TYPES, { message: 'Kiểu dữ liệu cột không hợp lệ.' })
  dataType?: FormColumnDataType;

  @ApiProperty({ enum: FORM_COLUMN_SEMANTICS, default: 'custom' })
  @IsOptional()
  @IsEnum(FORM_COLUMN_SEMANTICS, { message: 'Ý nghĩa cột không hợp lệ.' })
  semanticKey?: FormColumnSemantic;

  @BooleanNotRequired('Bắt buộc nhập', { example: false })
  required?: boolean;

  @ApiPropertyOptional({
    description: 'Khoá cột Nhóm điểm quyết định dải điểm hợp lệ cho cột này',
    example: 'score_group',
  })
  @IsOptional()
  @IsString({ message: 'rangeFromColumnKey phải là chuỗi.' })
  rangeFromColumnKey?: string | null;
}

export class CreateFormTemplateDto {
  @StringNotRequired('Mã mẫu (để trống sẽ tự sinh)', { example: 'MAU-0001' })
  code?: string;

  @StringRequired('Tên mẫu bảng', { example: 'Mẫu trục nghiệp vụ' })
  name!: string;

  @StringNotRequired('Mô tả')
  description?: string;

  @ApiProperty({ type: [FormTemplateColumnDto] })
  @IsArray()
  @ArrayNotEmpty({ message: 'Mẫu bảng phải có ít nhất một cột.' })
  @ValidateNested({ each: true })
  @Type(() => FormTemplateColumnDto)
  columns!: FormTemplateColumnDto[];

  @ApiPropertyOptional({ type: [FormHeaderGroupDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FormHeaderGroupDto)
  headerGroups?: FormHeaderGroupDto[];

  @ApiPropertyOptional({ type: [String], description: 'Các trục dùng mẫu này' })
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true, message: 'Trục không hợp lệ.' })
  axisIds?: string[];

  @NumberNotRequired('Thứ tự hiển thị', { example: 0 })
  sortOrder?: number;

  @BooleanNotRequired('Trạng thái hoạt động', { example: true })
  isActive?: boolean;
}
