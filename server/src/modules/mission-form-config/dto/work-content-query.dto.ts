import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsMongoId, IsOptional, ValidateIf } from 'class-validator';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';

/**
 * Query của danh sách nội dung công việc.
 *
 * Tham số lọc phải khai trong dto - ValidationPipe chạy `forbidNonWhitelisted`,
 * thiếu ở đây là cả request bị 400 (xem work-task-query.dto.ts).
 */
export class WorkContentQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Lọc theo trục' })
  @IsOptional()
  @IsMongoId({ message: 'Trục không hợp lệ.' })
  axisId?: string;

  @ApiPropertyOptional({
    description: 'Lọc theo bộ nội dung; "none" = các dòng chưa gắn bộ nào',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== 'none')
  @IsMongoId({ message: 'Bộ nội dung không hợp lệ.' })
  setId?: string;
}

export const WORK_CONTENT_SET_NONE = 'none';
