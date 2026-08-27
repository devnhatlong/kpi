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
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import {
  MISSION_CRITERION_SUBJECT_TYPES,
  MISSION_SUMMARY_REPORT_STATUSES,
  type MissionCriterionSubjectType,
} from '../schemas/mission-summary-report.schema';

/** Kho nhiệm vụ đã hoàn thành để chọn vào báo cáo tổng hợp. */
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

/** Nhiệm vụ tự nhập - việc không đi qua nhiệm vụ cá nhân. */
export class CreateSummaryManualItemDto {
  @ApiProperty()
  @IsString()
  @MaxLength(300)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  axisId?: string;

  @ApiPropertyOptional({ description: 'Cán bộ / bộ phận thực hiện' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  ownerName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  departmentName?: string;

  @ApiPropertyOptional({ description: 'Điểm chỉ huy ghi cho việc này' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1000)
  score?: number;
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

  @ApiPropertyOptional({ description: 'Đơn vị được tổng hợp trong báo cáo' })
  @IsOptional()
  @IsMongoId()
  scopeDepartmentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  /**
   * Tích sẵn từ bước "Chọn nhiệm vụ hoàn thành". Cho phép rỗng: lập khung báo
   * cáo trước rồi chọn việc sau là cách làm bình thường.
   */
  @ApiPropertyOptional({ description: 'Nhiệm vụ đã hoàn thành được tích' })
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  itemIds?: string[];

  /**
   * Việc chỉ huy tự khai theo trục, gửi luôn trong lần tạo.
   *
   * Đi kèm ở đây chứ không bắt gọi thêm `POST :id/manual-items`: trình tạo báo
   * cáo chỉ ghi xuống ở bước cuối, tách làm hai lượt thì lỡ lượt sau hỏng là
   * người dùng còn lại một báo cáo thiếu việc mà không biết thiếu ở đâu.
   */
  @ApiPropertyOptional({ type: [CreateSummaryManualItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSummaryManualItemDto)
  manualItems?: CreateSummaryManualItemDto[];
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

  @ApiPropertyOptional({ description: 'Đơn vị được tổng hợp trong báo cáo' })
  @IsOptional()
  @IsMongoId()
  scopeDepartmentId?: string;

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

/** Trình báo cáo lên cấp trên - cùng luật người nhận với báo cáo ngày. */
export class SendSummaryReportDto {
  @ApiProperty({ description: 'Cấp trên nhận báo cáo' })
  @IsMongoId()
  recipientId!: string;

  @ApiPropertyOptional({ description: 'Lời trình gửi kèm' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

/** Cấp trên duyệt / trả lại bản trình. */
export class DecideSummaryReportDto {
  @ApiPropertyOptional({ description: 'Nhận xét khi duyệt' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @ApiPropertyOptional({ description: 'Lý do trả lại - bắt buộc khi trả lại' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class SummaryReportListQueryDto {
  /**
   * mine     = báo cáo tôi lập (mặc định)
   * incoming = báo cáo cấp dưới trình lên tôi
   */
  @ApiPropertyOptional({ enum: ['mine', 'incoming'] })
  @IsOptional()
  @IsIn(['mine', 'incoming'])
  scope?: 'mine' | 'incoming';

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

  @ApiPropertyOptional({ enum: MISSION_SUMMARY_REPORT_STATUSES })
  @IsOptional()
  @IsIn([...MISSION_SUMMARY_REPORT_STATUSES])
  status?: string;

  @ApiPropertyOptional({ description: 'Tìm theo tên báo cáo hoặc phạm vi' })
  @IsOptional()
  @IsString()
  q?: string;
}

/** Một ô chấm của khối A. */
export class SummaryCriterionScoreDto {
  @ApiProperty({ enum: MISSION_CRITERION_SUBJECT_TYPES })
  @IsIn([...MISSION_CRITERION_SUBJECT_TYPES])
  subjectType!: MissionCriterionSubjectType;

  @ApiPropertyOptional({
    description: 'Bỏ trống khi chấm cho chính đơn vị của báo cáo',
  })
  @IsOptional()
  @IsMongoId()
  subjectId?: string | null;

  @ApiProperty()
  @IsMongoId()
  criterionId!: string;

  @ApiPropertyOptional({ description: 'Giá trị các cột, key = khoá cột' })
  @IsOptional()
  @IsObject()
  fieldValues?: Record<string, string | number | boolean>;

  @ApiPropertyOptional({ description: 'Cột lấy từ danh mục, key = khoá cột' })
  @IsOptional()
  @IsObject()
  catalogValues?: Record<string, { id: string; name: string }>;
}

/**
 * Lưu cả bảng khối A một lượt.
 *
 * Thay nguyên bộ chứ không vá từng ô: bảng chấm luôn gửi lên trọn vẹn, mà so
 * từng ô để biết ô nào vừa đổi thì tốn công hơn là ghi đè - muốn tra lại đã có
 * nhật ký riêng của báo cáo.
 */
export class SaveSummaryCriteriaDto {
  @ApiProperty({ type: [SummaryCriterionScoreDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SummaryCriterionScoreDto)
  scores!: SummaryCriterionScoreDto[];
}
