import {
  BooleanNotRequired,
  NumberNotRequired,
  StringNotRequired,
  StringRequired,
} from '@/common/decorators';

export class CreateContentGroupDto {
  @StringNotRequired('Mã nhóm nội dung (để trống sẽ tự sinh)', {
    example: 'NND-0001',
  })
  code?: string;

  @StringRequired('Tên nhóm nội dung', { example: 'Nghiệp vụ thường xuyên' })
  name!: string;

  @StringNotRequired('Mô tả')
  description?: string;

  @NumberNotRequired('Thứ tự hiển thị', { example: 0 })
  sortOrder?: number;

  @BooleanNotRequired('Trạng thái hoạt động', { example: true })
  isActive?: boolean;
}
