import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class ImportDepartmentRowDto {
  @ApiProperty({ example: 'PV01', description: 'Mã đơn vị' })
  @IsString({ message: 'Mã đơn vị phải là chuỗi.' })
  code!: string;

  @ApiProperty({ example: 'Phòng Tham mưu', description: 'Tên đơn vị' })
  @IsString({ message: 'Tên đơn vị phải là chuỗi.' })
  name!: string;

  @ApiPropertyOptional({
    example: 'CAT',
    description: 'Mã đơn vị cha (để trống nếu là gốc)',
  })
  @IsOptional()
  @IsString({ message: 'Mã đơn vị cha phải là chuỗi.' })
  parentCode?: string;

  @ApiPropertyOptional({
    example: 'PHONG',
    description: 'Mã cấp đơn vị (department level code)',
  })
  @IsOptional()
  @IsString({ message: 'Mã cấp đơn vị phải là chuỗi.' })
  levelCode?: string;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Thứ tự sắp xếp phải là số.' })
  sortOrder?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean({ message: 'Trạng thái phải là boolean.' })
  isActive?: boolean;
}

export class ImportDepartmentsDto {
  @ApiProperty({ type: [ImportDepartmentRowDto] })
  @IsArray({ message: 'rows phải là mảng.' })
  @ArrayMinSize(1, { message: 'Cần ít nhất 1 dòng import.' })
  @ValidateNested({ each: true })
  @Type(() => ImportDepartmentRowDto)
  rows!: ImportDepartmentRowDto[];
}
