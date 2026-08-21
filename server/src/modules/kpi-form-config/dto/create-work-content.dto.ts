import {
  BooleanNotRequired,
  NumberNotRequired,
  StringNotRequired,
  StringRequired,
} from '@/common/decorators';
import { IsMongoId } from 'class-validator';

export class CreateWorkContentDto {
  @StringNotRequired('Mã nội dung (để trống sẽ tự sinh)', { example: 'ND-0001' })
  code?: string;

  @StringRequired('Tên nội dung công việc', {
    example: 'Nhiệm vụ trọng tâm ban hành kèm Chỉ thị công tác',
  })
  name!: string;

  @StringNotRequired('Mô tả - dùng làm cột "Nhiệm vụ" của bảng KPI')
  description?: string;

  @StringNotRequired('Ghi chú - cột "Ghi chú" của bảng KPI (trần điểm của mục…)')
  note?: string;

  @StringRequired('Trục', { example: '66af9f31f0e4d3e4f4305e92' })
  @IsMongoId({ message: 'Trục không hợp lệ.' })
  axisId!: string;

  @StringRequired('Nhóm điểm', { example: '66af9f31f0e4d3e4f4305e93' })
  @IsMongoId({ message: 'Nhóm điểm không hợp lệ.' })
  scoreGroupId!: string;

  @NumberNotRequired('Thứ tự hiển thị', { example: 0 })
  sortOrder?: number;

  @BooleanNotRequired('Trạng thái hoạt động', { example: true })
  isActive?: boolean;
}
