import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsOptional, ValidateNested } from 'class-validator';
import {
  BooleanNotRequired,
  StringNotRequired,
  StringRequired,
} from '@/common/decorators';

import { RoleAssignmentDto } from './update-user.dto';

/** Tạo người dùng bởi admin (đủ hồ sơ + vai trò). */
export class AdminCreateUserDto {
  @StringRequired('Tên đăng nhập', { example: 'longnguyen' })
  username!: string;

  @StringRequired('Mật khẩu', { example: '123456' })
  password!: string;

  @StringNotRequired('Họ và tên', { example: 'Nguyễn Nhật Long' })
  fullName?: string;

  @StringNotRequired('Email', { example: 'long@example.com' })
  email?: string;

  @StringNotRequired('Số điện thoại', { example: '0901234567' })
  phone?: string;

  @StringNotRequired('Chức vụ', { example: 'Đội trưởng' })
  position?: string;

  @StringNotRequired('Mã đơn vị', { example: '507f1f77bcf86cd799439011' })
  departmentId?: string;

  @BooleanNotRequired('Trạng thái hoạt động', { example: true })
  isActive?: boolean;

  @ApiPropertyOptional({ type: [RoleAssignmentDto] })
  @IsOptional()
  @IsArray({ message: 'roleAssignments phải là một mảng.' })
  @ValidateNested({ each: true })
  @Type(() => RoleAssignmentDto)
  roleAssignments?: RoleAssignmentDto[];
}
