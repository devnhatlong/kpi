import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsMongoId, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';

/**
 * Query của danh sách nhiệm vụ.
 *
 * Phải khai `workContentId` TRONG dto: ValidationPipe chạy với
 * `forbidNonWhitelisted` nên tham số nào không có mặt ở đây là cả request bị
 * trả 400, dropdown ngoài form nhập lại hiện thành "chưa khai nhiệm vụ nào".
 */
export class WorkTaskQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Lọc theo nội dung công việc' })
  @IsOptional()
  @IsMongoId({ message: 'Nội dung công việc không hợp lệ.' })
  workContentId?: string;
}
