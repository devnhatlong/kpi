import { StringNotRequired } from '@/common/decorators';

/** Người dùng tự sửa hồ sơ của mình: không đụng vai trò, đơn vị, trạng thái. */
export class UpdateProfileDto {
  @StringNotRequired('Họ và tên', { example: 'Nguyễn An' })
  fullName?: string;

  @StringNotRequired('Email', { example: 'an.nguyen@kpi.vn' })
  email?: string;

  @StringNotRequired('Số điện thoại', { example: '0987654321' })
  phone?: string;

  @StringNotRequired('Chức vụ', { example: 'Quản lý' })
  position?: string;
}
