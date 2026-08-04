import {
  BooleanNotRequired,
  NumberNotRequired,
  NumberRequired,
  StringNotRequired,
  StringRequired,
} from '@/common/decorators';

export class CreateScoreGroupDto {
  @StringNotRequired('Mã nhóm (để trống sẽ tự sinh)', { example: 'DG-0001' })
  code?: string;

  @StringRequired('Tên nhóm điểm', { example: 'KPI tiến độ' })
  name!: string;

  @StringNotRequired('Mô tả')
  description?: string;

  @NumberRequired('Mức điểm từ', { example: 50 })
  minScore!: number;

  @NumberRequired('Mức điểm đến', { example: 70 })
  maxScore!: number;

  @BooleanNotRequired('Bao gồm mức điểm đến (<= max)', { example: false })
  maxInclusive?: boolean;

  @NumberNotRequired('Thứ tự hiển thị', { example: 0 })
  sortOrder?: number;

  @BooleanNotRequired('Trạng thái hoạt động', { example: true })
  isActive?: boolean;
}
