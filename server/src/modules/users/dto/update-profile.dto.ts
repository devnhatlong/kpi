import { StringNotRequired } from '@/common/decorators';

/**
 * Người dùng tự sửa hồ sơ của mình: không đụng vai trò, đơn vị, trạng thái.
 *
 * CỐ Ý không có `email`: email do quản trị cấp và gắn với tài khoản, người dùng
 * không tự đổi. Thiếu trường ở đây là đủ chặn - `forbidNonWhitelisted` từ chối
 * cả request nếu còn gửi `email` lên. Đổi email đi qua màn quản trị người dùng.
 */
export class UpdateProfileDto {
  @StringNotRequired('Họ và tên', { example: 'Nguyễn An' })
  fullName?: string;

  @StringNotRequired('Số điện thoại', { example: '0987654321' })
  phone?: string;

  @StringNotRequired('Chức vụ', { example: 'Quản lý' })
  position?: string;
}
