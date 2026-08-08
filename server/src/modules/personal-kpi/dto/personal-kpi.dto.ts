import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsMongoId,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { PERSONAL_KPI_REVIEW_STATUSES } from '../schemas/personal-kpi-item.schema';

export class PersonalKpiEvidenceFileDto {
  @ApiProperty()
  @IsString()
  key!: string;

  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  size!: number;

  @ApiProperty()
  @IsString()
  mimeType!: string;
}

/** Các trường nội dung dùng chung cho tạo / sửa / cấp trên sửa. */
export class PersonalKpiContentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  deadline?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  product?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  standardScore?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  executingUnit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  progressPercent?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  progressSelfScore?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  qualityPercent?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  qualitySelfScore?: number | null;

  @ApiPropertyOptional({ description: 'Đạt - loại trừ với resultFailed' })
  @IsOptional()
  @IsBoolean()
  resultPassed?: boolean | null;

  @ApiPropertyOptional({ description: 'Không đạt - loại trừ với resultPassed' })
  @IsOptional()
  @IsBoolean()
  resultFailed?: boolean | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @ApiPropertyOptional({ type: [PersonalKpiEvidenceFileDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PersonalKpiEvidenceFileDto)
  evidenceFiles?: PersonalKpiEvidenceFileDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  fieldValues?: Record<string, string | number>;
}

export class CreatePersonalKpiDto extends PersonalKpiContentDto {
  @ApiProperty()
  @IsMongoId()
  axisId!: string;

  @ApiProperty()
  @IsMongoId()
  workContentId!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(500)
  declare title: string;
}

export class CreatePersonalKpiBatchDto {
  @ApiPropertyOptional({ description: 'YYYY-MM-DD, mặc định hôm nay' })
  @IsOptional()
  @IsString()
  reportDate?: string;

  @ApiProperty({ type: [CreatePersonalKpiDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => CreatePersonalKpiDto)
  items!: CreatePersonalKpiDto[];
}

export class UpdatePersonalKpiDto extends PersonalKpiContentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  axisId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  workContentId?: string;
}

/** Cấp trên sửa nội dung nhiệm vụ đang nằm ở tay mình - bắt buộc nêu lý do. */
export class ReviewerEditPersonalKpiDto extends PersonalKpiContentDto {
  @ApiProperty({ description: 'Lý do sửa - hiện trong lịch sử nhiệm vụ' })
  @IsString()
  @MaxLength(500)
  reason!: string;
}

export class SubmitPersonalKpiDto {
  @ApiProperty({ description: 'Người nhận - phải là cấp trên trong nhánh' })
  @IsMongoId()
  recipientId!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(1000)
  note!: string;

  @ApiPropertyOptional({
    description: 'Bỏ trống = gửi hết nhiệm vụ gửi được trong ngày',
  })
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  itemIds?: string[];
}

/** Cấp trên gửi tiếp các nhiệm vụ đã duyệt lên cấp cao hơn. */
export class ForwardPersonalKpiDto {
  @ApiProperty()
  @IsMongoId()
  recipientId!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(1000)
  note!: string;

  @ApiProperty({ description: 'Các nhiệm vụ được tích trong bảng tổng' })
  @IsArray()
  @ArrayNotEmpty()
  @IsMongoId({ each: true })
  itemIds!: string[];
}

export class ReviewPersonalKpiDto {
  @ApiProperty({ description: 'Các nhiệm vụ được tích trong bảng tổng' })
  @IsArray()
  @ArrayNotEmpty()
  @IsMongoId({ each: true })
  itemIds!: string[];

  /**
   * Mỗi quyết định là dứt điểm, không có bước "duyệt tạm":
   * - COMPLETE: chốt tại cấp mình, kết thúc chuỗi
   * - RETURN  : trả về người gửi để sửa
   * Duyệt rồi chuyển lên cấp trên nằm ở endpoint /forward.
   */
  @ApiProperty({ enum: ['RETURN', 'COMPLETE'] })
  @IsIn(['RETURN', 'COMPLETE'])
  decision!: 'RETURN' | 'COMPLETE';

  @ApiPropertyOptional({ description: 'Bắt buộc khi trả lại' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class PersonalKpiListQueryDto {
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reportDate?: string;

  @ApiPropertyOptional({ enum: PERSONAL_KPI_REVIEW_STATUSES })
  @IsOptional()
  @IsIn([...PERSONAL_KPI_REVIEW_STATUSES])
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  axisId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  q?: string;
}

export class PersonalKpiReportsQueryDto {
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fromDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  toDate?: string;

  @ApiPropertyOptional({ enum: PERSONAL_KPI_REVIEW_STATUSES })
  @IsOptional()
  @IsIn([...PERSONAL_KPI_REVIEW_STATUSES])
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  q?: string;
}

/** Bảng tổng theo trục cho cấp trên. */
export class PersonalKpiBoardQueryDto {
  @ApiPropertyOptional({ description: 'Bỏ trống = mọi ngày còn việc' })
  @IsOptional()
  @IsString()
  reportDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fromDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  toDate?: string;

  @ApiPropertyOptional({ enum: PERSONAL_KPI_REVIEW_STATUSES })
  @IsOptional()
  @IsIn([...PERSONAL_KPI_REVIEW_STATUSES])
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  axisId?: string;

  @ApiPropertyOptional({ description: 'Lọc theo người gửi lượt gần nhất' })
  @IsOptional()
  @IsMongoId()
  senderId?: string;

  @ApiPropertyOptional({ description: 'Lọc theo cán bộ tạo nhiệm vụ' })
  @IsOptional()
  @IsMongoId()
  ownerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ description: 'Gộp cả việc đã duyệt để gửi tiếp' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includeDecided?: boolean;
}
