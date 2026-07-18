import {
  BooleanNotRequired,
  NumberNotRequired,
  StringNotRequired,
  StringRequired,
} from '@/common/decorators';

export class CreatePermissionDto {
  @StringRequired('Mã quyền', { example: 'user.view' })
  code!: string;

  @StringRequired('Tên quyền', { example: 'Xem người dùng' })
  name!: string;

  @StringNotRequired('Mô tả', { example: 'Xem danh sách và chi tiết người dùng' })
  description?: string;

  @StringNotRequired('Nhóm / module', { example: 'user' })
  module?: string;

  @NumberNotRequired('Thứ tự', { example: 10 })
  sortOrder?: number;

  @BooleanNotRequired('Trạng thái hoạt động', { example: true })
  isActive?: boolean;
}
