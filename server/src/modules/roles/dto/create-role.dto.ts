import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { Permission } from '@/common/enums/permission.enum';
import { RoleCode } from '@/common/enums/role-code.enum';

export class CreateRoleDto {
  @ApiProperty({ enum: RoleCode, example: RoleCode.STAFF })
  @IsEnum(RoleCode, { message: 'Mã vai trò không hợp lệ.' })
  code!: RoleCode;

  @ApiProperty({ example: 'Nhân viên' })
  @IsString({ message: 'Tên vai trò phải là một chuỗi.' })
  @IsNotEmpty({ message: 'Tên vai trò không được để trống.' })
  name!: string;

  @ApiPropertyOptional({
    enum: Permission,
    isArray: true,
    example: [Permission.TASK_VIEW],
  })
  @IsOptional()
  @IsArray({ message: 'Permissions phải là một mảng.' })
  @IsEnum(Permission, {
    each: true,
    message: 'Permission không hợp lệ.',
  })
  permissions?: Permission[];

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean({ message: 'isActive phải là true hoặc false.' })
  isActive?: boolean;
}
