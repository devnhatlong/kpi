import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsMongoId, IsOptional } from 'class-validator';
import {
  BooleanNotRequired,
  NumberNotRequired,
  StringNotRequired,
  StringRequired,
} from '@/common/decorators';
import { CatalogScope } from '../schemas/catalog-scope.enum';

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

  @BooleanNotRequired('Trạng thái hoạt động', { example: true })
  isActive?: boolean;

  @ApiPropertyOptional({ enum: CatalogScope, description: 'Phạm vi danh mục' })
  @IsOptional()
  @IsEnum(CatalogScope, { message: 'Phạm vi danh mục không hợp lệ.' })
  scope?: CatalogScope;

  @ApiPropertyOptional({ description: 'Đơn vị khi scope=DEPARTMENT' })
  @IsOptional()
  @IsMongoId({ message: 'Đơn vị không hợp lệ.' })
  ownerDepartmentId?: string;
}
