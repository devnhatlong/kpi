import { StringRequired } from '@/common/decorators';

/** Đăng ký chỉ cần username + password; thông tin còn lại cập nhật sau. */
export class CreateUserDto {
  @StringRequired('Tên đăng nhập', { example: 'longnguyen' })
  username!: string;

  @StringRequired('Mật khẩu', { example: '123456' })
  password!: string;
}
