import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsMongoId, IsOptional } from 'class-validator';
import {
  BooleanNotRequired,
  NumberNotRequired,
  StringNotRequired,
  StringRequired,
} from '@/common/decorators';
import { CatalogScope } from '../schemas/catalog-scope.enum';

export class CreateWorkGroupDto {
  @StringRequired('Mã nhóm công việc', { example: 'CHINH_TRI' })
  code!: string;

  @StringRequired('Tên nhóm công việc', { example: 'Nhiệm vụ chính trị' })
  name!: string;

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
