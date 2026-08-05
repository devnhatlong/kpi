import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

import { StringRequired } from '@/common/decorators';

export class ChangePasswordDto {
  @StringRequired('Mật khẩu hiện tại', { example: '123456' })
  currentPassword!: string;

  @ApiProperty({
    description: 'Mật khẩu mới',
    example: '123456',
    type: String,
    minLength: 6,
  })
  @IsString({ message: 'Mật khẩu mới phải là một chuỗi.' })
  @IsNotEmpty({ message: 'Mật khẩu mới không được để trống.' })
  @MinLength(6, { message: 'Mật khẩu mới phải có ít nhất 6 ký tự.' })
  newPassword!: string;
}
