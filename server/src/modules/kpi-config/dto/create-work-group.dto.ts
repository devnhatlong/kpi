import {
  BooleanNotRequired,
  NumberNotRequired,
  StringNotRequired,
  StringRequired,
} from '@/common/decorators';

export class CreateWorkGroupDto {
  @StringRequired('Mã nhóm công việc', { example: 'CHINH_TRI' })
  code!: string;

  @StringRequired('Tên nhóm công việc', { example: 'Nhiệm vụ chính trị' })
  name!: string;

  @StringNotRequired('Mô tả')
  description?: string;

  @NumberNotRequired('Thứ tự hiển thị', { example: 1 })
  sortOrder?: number;

  @BooleanNotRequired('Trạng thái hoạt động', { example: true })
  isActive?: boolean;
}
