import { IsMongoId, IsOptional } from 'class-validator';
import {
  BooleanNotRequired,
  NumberNotRequired,
  StringNotRequired,
  StringRequired,
} from '@/common/decorators';

export class CreateWorkTaskDto {
  @StringNotRequired('Mã nhiệm vụ (để trống sẽ tự sinh)', { example: 'NV-0001' })
  code?: string;

  @StringRequired('Nội dung nhiệm vụ', {
    example: 'Chủ trì tham mưu, triển khai đề án, dự án, chương trình…',
  })
  name!: string;

  @StringRequired('Nội dung công việc', {
    example: '66af9f31f0e4d3e4f4305e91',
  })
  @IsMongoId({ message: 'Nội dung công việc không hợp lệ.' })
  workContentId!: string;

  @StringNotRequired('Nhóm điểm riêng của nhiệm vụ (để trống = theo nội dung)')
  @IsOptional()
  @IsMongoId({ message: 'Nhóm điểm không hợp lệ.' })
  scoreGroupId?: string | null;

  @StringNotRequired('Ghi chú riêng của nhiệm vụ')
  note?: string;

  @NumberNotRequired('Thứ tự hiển thị', { example: 0 })
  sortOrder?: number;

  @BooleanNotRequired('Trạng thái hoạt động', { example: true })
  isActive?: boolean;
}
