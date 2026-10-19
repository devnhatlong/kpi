import { MinLength } from 'class-validator';

import { StringRequired } from '@/common/decorators';
import { MIN_PASSWORD_LENGTH } from '@/modules/auth/password-policy';

/** Đăng ký chỉ cần username + password; thông tin còn lại cập nhật sau. */
export class CreateUserDto {
  @StringRequired('Tên đăng nhập', { example: 'longnguyen' })
  username!: string;

  @StringRequired('Mật khẩu', { example: 'MatKhauManh@2026' })
  @MinLength(MIN_PASSWORD_LENGTH, {
    message: `Mật khẩu phải có ít nhất ${MIN_PASSWORD_LENGTH} ký tự.`,
  })
  password!: string;
}
