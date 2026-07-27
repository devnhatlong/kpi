import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId } from 'class-validator';
import {
  BooleanNotRequired,
  NumberNotRequired,
  StringNotRequired,
  StringRequired,
} from '@/common/decorators';

export class CreateWorkContentDto {
  @StringNotRequired('Mã nội dung công việc (để trống sẽ tự sinh)', {
    example: 'ND-0001',
  })
  code?: string;

  @StringRequired('Tên nội dung công việc', {
    example: 'Nhiệm vụ trọng tâm được Đảng uỷ, CATW, Bộ Công an giao',
  })
  name!: string;

  @ApiProperty({ description: 'ID nhóm công việc', type: String })
  @IsMongoId({ message: 'Nhóm công việc không hợp lệ.' })
  groupId!: string;

  @StringNotRequired('Mô tả')
  description?: string;

  @NumberNotRequired('Thứ tự hiển thị', { example: 1 })
  sortOrder?: number;

  @BooleanNotRequired('Cho phép nhiều nhiệm vụ con', { example: true })
  allowMultipleTasks?: boolean;

  @BooleanNotRequired('Trạng thái hoạt động', { example: true })
  isActive?: boolean;
}
