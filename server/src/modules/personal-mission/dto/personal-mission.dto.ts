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

import { PERSONAL_MISSION_REVIEW_STATUSES } from '../schemas/personal-mission-item.schema';

/** Các trường nội dung dùng chung cho tạo / sửa / cấp trên sửa. */
export class PersonalMissionContentDto {
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

export class CreatePersonalMissionDto extends PersonalMissionContentDto {
  @ApiProperty()
  @IsMongoId()
  axisId!: string;

  @ApiProperty()
  @IsMongoId()
  workContentId!: string;
}

export class CreatePersonalMissionBatchDto {
  @ApiPropertyOptional({ description: 'YYYY-MM-DD, mặc định hôm nay' })
  @IsOptional()
  @IsString()
  reportDate?: string;

  @ApiProperty({ type: [CreatePersonalMissionDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => CreatePersonalMissionDto)
  items!: CreatePersonalMissionDto[];
}

export class UpdatePersonalMissionDto extends PersonalMissionContentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  axisId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  workContentId?: string;
}

/**
 * Cán bộ cập nhật tiến độ hằng ngày.
 *
 * Cố tình KHÔNG kế thừa PersonalMissionContentDto: đây là đường sửa được phép chạy
 * cả khi nhiệm vụ đã gửi lên trên, nên chỉ nhận đúng ba thứ theo dõi. Cho gửi
 * cả fieldValues là mở đường sửa điểm tự chấm sau lưng người duyệt.
 */
export class UpdatePersonalMissionProgressDto {
  @ApiPropertyOptional({
    description: 'tiến độ: số 0-100, hoặc id mức khi cột là ô chọn',
  })
  @IsOptional()
  @IsString()
  progress?: string;

  @ApiPropertyOptional({
    description: 'chất lượng, cùng dạng với progress',
  })
  @IsOptional()
  @IsString()
  quality?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @ApiPropertyOptional({ description: 'Sản phẩm đã làm ra' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  product?: string;

  /**
   * Tệp minh chứng của cột "Tài liệu kiểm chứng". Gửi cả danh sách sau mỗi lần
   * thêm / bớt; service lọc lại theo id tệp có thật nên không nhét tệp giả được.
   */
  @ApiPropertyOptional({
    description: 'Tệp minh chứng, id lấy từ POST /uploads',
  })
  @IsOptional()
  @IsArray()
  evidence?: unknown[];

  /**
   * Kết quả của trục chấm theo mục (công thức cộng dồn): khoá cột -> giá trị
   * thô ("2" cho ô điểm, "1"/"" cho ô tích). Trục kiểu này không có cột phần
   * trăm nào, khai điểm ở đây chính là cập nhật tiến độ.
   * Service chỉ nhận đúng cột nằm trong công thức và ô tích của mẫu.
   */
  @ApiPropertyOptional({
    description: 'Kết quả theo khoá cột, dùng cho trục chấm Đạt / Không đạt',
  })
  @IsOptional()
  @IsObject()
  results?: Record<string, string>;
}

/**
 * Chỉ huy chấm điểm rồi chốt hoàn thành.
 *
 * `values` theo khoá cột, chỉ nhận đúng các cột trong công thức của mẫu (tử số
 * và ô phần trăm đi kèm); service tự lọc nên gửi thừa cũng không ghi được.
 */
export class ScorePersonalMissionDto {
  @ApiPropertyOptional({
    description: 'Điểm chỉ huy chấm: { "<khoá cột>": "<giá trị>" }',
  })
  @IsOptional()
  @IsObject()
  values?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Nhận xét của chỉ huy' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

/** Cấp trên sửa nội dung nhiệm vụ đang nằm ở tay mình - bắt buộc nêu lý do. */
/**
 * Cấp trên sửa nhiệm vụ cán bộ đã gửi lên - sửa được MỌI trường: trục, nội dung
 * công việc, và toàn bộ ô của mẫu (tên nhiệm vụ, điểm, hạn...). Kế thừa
 * UpdatePersonalMissionDto để nhận cả axisId / workContentId.
 */
export class ReviewerEditPersonalMissionDto extends UpdatePersonalMissionDto {
  @ApiProperty({ description: 'Lý do sửa - hiện trong lịch sử nhiệm vụ' })
  @IsString()
  @MaxLength(500)
  reason!: string;
}

export class SubmitPersonalMissionDto {
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

  /**
   * Gửi kèm bảng khối A của ngày. Cố tình bắt khai rõ chứ không tự đính kèm:
   * bảng A là một thứ được duyệt riêng, tự gửi hộ thì cán bộ không biết mình
   * vừa trình cái gì lên.
   */
  @ApiPropertyOptional({ description: 'Gửi kèm bảng khối A của ngày' })
  @IsOptional()
  @IsBoolean()
  includeCriteria?: boolean;
}

/** Cấp trên gửi tiếp các nhiệm vụ đã duyệt lên cấp cao hơn. */
export class ForwardPersonalMissionDto {
  @ApiProperty()
  @IsMongoId()
  recipientId!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(1000)
  note!: string;

  /**
   * Nhiệm vụ và bảng khối A đều tích được trong bảng tổng, và gửi tiếp được
   * một mình - nên cả hai mảng đều không bắt buộc, service chặn khi rỗng cả hai.
   */
  @ApiPropertyOptional({
    description: 'Các nhiệm vụ được tích trong bảng tổng',
  })
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  itemIds?: string[];

  @ApiPropertyOptional({ description: 'Các bảng khối A được tích' })
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  criteriaSheetIds?: string[];
}

export class ReviewPersonalMissionDto {
  @ApiPropertyOptional({
    description: 'Các nhiệm vụ được tích trong bảng tổng',
  })
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  itemIds?: string[];

  @ApiPropertyOptional({ description: 'Các bảng khối A được tích' })
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  criteriaSheetIds?: string[];

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

export class PersonalMissionListQueryDto {
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

  @ApiPropertyOptional({
    description: 'Đúng một ngày; ưu tiên hơn fromDate/toDate',
  })
  @IsOptional()
  @IsString()
  reportDate?: string;

  @ApiPropertyOptional({ description: 'Khoảng ngày báo cáo, từ ngày' })
  @IsOptional()
  @IsString()
  fromDate?: string;

  @ApiPropertyOptional({ description: 'Khoảng ngày báo cáo, đến ngày' })
  @IsOptional()
  @IsString()
  toDate?: string;

  @ApiPropertyOptional({ enum: PERSONAL_MISSION_REVIEW_STATUSES })
  @IsOptional()
  @IsIn([...PERSONAL_MISSION_REVIEW_STATUSES])
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

export class PersonalMissionReportsQueryDto {
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

  @ApiPropertyOptional({ enum: PERSONAL_MISSION_REVIEW_STATUSES })
  @IsOptional()
  @IsIn([...PERSONAL_MISSION_REVIEW_STATUSES])
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  q?: string;
}

/** Bảng tổng theo trục cho cấp trên. */
export class PersonalMissionBoardQueryDto {
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

  @ApiPropertyOptional({ enum: PERSONAL_MISSION_REVIEW_STATUSES })
  @IsOptional()
  @IsIn([...PERSONAL_MISSION_REVIEW_STATUSES])
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

export const PERSONAL_MISSION_STAT_SCOPES = ['mine', 'unit'] as const;
export type PersonalMissionStatScope =
  (typeof PERSONAL_MISSION_STAT_SCOPES)[number];

export class PersonalMissionStatisticsQueryDto {
  @ApiPropertyOptional({ description: 'Bỏ trống = 30 ngày gần nhất' })
  @IsOptional()
  @IsString()
  fromDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  toDate?: string;

  @ApiPropertyOptional({
    enum: PERSONAL_MISSION_STAT_SCOPES,
    description:
      'mine = nhiệm vụ của tôi; unit = cả cây đơn vị của tôi, cần quyền duyệt',
  })
  @IsOptional()
  @IsIn([...PERSONAL_MISSION_STAT_SCOPES])
  scope?: PersonalMissionStatScope;

  @ApiPropertyOptional({ description: 'Lọc theo một trục' })
  @IsOptional()
  @IsMongoId()
  axisId?: string;
}

/**
 * Một dòng chấm khối A của báo cáo cá nhân.
 * Ô nào có gì là do mẫu `forCriteria` quyết định, nên chỉ nhận hai túi giá trị
 * theo khoá cột chứ không khai trường cứng.
 */
export class PersonalCriterionRowDto {
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

/** Lưu cả bảng khối A của một THÁNG - server ghi đè nguyên bộ. */
export class SavePersonalCriteriaSheetDto {
  /**
   * Kỳ tháng của bảng. Nhận cả YYYY-MM lẫn YYYY-MM-DD (server cắt lấy tháng)
   * để màn nhập đang đứng ở một ngày cụ thể khỏi phải tự tính kỳ.
   */
  @ApiPropertyOptional({
    description: 'YYYY-MM hoặc YYYY-MM-DD; bỏ trống = tháng này',
  })
  @IsOptional()
  @IsString()
  period?: string;

  @ApiProperty({ type: [PersonalCriterionRowDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PersonalCriterionRowDto)
  rows!: PersonalCriterionRowDto[];
}

/**
 * Cán bộ sửa lại bảng khối A ĐÃ GỬI - đường này chạy được cả khi bảng đang ở
 * tay cấp trên, đổi lại mọi ô đổi giá trị đều bị ghi vào nhật ký.
 *
 * Tách khỏi `SavePersonalCriteriaSheetDto` cho giống cặp sửa nháp / cập nhật
 * tiến độ của nhiệm vụ: lưu nháp là ghi đè im lặng, cập nhật là có lưu vết.
 */
export class UpdatePersonalCriteriaSheetDto {
  @ApiPropertyOptional({
    description: 'YYYY-MM hoặc YYYY-MM-DD; bỏ trống = tháng này',
  })
  @IsOptional()
  @IsString()
  period?: string;

  @ApiProperty({ type: [PersonalCriterionRowDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PersonalCriterionRowDto)
  rows!: PersonalCriterionRowDto[];

  @ApiPropertyOptional({ description: 'Lý do sửa - hiện trong nhật ký bảng' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

/** Một dòng chỉ huy chấm lại trong bảng khối A. */
export class ScoreCriterionRowDto {
  @ApiProperty()
  @IsMongoId()
  criterionId!: string;

  @ApiPropertyOptional({
    description: 'Điểm chỉ huy chấm: { "<khoá cột>": "<giá trị>" }',
  })
  @IsOptional()
  @IsObject()
  values?: Record<string, unknown>;
}

/**
 * Chỉ huy chấm lại cả bảng khối A rồi chốt hoàn thành.
 *
 * Chấm và chốt đi liền một thao tác, y như `ScorePersonalMissionDto` của nhiệm vụ.
 * Khác nhiệm vụ ở chỗ chốt áp cho CẢ BẢNG chứ không lẻ từng tiêu chí: bảng A
 * là một lá phiếu đánh giá, duyệt một nửa thì không còn nghĩa gì.
 */
export class ScorePersonalCriteriaSheetDto {
  @ApiProperty({ type: [ScoreCriterionRowDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScoreCriterionRowDto)
  rows!: ScoreCriterionRowDto[];

  @ApiPropertyOptional({ description: 'Nhận xét của chỉ huy' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
