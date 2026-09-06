import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
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

  @ApiProperty({ description: 'Vì sao chỉnh - vào nhật ký' })
  @IsString()
  @MaxLength(500)
  reason!: string;
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
