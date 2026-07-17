import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';
import { Permission } from '@/common/enums/permission.enum';

export class UpdateRoleDto {
  @ApiPropertyOptional({ example: 'Nhân viên' })
  @IsOptional()
  @IsString({ message: 'Tên vai trò phải là một chuỗi.' })
  name?: string;

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
