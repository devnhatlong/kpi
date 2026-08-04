import {
  BooleanNotRequired,
  NumberNotRequired,
  StringNotRequired,
  StringRequired,
} from '@/common/decorators';

export class CreateAxisDto {
  @StringNotRequired('Mã trục (để trống sẽ tự sinh)', {
    example: 'TRUC-0001',
  })
  code?: string;

  @StringRequired('Tên trục', { example: 'Trục nghiệp vụ cốt lõi' })
  name!: string;

  @StringNotRequired('Mô tả')
  description?: string;

  @NumberNotRequired('Thứ tự hiển thị', { example: 0 })
  sortOrder?: number;

  @BooleanNotRequired('Trạng thái hoạt động', { example: true })
  isActive?: boolean;
}
