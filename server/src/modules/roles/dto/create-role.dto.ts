import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateRoleDto {
  @ApiProperty({ example: 'STAFF' })
  @IsString({ message: 'Mã vai trò phải là một chuỗi.' })
  @IsNotEmpty({ message: 'Mã vai trò không được để trống.' })
  code!: string;

  @ApiProperty({ example: 'Nhân viên' })
  @IsString({ message: 'Tên vai trò phải là một chuỗi.' })
  @IsNotEmpty({ message: 'Tên vai trò không được để trống.' })
  name!: string;

  @ApiPropertyOptional({
    type: [String],
    example: ['task.view', 'evaluation.self'],
  })
  @IsOptional()
  @IsArray({ message: 'Permissions phải là một mảng.' })
  @IsString({ each: true, message: 'Mỗi permission phải là chuỗi.' })
  permissions?: string[];

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Thứ tự phải là một số.' })
  @Min(0, { message: 'Thứ tự phải >= 0.' })
  sortOrder?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean({ message: 'isActive phải là true hoặc false.' })
  isActive?: boolean;
}
