import {
  BooleanNotRequired,
  NumberNotRequired,
  StringNotRequired,
  StringRequired,
} from '@/common/decorators';

export class CreateCriterionDto {
  @StringNotRequired('Mã tiêu chí (để trống sẽ tự sinh)', { example: 'TC-0001' })
  code?: string;

  @StringRequired('Nội dung tiêu chí', {
    example:
      'Kết quả công tác xây dựng, chỉnh đốn Đảng; củng cố, xây dựng tổ chức đảng',
  })
  name!: string;

  @StringNotRequired('Ghi chú - cột "Ghi chú" của bảng tiêu chí')
  note?: string;

  @NumberNotRequired('Điểm tối đa của tiêu chí', { example: 5 })
  maxScore?: number;

  @NumberNotRequired('Thứ tự hiển thị', { example: 0 })
  sortOrder?: number;

  @BooleanNotRequired('Trạng thái hoạt động', { example: true })
  isActive?: boolean;
}
