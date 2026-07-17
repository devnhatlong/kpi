import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsMongoId,
  IsOptional,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  BooleanNotRequired,
  StringNotRequired,
} from '@/common/decorators';
import { RoleCode } from '@/common/enums/role-code.enum';

export class RoleAssignmentDto {
  @ApiProperty({ enum: RoleCode, example: RoleCode.STAFF })
  @IsEnum(RoleCode, { message: 'Mã vai trò không hợp lệ.' })
  roleCode!: RoleCode;

  @ApiPropertyOptional({
    nullable: true,
    example: null,
    description: 'null = toàn hệ thống; ObjectId = phạm vi đơn vị',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined && value !== '')
  @IsMongoId({ message: 'Mã đơn vị phạm vi không hợp lệ.' })
  scopeDepartmentId?: string | null;
}

/** Cập nhật hồ sơ / trạng thái / vai trò sau khi đăng ký. */
export class UpdateUserDto {
  @StringNotRequired('Mật khẩu', { example: '123456' })
  password?: string;

  @StringNotRequired('Họ và tên', { example: 'Nguyễn Nhật Long' })
  fullName?: string;

  @StringNotRequired('Email', { example: 'long@example.com' })
  email?: string;

  @StringNotRequired('Số điện thoại', { example: '0901234567' })
  phone?: string;

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
