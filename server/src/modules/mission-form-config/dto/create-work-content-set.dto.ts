import {
  BooleanNotRequired,
  NumberNotRequired,
  StringNotRequired,
  StringRequired,
} from '@/common/decorators';

export class CreateWorkContentSetDto {
  @StringNotRequired('Mã bộ nội dung (để trống sẽ tự sinh)', {
    example: 'BND-0001',
  })
  code?: string;

  @StringRequired('Tên bộ nội dung', { example: 'Phụ lục 2 - Khối An ninh' })
  name!: string;

  @StringNotRequired('Mô tả')
  description?: string;

  @NumberNotRequired('Thứ tự hiển thị', { example: 0 })
  sortOrder?: number;

  @BooleanNotRequired('Trạng thái hoạt động', { example: true })
  isActive?: boolean;
}
