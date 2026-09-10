import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsMongoId,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { TEAM_REPORT_DAY_STATUSES } from '../schemas/team-report-day.schema';
import { TEAM_REPORT_PERIODS } from '../schemas/team-report-summary.schema';

/** Tệp kiểm chứng gửi kèm - id lấy từ module tải tệp dùng chung. */
export class TeamReportEvidenceDto {
  @ApiProperty()
  @IsMongoId()
  uploadId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;
}

/** Giai đoạn 1: những trường bất kỳ ai trong đội cũng gõ được. */
export class CreateTeamReportTaskDto {
  @ApiProperty()
  @IsString()
  @MaxLength(500)
  name!: string;

  @ApiPropertyOptional({ description: 'Hạn hoàn thành YYYY-MM-DD' })
  @IsOptional()
  @IsString()
  deadline?: string;

  @ApiPropertyOptional({ description: 'Sản phẩm phải ra, ô chữ tự do' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  product?: string;

  @ApiPropertyOptional({ type: [TeamReportEvidenceDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TeamReportEvidenceDto)
  evidence?: TeamReportEvidenceDto[];
}

/**
 * Sửa một dòng. `version` là bắt buộc - đây là toàn bộ cơ chế chống đè.
 *
 * Cả đội gõ chung một bảng qua một tài khoản nên server không phân biệt được ai
 * với ai. Client gửi kèm số bản đang cầm; lệch thì server từ chối chứ không ghi
 * đè phần người khác vừa lưu.
 */
export class UpdateTeamReportTaskDto extends CreateTeamReportTaskDto {
  @ApiProperty({ description: 'Số bản đang cầm; lệch thì server trả 409' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}

/**
 * Giai đoạn 2: phân loại và chấm.
 *
 * Không có trường cứng cho tiến độ hay chất lượng: chọn trục xong là bộ cột do
 * quản trị cấu hình quyết định, mỗi trục một khác. Giá trị đi theo KHOÁ CỘT.
 */
export class ClassifyTeamReportTaskDto {
  @ApiProperty({ description: 'Số bản đang cầm' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;

  @ApiPropertyOptional({
    description: 'Trục công tác; đổi trục là đổi luôn bộ cột',
  })
  @IsOptional()
  @IsMongoId()
  axisId?: string | null;

  @ApiPropertyOptional({
    description: 'Nội dung công việc thuộc trục; null = bỏ phân loại',
  })
  @IsOptional()
  @IsMongoId()
  workContentId?: string | null;

  @ApiPropertyOptional({
    description: 'Giá trị cột chữ/số/ngày: { "<khoá cột>": "<giá trị>" }',
  })
  @IsOptional()
  @IsObject()
  fieldValues?: Record<string, string | number>;

  @ApiPropertyOptional({
    description:
      'Giá trị cột danh mục: { "<khoá cột>": "<id trong danh mục>" }',
  })
  @IsOptional()
  @IsObject()
  catalogValues?: Record<string, string>;
}

/**
 * Đóng một nhiệm vụ - hai tình huống khác hẳn nhau.
 *
 * `done = true`: làm xong. Không hỏi lý do, vì "xong" đã là lý do.
 * `done = false`: dừng giữa chừng. BẮT BUỘC nêu lý do - cấp trên phải đọc được
 * vì sao một việc đang chạy lại thôi không làm nữa.
 */
export class CloseTeamReportTaskDto {
  @ApiProperty({ description: 'Số bản đang cầm' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;

  @ApiPropertyOptional({ description: 'true = đã hoàn thành; false = dừng dở' })
  @IsOptional()
  @IsBoolean()
  done?: boolean;

  @ApiPropertyOptional({ description: 'Bắt buộc khi dừng giữa chừng' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

/** Mở lại một nhiệm vụ đã đóng nhầm. */
export class ReopenTeamReportTaskDto {
  @ApiProperty({ description: 'Số bản đang cầm' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}

export class TeamReportSheetQueryDto {
  @ApiPropertyOptional({
    description: 'Ngày báo cáo YYYY-MM-DD; trống = hôm nay',
  })
  @IsOptional()
  @IsString()
  reportDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  q?: string;
}

/** Gửi báo cáo ngày lên phòng. */
export class SubmitTeamReportDayDto {
  @ApiProperty({ description: 'Ngày báo cáo YYYY-MM-DD' })
  @IsString()
  reportDate!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

// ==================================================== báo cáo tổng hợp của đội

/** Kho nhiệm vụ để tích chọn vào một bản tổng hợp. */
export class TeamReportSummaryCandidatesQueryDto {
  @ApiProperty({ description: 'Đầu kỳ YYYY-MM-DD' })
  @IsString()
  fromDate!: string;

  @ApiProperty({ description: 'Cuối kỳ YYYY-MM-DD' })
  @IsString()
  toDate!: string;

  @ApiPropertyOptional({ description: 'Tìm theo tên nhiệm vụ hoặc sản phẩm' })
  @IsOptional()
  @IsString()
  q?: string;

  /*
    PERIOD: chỉ việc còn sống trong kỳ - dùng lúc LẬP bản, vì lúc đó khoảng ngày
    chính là thứ người dùng vừa chọn để khoanh vùng.

    ALL: cả kho của đội, mỗi việc kèm cờ `inPeriod`. Dùng lúc THÊM vào bản đã
    lập: thêm việc ngoài kỳ là quyền của người lập (server chỉ đòi việc phải sẵn
    sàng), nên hộp chọn không được giấu mất chúng.
  */
  @ApiPropertyOptional({ enum: ['PERIOD', 'ALL'], default: 'PERIOD' })
  @IsOptional()
  @IsIn(['PERIOD', 'ALL'])
  scope?: 'PERIOD' | 'ALL';

  /*
    Lọc theo ĐỘI - chỉ có nghĩa với bản của phòng, nơi kho gồm việc của nhiều
    đội. Bỏ trống là lấy cả nhánh. Id lạ bị bỏ qua chứ không báo lỗi: đây là bộ
    lọc để nhìn cho gọn, không phải cổng kiểm quyền - phạm vi thật vẫn do cây
    đơn vị quyết.
  */
  @ApiPropertyOptional({ type: [String], description: 'Id các đội cần lọc' })
  @IsOptional()
  @Transform(({ value }): string[] => {
    if (typeof value === 'string') return value.split(',').filter(Boolean);
    return Array.isArray(value) ? (value as string[]) : [];
  })
  @IsArray()
  @IsString({ each: true })
  departmentIds?: string[];
}

/**
 * Lập một bản tổng hợp.
 *
 * `taskIds` là tập CHỌN TAY, không suy ra từ khoảng ngày: khoảng ngày chỉ để lọc
 * ra kho cho dễ nhìn, còn đưa việc nào vào báo cáo là quyết định của người lập.
 */
export class CreateTeamReportSummaryDto {
  @ApiProperty()
  @IsString()
  @MaxLength(300)
  title!: string;

  @ApiProperty({ enum: TEAM_REPORT_PERIODS })
  @IsIn([...TEAM_REPORT_PERIODS])
  period!: string;

  @ApiProperty({ description: 'Đầu kỳ YYYY-MM-DD' })
  @IsString()
  fromDate!: string;

  @ApiProperty({ description: 'Cuối kỳ YYYY-MM-DD' })
  @IsString()
  toDate!: string;

  @ApiProperty({ description: 'Nhiệm vụ đưa vào báo cáo' })
  @IsArray()
  @ArrayNotEmpty()
  @IsMongoId({ each: true })
  taskIds!: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

/**
 * Thêm / bớt nhiệm vụ của một bản đã lập.
 *
 * Hai danh sách trong một lượt gọi chứ không tách hai endpoint: đổi tập nhiệm
 * vụ xong phải chụp lại toàn bộ dòng, gọi hai lượt là chụp lại hai lần và giữa
 * hai lượt bản đang ở trạng thái dở dang.
 */
export class ChangeTeamReportSummaryTasksDto {
  @ApiPropertyOptional({ description: 'Nhiệm vụ đưa thêm vào báo cáo' })
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  add?: string[];

  @ApiPropertyOptional({ description: 'Nhiệm vụ gỡ khỏi báo cáo' })
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  remove?: string[];
}

/** Xem trước điểm của một tập nhiệm vụ, chưa lập báo cáo nào. */
export class PreviewTeamReportSummaryDto {
  @ApiProperty({ description: 'Nhiệm vụ đang tích chọn' })
  @IsArray()
  @IsMongoId({ each: true })
  taskIds!: string[];
}

/** Trình một bản tổng hợp lên cấp trên đã chọn. */
export class SendTeamReportSummaryDto {
  @ApiProperty({ description: 'Người cấp trên nhận bản này' })
  @IsMongoId()
  recipientId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class TeamReportSummaryListQueryDto {
  @ApiPropertyOptional({ enum: TEAM_REPORT_DAY_STATUSES })
  @IsOptional()
  @IsIn([...TEAM_REPORT_DAY_STATUSES])
  status?: string;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}

export class TeamReportInboxQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fromDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  toDate?: string;

  @ApiPropertyOptional({ enum: TEAM_REPORT_DAY_STATUSES })
  @IsOptional()
  @IsIn([...TEAM_REPORT_DAY_STATUSES])
  status?: string;

  @ApiPropertyOptional({ description: 'Lọc theo một đội' })
  @IsOptional()
  @IsMongoId()
  departmentId?: string;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}

/**
 * Phòng chỉnh số trên một dòng của báo cáo đã nhận.
 *
 * Ghi vào CẢ bản chụp lẫn nhiệm vụ sống: sửa mỗi bản chụp thì hôm sau đội vẫn
 * khai số cũ và phòng phải chỉnh lại y hệt mỗi ngày.
 */
export class ReviewEditRowDto {
  @ApiProperty()
  @IsMongoId()
  taskId!: string;

  @ApiPropertyOptional({ description: 'Giá trị chỉnh theo khoá cột của mẫu' })
  @IsOptional()
  @IsObject()
  fieldValues?: Record<string, string | number>;

  @ApiPropertyOptional({ description: 'Cột danh mục chỉnh, theo khoá cột' })
  @IsOptional()
  @IsObject()
  catalogValues?: Record<string, string>;
}

export class ReviewTeamReportDayDto {
  @ApiPropertyOptional({ type: [ReviewEditRowDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReviewEditRowDto)
  rows?: ReviewEditRowDto[];

  /* Không bắt buộc: ai sửa, sửa gì, lúc nào đã có trong nhật ký. Ghi thêm lý
     do thì vào nhật ký cùng, không ghi thì thôi. */
  @ApiPropertyOptional({ description: 'Vì sao chỉnh - vào nhật ký nếu có' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

/**
 * Đội chấm lại một dòng ngay trên bản tổng hợp CÒN NHÁP.
 *
 * Khai SAU `ReviewEditRowDto` vì `@ApiProperty({ type: [...] })` chạy ngay lúc
 * nạp module - tham chiếu một lớp khai bên dưới là lỗi TDZ, server không khởi
 * động nổi.
 *
 * Không có `reason` như bên cấp trên chỉnh: đây là đội sửa bản của chính mình,
 * chưa trình đi đâu - bắt khai lý do cho việc tự sửa nháp là thủ tục thừa.
 */
export class EditTeamReportSummaryDto {
  @ApiProperty({ type: [ReviewEditRowDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ReviewEditRowDto)
  rows!: ReviewEditRowDto[];
}

export class DecideTeamReportDayDto {
  @ApiProperty({ enum: ['APPROVE', 'RETURN'] })
  @IsIn(['APPROVE', 'RETURN'])
  decision!: 'APPROVE' | 'RETURN';

  @ApiPropertyOptional({ description: 'Bắt buộc khi trả lại' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

/** Phòng gộp các báo cáo đội đã duyệt rồi trình lên tỉnh. */
export class PromoteTeamReportDto {
  @ApiProperty({ description: 'Ngày báo cáo YYYY-MM-DD' })
  @IsString()
  reportDate!: string;

  @ApiProperty({ description: 'Các báo cáo đội đưa vào bản gộp' })
  @IsArray()
  @ArrayNotEmpty()
  @IsMongoId({ each: true })
  dayIds!: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

/** Tab phân loại lọc theo việc đã phân loại hay chưa. */
export class TeamReportClassifyQueryDto {
  @ApiPropertyOptional({ description: 'Ngày báo cáo YYYY-MM-DD' })
  @IsOptional()
  @IsString()
  reportDate?: string;

  @ApiPropertyOptional({ description: 'true = chỉ việc chưa phân loại' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  onlyUnclassified?: boolean;
}

// ================================================== bảng A - tiêu chí chung

export class TeamReportCriteriaQueryDto {
  @ApiPropertyOptional({
    description: 'Tháng YYYY-MM, mặc định tháng hiện tại',
  })
  @IsOptional()
  @IsString()
  periodMonth?: string;
}

/** Một dòng tiêu chí vừa chấm - chỉ gửi những ô đổi. */
export class TeamReportCriterionPatchDto {
  @ApiProperty()
  @IsMongoId()
  criterionId!: string;

  @ApiPropertyOptional({ description: 'Giá trị theo khoá cột của mẫu bảng A' })
  @IsOptional()
  @IsObject()
  fieldValues?: Record<string, string | number>;
}

export class SaveTeamReportCriteriaDto {
  /** Số bản vừa đọc về - lệch là có người khác vừa sửa, server trả 409. */
  @ApiProperty()
  @IsInt()
  @Min(0)
  version!: number;

  @ApiProperty({ type: [TeamReportCriterionPatchDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => TeamReportCriterionPatchDto)
  rows!: TeamReportCriterionPatchDto[];
}
