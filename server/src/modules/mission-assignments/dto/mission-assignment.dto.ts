import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  BooleanNotRequired,
  NumberNotRequired,
  NumberRequired,
  StringNotRequired,
  StringRequired,
} from '@/common/decorators';
import {
  ASSIGNMENT_STATUSES,
  HOLDER_TYPES,
  type HolderType,
} from '../schemas/mission-assignment.schema';

export class AssignmentEvidenceFileDto {
  @StringRequired('Key file', { example: 'local-abc' })
  key!: string;

  @StringRequired('Tên file', { example: 'ke-hoach.pdf' })
  name!: string;

  @NumberRequired('Kích thước (byte)', { example: 1024 })
  @Min(0)
  size!: number;

  @StringRequired('MIME type', { example: 'application/pdf' })
  mimeType!: string;
}

export class AssignmentTargetsDto {
  @ApiPropertyOptional({
    type: [String],
    description:
      'Đơn vị nhận - nhiệm vụ nằm ở đơn vị, do quản trị đơn vị xử lý',
  })
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true, message: 'Đơn vị nhận không hợp lệ.' })
  departmentIds?: string[];

  @ApiPropertyOptional({ type: [String], description: 'Cán bộ nhận trực tiếp' })
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true, message: 'Cán bộ nhận không hợp lệ.' })
  userIds?: string[];
}

export class CreateMissionAssignmentDto {
  @StringRequired('Trục', { example: '66af9f31f0e4d3e4f4305e92' })
  @IsMongoId({ message: 'Trục không hợp lệ.' })
  axisId!: string;

  @StringRequired('Nội dung công việc', { example: '66af9f31f0e4d3e4f4305e91' })
  @IsMongoId({ message: 'Nội dung công việc không hợp lệ.' })
  workContentId!: string;

  @StringRequired('Tên nhiệm vụ', { example: 'Triển khai đề án 06' })
  title!: string;

  @StringNotRequired('Sản phẩm dự kiến')
  product?: string;

  @StringRequired('Nhóm điểm', { example: '66af9f31f0e4d3e4f4305e93' })
  @IsMongoId({ message: 'Nhóm điểm không hợp lệ.' })
  scoreGroupId!: string;

  @StringNotRequired('Thời hạn hoàn thành (YYYY-MM-DD)')
  deadline?: string;

  @StringNotRequired('Ghi chú khi giao')
  note?: string;

  @ApiProperty({ type: AssignmentTargetsDto })
  @ValidateNested()
  @Type(() => AssignmentTargetsDto)
  targets!: AssignmentTargetsDto;
}

export class CreateMissionAssignmentBatchDto {
  @ApiProperty({ type: [CreateMissionAssignmentDto] })
  @IsArray({ message: 'items phải là mảng.' })
  @ArrayNotEmpty({ message: 'Chưa có nhiệm vụ nào để giao.' })
  @ValidateNested({ each: true })
  @Type(() => CreateMissionAssignmentDto)
  items!: CreateMissionAssignmentDto[];
}

export class DelegateMissionAssignmentDto {
  @ApiProperty({ enum: HOLDER_TYPES })
  @IsEnum(HOLDER_TYPES, { message: 'Kiểu nơi nhận không hợp lệ.' })
  targetType!: HolderType;

  @ApiPropertyOptional({ description: 'Đơn vị nhận (targetType = DEPARTMENT)' })
  @IsOptional()
  @IsMongoId({ message: 'Đơn vị nhận không hợp lệ.' })
  targetDepartmentId?: string;

  @ApiPropertyOptional({ description: 'Cán bộ nhận (targetType = USER)' })
  @IsOptional()
  @IsMongoId({ message: 'Cán bộ nhận không hợp lệ.' })
  targetUserId?: string;

  @StringNotRequired('Ghi chú khi giao tiếp')
  @MaxLength(1000, { message: 'Ghi chú tối đa 1000 ký tự.' })
  note?: string;
}

export class ReportMissionAssignmentDto {
  @NumberNotRequired('Tiến độ %')
  @Min(0, { message: 'Tiến độ phải ≥ 0.' })
  @Max(100, { message: 'Tiến độ tối đa 100.' })
  progressPercent?: number;

  @NumberNotRequired('Chất lượng %')
  @Min(0, { message: 'Chất lượng phải ≥ 0.' })
  @Max(100, { message: 'Chất lượng tối đa 100.' })
  qualityPercent?: number;

  @NumberNotRequired('Điểm tự chấm (thang 100)')
  @Min(0, { message: 'Điểm tự chấm phải ≥ 0.' })
  @Max(100, { message: 'Điểm tự chấm tối đa 100.' })
  selfScore?: number;

  @StringNotRequired('Kết quả thực hiện')
  resultNote?: string;

  @ApiPropertyOptional({ type: [AssignmentEvidenceFileDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AssignmentEvidenceFileDto)
  evidenceFiles?: AssignmentEvidenceFileDto[];
}

export class ApproveMissionAssignmentDto {
  @NumberNotRequired('Điểm duyệt thang 100 (bỏ trống = lấy điểm tự chấm)')
  @Min(0, { message: 'Điểm duyệt phải ≥ 0.' })
  @Max(100, { message: 'Điểm duyệt tối đa 100.' })
  approvedScore?: number;
}

export class RejectMissionAssignmentDto {
  @StringRequired('Lý do trả lại', { example: 'Thiếu tài liệu kiểm chứng.' })
  @MaxLength(1000, { message: 'Lý do trả lại tối đa 1000 ký tự.' })
  reason!: string;
}

class BaseAssignmentQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page phải là số nguyên.' })
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit phải là số nguyên.' })
  @Min(1)
  @Max(100)
  limit?: number = 10;

  @ApiPropertyOptional({ enum: ASSIGNMENT_STATUSES })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'Tìm theo tên nhiệm vụ' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ description: 'Lọc theo trục' })
  @IsOptional()
  @IsMongoId({ message: 'Trục không hợp lệ.' })
  axisId?: string;
}

/** Nhiệm vụ đang nằm ở chỗ tôi (đơn vị tôi hoặc chính tôi). */
export class ReceivedAssignmentQueryDto extends BaseAssignmentQueryDto {}

/** Nhiệm vụ tôi đã giao đi. */
export class IssuedAssignmentQueryDto extends BaseAssignmentQueryDto {
  @ApiPropertyOptional({ description: 'Chỉ lấy một lần giao' })
  @IsOptional()
  @IsString()
  batchId?: string;
}
