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

/** Các trường nội dung dùng chung cho tạo / sửa / cấp trên sửa. */
export class PersonalKpiContentDto {
  /**
   * Giá trị cột danh mục theo khoá cột: { "<khoá cột>": "<id trong danh mục>" }.
   * Service tra lại tên trong danh mục nên id không có thật sẽ bị bỏ.
   */
  @ApiPropertyOptional({
    description: 'Cột lấy từ danh mục: { "<khoá cột>": "<id>" }',
  })
  @IsOptional()
  @IsObject()
  catalogValues?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  fieldValues?: Record<string, string | number>;

  /**
   * Tệp đính kèm theo khoá cột: { "<khoá cột>": [{ id, name, size, mimeType }] }.
   * Chỉ kiểm kiểu thô ở đây; service lọc lại theo id tệp có thật trong DB nên
   * client không nhét được tệp giả hay tệp không tồn tại.
   */
  @ApiPropertyOptional({
    description: 'Tệp đính kèm theo khoá cột, id lấy từ POST /uploads',
  })
  @IsOptional()
  @IsObject()
  attachments?: Record<string, unknown>;
}

export class CreatePersonalKpiDto extends PersonalKpiContentDto {
  @ApiProperty()
  @IsMongoId()
  axisId!: string;

  @ApiProperty()
  @IsMongoId()
  workContentId!: string;
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

  @ApiPropertyOptional({ description: 'Nội dung công việc thuộc trục' })
  @IsOptional()
  @IsMongoId()
  workContentId?: string;

  @ApiPropertyOptional({
    description: 'Đơn vị - khớp cả đơn vị của cán bộ lẫn đơn vị gửi lên',
  })
  @IsOptional()
  @IsMongoId()
  departmentId?: string;

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

export const PERSONAL_KPI_STAT_SCOPES = ['mine', 'unit'] as const;
export type PersonalKpiStatScope = (typeof PERSONAL_KPI_STAT_SCOPES)[number];

export class PersonalKpiStatisticsQueryDto {
  @ApiPropertyOptional({ description: 'Bỏ trống = 30 ngày gần nhất' })
  @IsOptional()
  @IsString()
  fromDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  toDate?: string;

  @ApiPropertyOptional({
    enum: PERSONAL_KPI_STAT_SCOPES,
    description:
      'mine = nhiệm vụ của tôi; unit = cả cây đơn vị của tôi, cần quyền duyệt',
  })
  @IsOptional()
  @IsIn([...PERSONAL_KPI_STAT_SCOPES])
  scope?: PersonalKpiStatScope;

  @ApiPropertyOptional({ description: 'Lọc theo một trục' })
  @IsOptional()
  @IsMongoId()
  axisId?: string;
}
