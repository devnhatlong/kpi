import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

import {
  BooleanNotRequired,
  NumberNotRequired,
  StringNotRequired,
  StringRequired,
} from '@/common/decorators';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';
import {
  ADJUSTMENT_SECTIONS,
  type AdjustmentSection,
} from '../schemas/adjustment-item.schema';

export class CreateAdjustmentItemDto {
  @StringNotRequired('Mã (để trống sẽ tự sinh theo phần: DC-, DT-, XL-)', {
    example: 'DC-0001',
  })
  code?: string;

  @ApiProperty({
    enum: ADJUSTMENT_SECTIONS,
    description:
      'BONUS = I. Điểm cộng, PENALTY = II. Điểm trừ, RANKING = III. Xếp loại',
  })
  @IsIn([...ADJUSTMENT_SECTIONS])
  section!: AdjustmentSection;

  @StringRequired(
    'Nội dung cộng điểm / Nội dung, điều kiện trừ điểm / Mức xử lý',
    { example: 'Hoàn thành chỉ tiêu công tác trọng tâm' },
  )
  name!: string;

  @StringNotRequired('Điều kiện, mức điểm / Mức điểm trừ / Trường hợp áp dụng')
  rule?: string;

  @NumberNotRequired('Tối đa - chỉ phần Điểm cộng dùng', { example: 2 })
  maxScore?: number | null;

  @NumberNotRequired('Thứ tự hiển thị', { example: 0 })
  sortOrder?: number;

  @BooleanNotRequired('Trạng thái hoạt động', { example: true })
  isActive?: boolean;
}

/** Lọc theo phần khi liệt kê. */
export class AdjustmentItemQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ADJUSTMENT_SECTIONS })
  @IsOptional()
  @IsIn([...ADJUSTMENT_SECTIONS])
  section?: AdjustmentSection;
}
