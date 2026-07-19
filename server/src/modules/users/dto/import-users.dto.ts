import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class ImportUserRowDto {
  @ApiProperty({ example: 'nv01', description: 'Tên đăng nhập' })
  @IsString({ message: 'Tên đăng nhập phải là chuỗi.' })
  username!: string;

  @ApiPropertyOptional({ example: 'Nguyễn Văn A' })
  @IsOptional()
  @IsString({ message: 'Họ tên phải là chuỗi.' })
  fullName?: string;

  @ApiPropertyOptional({ example: 'a@example.com' })
  @IsOptional()
  @IsString({ message: 'Email phải là chuỗi.' })
  email?: string;

  @ApiPropertyOptional({ example: '0901234567' })
  @IsOptional()
  @IsString({ message: 'Số điện thoại phải là chuỗi.' })
  phone?: string;

  @ApiPropertyOptional({
    example: 'PV01',
    description: 'Mã đơn vị (department code)',
  })
  @IsOptional()
  @IsString({ message: 'Mã đơn vị phải là chuỗi.' })
  departmentCode?: string;

  @ApiPropertyOptional({
    example: 'STAFF,MANAGER',
    description: 'Danh sách mã vai trò, cách nhau bởi dấu phẩy',
  })
  @IsOptional()
  @IsString({ message: 'Mã vai trò phải là chuỗi.' })
  roleCodes?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean({ message: 'Trạng thái phải là boolean.' })
  isActive?: boolean;
}

export class ImportUsersDto {
  @ApiProperty({ type: [ImportUserRowDto] })
  @IsArray({ message: 'rows phải là mảng.' })
  @ArrayMinSize(1, { message: 'Cần ít nhất 1 dòng import.' })
  @ValidateNested({ each: true })
  @Type(() => ImportUserRowDto)
  rows!: ImportUserRowDto[];
}
