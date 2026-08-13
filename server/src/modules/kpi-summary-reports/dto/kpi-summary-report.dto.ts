import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

import { KPI_SUMMARY_REPORT_STATUSES } from '../schemas/kpi-summary-report.schema';

/** Kho nhiệm vụ đã hoàn thành để nhặt vào báo cáo tổng. */
export class SummaryCandidatesQueryDto {
  @ApiPropertyOptional({ description: 'YYYY-MM-DD' })
  @IsOptional()
  @IsString()
  fromDate?: string;

  @ApiPropertyOptional({ description: 'YYYY-MM-DD' })
  @IsOptional()
  @IsString()
  toDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  axisId?: string;

  @ApiPropertyOptional({ description: 'Nội dung công việc thuộc trục' })
  @IsOptional()
  @IsMongoId()
  workContentId?: string;

  @ApiPropertyOptional({
    description: 'Đơn vị trong nhánh của tôi - lọc theo đơn vị của cán bộ',
  })
  @IsOptional()
  @IsMongoId()
  departmentId?: string;

  @ApiPropertyOptional({ description: 'Lọc theo cán bộ tạo nhiệm vụ' })
  @IsOptional()
  @IsMongoId()
  ownerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  q?: string;

  /** Bỏ qua nhiệm vụ đã nằm trong báo cáo khác của tôi, tránh đếm hai lần. */
  @ApiPropertyOptional({ description: 'Ẩn nhiệm vụ đã đưa vào báo cáo khác' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  excludeUsed?: boolean;

  /**
   * Báo cáo đang mở - nhiệm vụ của chính nó vẫn phải hiện dù `excludeUsed`,
   * nếu không thì mở báo cáo ra sửa là mất sạch dòng đã chọn.
   */
  @ApiPropertyOptional({ description: 'Báo cáo đang biên tập' })
  @IsOptional()
  @IsMongoId()
  reportId?: string;
}

export class CreateSummaryReportDto {
  @ApiProperty()
  @IsString()
  @MaxLength(300)
  title!: string;

  @ApiPropertyOptional({ description: 'YYYY-MM-DD' })
  @IsOptional()
  @IsString()
  fromDate?: string;

  @ApiPropertyOptional({ description: 'YYYY-MM-DD' })
  @IsOptional()
  @IsString()
  toDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @ApiProperty({ description: 'Nhiệm vụ đã hoàn thành được tích' })
  @IsArray()
  @ArrayNotEmpty()
  @IsMongoId({ each: true })
  itemIds!: string[];
}

export class UpdateSummaryReportDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  title?: string;

  @ApiPropertyOptional({ description: 'YYYY-MM-DD' })
  @IsOptional()
  @IsString()
  fromDate?: string;

  @ApiPropertyOptional({ description: 'YYYY-MM-DD' })
  @IsOptional()
  @IsString()
  toDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  /** Bỏ trống = giữ nguyên danh sách; gửi mảng = thay nguyên danh sách. */
  @ApiPropertyOptional({ description: 'Thay nguyên danh sách nhiệm vụ' })
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  itemIds?: string[];
}

/** Thêm / bớt nhiệm vụ mà không phải gửi lại cả danh sách. */
export class ChangeSummaryItemsDto {
  @ApiProperty()
  @IsArray()
  @ArrayNotEmpty()
  @IsMongoId({ each: true })
  itemIds!: string[];
}

export class SummaryReportListQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @ApiPropertyOptional({ enum: KPI_SUMMARY_REPORT_STATUSES })
  @IsOptional()
  @IsIn([...KPI_SUMMARY_REPORT_STATUSES])
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  q?: string;
}
