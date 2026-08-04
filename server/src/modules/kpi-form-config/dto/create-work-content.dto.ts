import {
  BooleanNotRequired,
  NumberNotRequired,
  StringNotRequired,
  StringRequired,
} from '@/common/decorators';

export class CreateWorkContentDto {
  @StringNotRequired('Mã nội dung (để trống sẽ tự sinh)', { example: 'ND-0001' })
  code?: string;

  @StringRequired('Tên nội dung công việc', {
    example: 'Nhiệm vụ trọng tâm ban hành kèm Chỉ thị công tác',
  })
  name!: string;

  @StringNotRequired('Mô tả')
  description?: string;

  @NumberNotRequired('Thứ tự hiển thị', { example: 0 })
  sortOrder?: number;

  @BooleanNotRequired('Trạng thái hoạt động', { example: true })
  isActive?: boolean;
}
