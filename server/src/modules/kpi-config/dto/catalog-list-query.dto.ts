import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsMongoId, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';
import { CatalogScope } from '../schemas/catalog-scope.enum';

export class CatalogListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: CatalogScope, description: 'Phạm vi danh mục' })
  @IsOptional()
  @IsEnum(CatalogScope, { message: 'Phạm vi danh mục không hợp lệ.' })
  scope?: CatalogScope;

  @ApiPropertyOptional({ description: 'Lọc theo đơn vị (scope=DEPARTMENT)' })
  @IsOptional()
  @IsMongoId({ message: 'Đơn vị không hợp lệ.' })
  ownerDepartmentId?: string;
}
