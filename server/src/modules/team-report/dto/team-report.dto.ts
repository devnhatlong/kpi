import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { TEAM_REPORT_DAY_STATUSES } from '../schemas/team-report-day.schema';
import {
  TEAM_REPORT_PERIODS,
  TEAM_REPORT_RATINGS,
  type TeamReportRating,
} from '../schemas/team-report-summary.schema';
import {
  TEAM_REPORT_UNIT_ROLES,
  type TeamReportUnitRole,
} from '../schemas/team-report-adjustment-route.schema';

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
  /* Tên hay là cả trích yếu văn bản ("Kế hoạch số ... của Tỉnh ủy về ...") nên
     500 ký tự đã có việc chạm trần. */
  @ApiProperty()
  @IsString()
  @MaxLength(1000)
  name!: string;

  @ApiPropertyOptional({ description: 'Hạn hoàn thành YYYY-MM-DD' })
  @IsOptional()
  @IsString()
  deadline?: string;

  /* Sản phẩm của việc thường xuyên là cả bản kết quả gạch đầu dòng nhiều dòng
     (kiểm tra bao nhiêu cơ sở, xác minh bao nhiêu trường hợp...) - một bản như
     vậy đã ~700 ký tự, bản tổng hợp cả tháng dài gấp nhiều lần. Vẫn giữ trần để
     một lần dán nhầm cả văn bản không đi vào. */
  @ApiPropertyOptional({
    description: 'Sản phẩm, ô chữ tự do, được xuống dòng',
  })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  product?: string;

  @ApiPropertyOptional({ type: [TeamReportEvidenceDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TeamReportEvidenceDto)
  evidence?: TeamReportEvidenceDto[];

  @ApiPropertyOptional({
    description:
      'Ngày khai (YYYY-MM-DD) - nhập bù cho một ngày trước trong tháng hiện tại. Bỏ trống = hôm nay.',
  })
  @IsOptional()
  @IsString()
  reportDate?: string;
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
    type: () => [TeamReportEvidenceDto],
    description: 'Tài liệu kiểm chứng - thay cả danh sách',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TeamReportEvidenceDto)
  evidence?: TeamReportEvidenceDto[];

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

  @ApiPropertyOptional({
    description:
      'Ngày xong YYYY-MM-DD khi đóng từ bảng ngày cũ; trống = hôm nay',
  })
  @IsOptional()
  @IsString()
  closedDate?: string;
}

/** Mở lại một nhiệm vụ đã đóng nhầm. */
export class ReopenTeamReportTaskDto {
  @ApiProperty({ description: 'Số bản đang cầm' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}

/** Chuyển ngày khai của một nhiệm vụ - sửa việc lỡ nhập muộn sang đúng ngày. */
export class MoveTeamReportTaskDateDto {
  @ApiProperty({ description: 'Số bản đang cầm' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;

  @ApiProperty({ description: 'Ngày khai mới (YYYY-MM-DD)' })
  @IsString()
  createdDate!: string;
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

  @ApiPropertyOptional({
    description:
      'Các dòng đang bày trong kho - server trả kèm điểm đã chấm của từng dòng',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @IsMongoId({ each: true })
  candidateIds?: string[];
}

/**
 * Phần cuối phụ lục đơn vị khai lúc trình. Tổng điểm KPI tập thể KHÔNG có ở
 * đây - server tự cộng từ bảng B lúc trình, đơn vị không gõ.
 */
export class TeamReportConclusionDto {
  @ApiProperty({ enum: TEAM_REPORT_RATINGS })
  @IsIn(TEAM_REPORT_RATINGS)
  proposedRating!: TeamReportRating;

  @ApiProperty({ example: 'Nguyễn Văn A' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  compilerName!: string;

  @ApiProperty({ example: '0912345678' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  compilerPhone!: string;

  @ApiProperty({ example: 'Trần Văn B' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  leaderName!: string;
}

/** Trình một bản tổng hợp lên cấp trên đã chọn. */
export class SendTeamReportSummaryDto {
  @ApiProperty({ type: TeamReportConclusionDto })
  @IsObject({ message: 'Thiếu phần tổng điểm KPI tập thể / đề nghị xếp loại.' })
  @ValidateNested()
  @Type(() => TeamReportConclusionDto)
  conclusion!: TeamReportConclusionDto;

  @ApiPropertyOptional({
    description:
      'Người cấp trên nhận bản - chỉ khi luồng để người trình tự chọn; luồng có bảng đơn vị cố định thì bỏ trống',
  })
  @IsOptional()
  @IsMongoId()
  recipientId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

/** Nhận xét / đề nghị của đơn vị đồng nhận gửi đơn vị chủ trì. */
export class CommentTeamReportSummaryDto {
  @ApiProperty({ example: 'Đề nghị xem lại điểm nhiệm vụ 3 vì…' })
  @IsString()
  @MaxLength(2000)
  comment!: string;
}

export class TeamReportSummaryListQueryDto {
  @ApiPropertyOptional({ enum: TEAM_REPORT_DAY_STATUSES })
  @IsOptional()
  @IsIn([...TEAM_REPORT_DAY_STATUSES])
  status?: string;

  @ApiPropertyOptional({ description: 'Tìm theo tên báo cáo' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @ApiPropertyOptional({ description: 'Chỉ bản của một đơn vị gửi' })
  @IsOptional()
  @IsMongoId()
  departmentId?: string;

  @ApiPropertyOptional({ enum: TEAM_REPORT_PERIODS })
  @IsOptional()
  @IsIn([...TEAM_REPORT_PERIODS])
  period?: string;

  @ApiPropertyOptional({ description: 'Kỳ báo cáo giao với khoảng này - từ' })
  @IsOptional()
  @IsString()
  fromDate?: string;

  @ApiPropertyOptional({ description: 'Kỳ báo cáo giao với khoảng này - đến' })
  @IsOptional()
  @IsString()
  toDate?: string;

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

// ============================= phụ lục điểm cộng / điểm trừ / xếp loại

export class TeamReportAdjustmentQueryDto {
  @ApiPropertyOptional({
    description: 'Tháng YYYY-MM, mặc định tháng hiện tại',
  })
  @IsOptional()
  @IsString()
  periodMonth?: string;
}

/** Thêm một dòng kết quả dưới một mục của danh mục. */
export class AddTeamReportAdjustmentEntryDto {
  @ApiProperty({ description: 'Số bản đang cầm; lệch thì 409' })
  @IsInt()
  @Min(0)
  version!: number;

  @ApiProperty({ description: 'Mục trong danh mục điểm cộng / trừ / xếp loại' })
  @IsMongoId()
  itemId!: string;

  @ApiPropertyOptional({
    description: 'Giá trị theo khoá cột của mẫu phần đó: { "<khoá cột>": ... }',
  })
  @IsOptional()
  @IsObject()
  fieldValues?: Record<string, string | number>;
}

/** Sửa một dòng đã có - chỉ gửi ô đổi. Không đổi được mục của dòng. */
export class UpdateTeamReportAdjustmentEntryDto {
  @ApiProperty({ description: 'Số bản đang cầm; lệch thì 409' })
  @IsInt()
  @Min(0)
  version!: number;

  @ApiPropertyOptional({
    description: 'Ô đổi, theo khoá cột; chuỗi rỗng = xoá ô',
  })
  @IsOptional()
  @IsObject()
  fieldValues?: Record<string, string | number>;
}

/** Quản trị đặt ai được nhập bảng điểm cộng / trừ / xếp loại. */

/** Đội trình bảng điểm cộng / trừ / xếp loại lên một người cấp trên. */
export class SendTeamReportAdjustmentDto {
  @ApiProperty({ description: 'Số bản đang cầm; lệch thì 409' })
  @IsInt()
  @Min(0)
  version!: number;

  @ApiPropertyOptional({
    description:
      'Người cấp trên nhận bản - chỉ khi luồng để người trình tự chọn; luồng có nơi nhận cố định thì bỏ trống',
  })
  @IsOptional()
  @IsMongoId()
  recipientId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class TeamReportAdjustmentInboxQueryDto {
  @ApiPropertyOptional({
    enum: ['LEAD', 'COORDINATE', 'INFORM'],
    description: 'Hộp nào: chủ trì (mặc định), phối hợp, nhận để biết',
  })
  @IsOptional()
  @IsIn(['LEAD', 'COORDINATE', 'INFORM'])
  box?: 'LEAD' | 'COORDINATE' | 'INFORM';

  @ApiPropertyOptional({ enum: TEAM_REPORT_DAY_STATUSES })
  @IsOptional()
  @IsIn([...TEAM_REPORT_DAY_STATUSES])
  status?: string;

  /** Lọc theo tháng (YYYY-MM) - bảng theo tháng nào xem riêng tháng đó. */
  @ApiPropertyOptional({ example: '2026-10' })
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: 'Tháng phải có dạng YYYY-MM.',
  })
  periodMonth?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}

/* ------------------------------------------- luồng trình: nhiều luồng */

export class TeamReportAdjustmentScopeDto {
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roleCodes?: string[];

  @ApiPropertyOptional({ type: [String], description: 'Cấp đơn vị' })
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  levelIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  departmentIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  includeDescendants?: boolean;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  userIds?: string[];

  @ApiPropertyOptional({
    description: 'Chỉ cấp trên trực thuộc của người gửi (vế người nhận)',
  })
  @IsOptional()
  @IsBoolean()
  senderSuperiorOnly?: boolean;

  @ApiPropertyOptional({
    description: 'Chỉ đơn vị cấp dưới của người gửi (vế người nhận)',
  })
  @IsOptional()
  @IsBoolean()
  senderSubordinatesOnly?: boolean;
}

export class TeamReportRouteUnitDto {
  @ApiProperty({ description: 'Tài khoản nhận' })
  @IsMongoId({ message: 'Tài khoản không hợp lệ.' })
  userId!: string;

  @ApiProperty({ enum: TEAM_REPORT_UNIT_ROLES })
  @IsIn([...TEAM_REPORT_UNIT_ROLES], {
    message: 'Vai của đơn vị không hợp lệ.',
  })
  role!: TeamReportUnitRole;
}

export class TeamReportAdjustmentRouteDto {
  @ApiProperty({ example: 'Phòng / xã gửi về PV01' })
  @IsString()
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    type: () => [TeamReportRouteUnitDto],
    description:
      'Bảng tài khoản nhận cố định kèm vai (chỉ luồng báo cáo tổng hợp) - rỗng = người trình tự chọn',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => TeamReportRouteUnitDto)
  units?: TeamReportRouteUnitDto[];

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Duyệt cuối (duyệt 2 cấp) - tài khoản duyệt sau chủ trì',
  })
  @IsOptional()
  @IsMongoId({ message: 'Tài khoản duyệt cuối không hợp lệ.' })
  finalUserId?: string | null;

  @ApiProperty({ type: () => TeamReportAdjustmentScopeDto })
  @ValidateNested()
  @Type(() => TeamReportAdjustmentScopeDto)
  sender!: TeamReportAdjustmentScopeDto;

  @ApiProperty({ type: () => TeamReportAdjustmentScopeDto })
  @ValidateNested()
  @Type(() => TeamReportAdjustmentScopeDto)
  recipients!: TeamReportAdjustmentScopeDto;
}

/** Thay toàn bộ danh sách luồng - thứ tự mảng là thứ tự xét. */
export class SaveTeamReportAdjustmentRoutesDto {
  @ApiProperty({ type: () => [TeamReportAdjustmentRouteDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TeamReportAdjustmentRouteDto)
  routes!: TeamReportAdjustmentRouteDto[];
}

/** Khoảng ngày của bảng Thống kê; bỏ trống = 30 ngày gần nhất theo giờ server. */
export class TeamReportDashboardQueryDto {
  @ApiPropertyOptional({ example: '2026-09-01' })
  @IsOptional()
  @IsString()
  fromDate?: string;

  @ApiPropertyOptional({ example: '2026-09-30' })
  @IsOptional()
  @IsString()
  toDate?: string;
}

/* ------------------------------------------------- bảng thẩm định (PV01) */

export class TeamReportAppraisalBonusDto {
  @ApiPropertyOptional({ description: 'Tiêu chí ở danh mục Điểm cộng (I)' })
  @IsOptional()
  @IsMongoId()
  itemId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @Min(0)
  score?: number | null;

  @ApiPropertyOptional({ description: 'Cụ thể nội dung minh chứng' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  evidence?: string;
}

export class TeamReportAppraisalPenaltyDto {
  @ApiPropertyOptional({ description: 'Tiêu chí ở danh mục Điểm cộng (I)' })
  @IsOptional()
  @IsMongoId()
  itemId?: string;

  @ApiPropertyOptional({ description: 'Cụ thể nội dung trừ điểm' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  content?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @Min(0)
  score?: number | null;
}

export class TeamReportAppraisalUnitDto {
  @ApiProperty()
  @IsMongoId()
  departmentId!: string;

  @ApiPropertyOptional({ description: 'Tổng điểm tự chấm' })
  @IsOptional()
  @Type(() => Number)
  @Min(0)
  selfScore?: number | null;

  @ApiPropertyOptional({ type: [TeamReportAppraisalBonusDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => TeamReportAppraisalBonusDto)
  bonuses?: TeamReportAppraisalBonusDto[];

  @ApiPropertyOptional({ type: [TeamReportAppraisalPenaltyDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => TeamReportAppraisalPenaltyDto)
  penalties?: TeamReportAppraisalPenaltyDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  upgradeNote?: string;

  @ApiPropertyOptional({ enum: TEAM_REPORT_RATINGS })
  @IsOptional()
  @IsIn(['', ...TEAM_REPORT_RATINGS])
  proposedRating?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  ratingNote?: string;
}

/** Lưu cả bảng thẩm định (bản nháp / bị trả lại). */
/** Trình RIÊNG các đơn vị đã chọn trong bảng thẩm định. */
export class SendTeamReportAppraisalDto {
  @ApiProperty({ type: [String], description: 'Đơn vị trình lần này' })
  @IsArray()
  @ArrayMaxSize(300)
  @IsMongoId({ each: true })
  departmentIds!: string[];

  @ApiProperty({ description: 'Lãnh đạo phụ trách' })
  @IsString()
  @MaxLength(120)
  leaderName!: string;

  @ApiProperty({ description: 'Chỉ huy đội' })
  @IsString()
  @MaxLength(120)
  commanderName!: string;
}

export class SaveTeamReportAppraisalDto {
  @ApiPropertyOptional({ description: 'Phiên bản đang sửa - chống ghi đè' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  version?: number;

  @ApiProperty({ type: [TeamReportAppraisalUnitDto] })
  @IsArray()
  @ArrayMaxSize(300)
  @ValidateNested({ each: true })
  @Type(() => TeamReportAppraisalUnitDto)
  units!: TeamReportAppraisalUnitDto[];

  @ApiPropertyOptional({ description: 'Lãnh đạo phụ trách' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  leaderName?: string;

  @ApiPropertyOptional({ description: 'Chỉ huy đội' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  commanderName?: string;
}

/* ---------------------------------------- bảng đề xuất biểu dương, phê bình */

/** Một dòng biểu dương / phê bình. */
export class TeamReportCommendationRowDto {
  @ApiPropertyOptional({
    description: 'Id dòng đã lưu - giữ nguyên để lần lưu sau nhận ra dòng',
  })
  @IsOptional()
  @IsMongoId()
  _id?: string | null;

  @ApiPropertyOptional({
    description: 'Nhóm nội dung (mục Điểm cộng I) - chỉ dòng biểu dương',
  })
  @IsOptional()
  @IsMongoId()
  itemId?: string | null;

  @ApiProperty({ type: [String], description: 'Đơn vị, địa phương' })
  @IsArray()
  @ArrayMaxSize(300)
  @IsMongoId({ each: true })
  departmentIds!: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  content?: string;

  @ApiPropertyOptional({ description: 'Căn cứ, tài liệu kiểm chứng' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  evidence?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @ApiPropertyOptional({
    description: 'Dòng lấy từ bảng của một đội trong phòng - id dòng gốc',
  })
  @IsOptional()
  @IsMongoId()
  sourceRowId?: string | null;
}

/** Gửi bảng: luồng cố định thì bỏ trống; luồng tự chọn thì chọn cấp trên. */
export class SendTeamReportCommendationDto {
  @ApiPropertyOptional({ description: 'Người nhận (luồng tự chọn)' })
  @IsOptional()
  @IsMongoId()
  recipientId?: string;
}

export class SaveTeamReportCommendationDto {
  @ApiPropertyOptional({ description: 'Phiên bản đang sửa - chống ghi đè' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  version?: number;

  @ApiProperty({ type: [TeamReportCommendationRowDto] })
  @IsArray()
  @ArrayMaxSize(300)
  @ValidateNested({ each: true })
  @Type(() => TeamReportCommendationRowDto)
  praises!: TeamReportCommendationRowDto[];

  @ApiProperty({ type: [TeamReportCommendationRowDto] })
  @IsArray()
  @ArrayMaxSize(300)
  @ValidateNested({ each: true })
  @Type(() => TeamReportCommendationRowDto)
  criticisms!: TeamReportCommendationRowDto[];
}
