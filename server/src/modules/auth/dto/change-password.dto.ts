import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

import { StringRequired } from '@/common/decorators';
import { MIN_PASSWORD_LENGTH } from '../password-policy';

export class ChangePasswordDto {
  @StringRequired('Mật khẩu hiện tại', { example: '123456' })
  currentPassword!: string;

  @ApiProperty({
    description: 'Mật khẩu mới',
    example: 'MatKhauManh@2026',
    type: String,
    minLength: MIN_PASSWORD_LENGTH,
  })
  @IsString({ message: 'Mật khẩu mới phải là một chuỗi.' })
  @IsNotEmpty({ message: 'Mật khẩu mới không được để trống.' })
  @MinLength(MIN_PASSWORD_LENGTH, {
    message: `Mật khẩu mới phải có ít nhất ${MIN_PASSWORD_LENGTH} ký tự.`,
  })
  newPassword!: string;
}
