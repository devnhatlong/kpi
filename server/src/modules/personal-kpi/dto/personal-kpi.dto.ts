import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  NumberNotRequired,
  NumberRequired,
  StringNotRequired,
  StringRequired,
} from '@/common/decorators';

export class EvidenceFileDto {
  @StringRequired('Key file', { example: 'local-abc' })
  key!: string;

  @StringRequired('Tên file', { example: 'bang-chung.pdf' })
  name!: string;

  @NumberRequired('Kích thước (byte)', { example: 1024 })
  @Min(0)
  size!: number;

  @StringRequired('MIME type', { example: 'application/pdf' })
  mimeType!: string;
}

export class CreatePersonalKpiDto {
  @StringRequired('Trục', { example: '66af9f31f0e4d3e4f4305e92' })
  @IsMongoId({ message: 'Trục không hợp lệ.' })
  axisId!: string;

  @StringRequired('Nội dung công việc', {
    example: '66af9f31f0e4d3e4f4305e91',
  })
  @IsMongoId({ message: 'Nội dung công việc không hợp lệ.' })
  workContentId!: string;

  @StringRequired('Tên nhiệm vụ', { example: 'Hoàn thành báo cáo quý' })
  title!: string;

  @StringNotRequired('Thời hạn hoàn thành (YYYY-MM-DD)')
  deadline?: string;

  @StringNotRequired('Sản phẩm dự kiến')
  product?: string;

  @NumberRequired('Điểm chuẩn', { example: 5 })
  @Min(0, { message: 'Điểm chuẩn phải ≥ 0.' })
  standardScore!: number;

  @StringNotRequired('Đơn vị thực hiện')
  executingUnit?: string;

  @NumberNotRequired('KPI tiến độ %')
  progressPercent?: number;

  @NumberNotRequired('Điểm tự chấm tiến độ')
  progressSelfScore?: number;

  @NumberNotRequired('KPI chất lượng %')
  qualityPercent?: number;

  @NumberNotRequired('Điểm tự chấm chất lượng')
  qualitySelfScore?: number;

  @StringNotRequired('Đề nghị khác')
  note?: string;

  @ApiPropertyOptional({ type: [EvidenceFileDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EvidenceFileDto)
  evidenceFiles?: EvidenceFileDto[];
}

export class CreatePersonalKpiBatchDto {
  @StringNotRequired('Ngày báo cáo YYYY-MM-DD (mặc định hôm nay theo giờ VN server)', {
    example: '2026-08-04',
  })
  reportDate?: string;

  @ApiProperty({ type: [CreatePersonalKpiDto] })
  @IsArray({ message: 'items phải là mảng.' })
  @ValidateNested({ each: true })
  @Type(() => CreatePersonalKpiDto)
  items!: CreatePersonalKpiDto[];
}

export class UpdatePersonalKpiDto {
  @StringNotRequired('Trục')
  @IsOptional()
  @IsMongoId({ message: 'Trục không hợp lệ.' })
  axisId?: string;

  @StringNotRequired('Nội dung công việc')
  @IsOptional()
  @IsMongoId({ message: 'Nội dung công việc không hợp lệ.' })
  workContentId?: string;

  @StringNotRequired('Tên nhiệm vụ')
  title?: string;

  @StringNotRequired('Thời hạn hoàn thành')
  deadline?: string;

  @StringNotRequired('Sản phẩm dự kiến')
  product?: string;

  @NumberNotRequired('Điểm chuẩn')
  @IsOptional()
  @IsNumber({}, { message: 'Điểm chuẩn phải là số.' })
  @Min(0, { message: 'Điểm chuẩn phải ≥ 0.' })
  standardScore?: number;

  @StringNotRequired('Đơn vị thực hiện')
  executingUnit?: string;

  @NumberNotRequired('KPI tiến độ %')
  progressPercent?: number;

  @NumberNotRequired('Điểm tự chấm tiến độ')
  progressSelfScore?: number;

  @NumberNotRequired('KPI chất lượng %')
  qualityPercent?: number;

  @NumberNotRequired('Điểm tự chấm chất lượng')
  qualitySelfScore?: number;

  @StringNotRequired('Đề nghị khác')
  note?: string;

  @ApiPropertyOptional({ type: [EvidenceFileDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EvidenceFileDto)
  evidenceFiles?: EvidenceFileDto[];
}

export class PersonalKpiListQueryDto {
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

  @ApiPropertyOptional({
    enum: ['DRAFT', 'SENT', 'REJECTED', 'COMPLETED'],
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'Ngày báo cáo YYYY-MM-DD' })
  @IsOptional()
  @IsString()
  reportDate?: string;

  @ApiPropertyOptional({ description: 'Từ khóa tìm theo tên nhiệm vụ' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ description: 'Lọc theo trục' })
  @IsOptional()
  @IsMongoId({ message: 'Trục không hợp lệ.' })
  axisId?: string;
}

export class PersonalKpiReportsQueryDto {
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

  @ApiPropertyOptional({ description: 'Từ ngày (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  fromDate?: string;

  @ApiPropertyOptional({ description: 'Đến ngày (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  toDate?: string;

  @ApiPropertyOptional({
    enum: ['DRAFT', 'SENT', 'REJECTED', 'COMPLETED'],
    description: 'Lọc báo cáo có ít nhất 1 nhiệm vụ ở trạng thái này',
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'Tìm theo tên nhiệm vụ trong báo cáo' })
  @IsOptional()
  @IsString()
  q?: string;
}

export class SendPersonalKpiDto {
  @ApiPropertyOptional({
    description: 'Người nhận (cá nhân). Có thể bỏ trống nếu gửi theo đơn vị.',
    example: '66af9f31f0e4d3e4f4305e91',
  })
  @ValidateIf((o: SendPersonalKpiDto) => !o.recipientDepartmentId || !!o.recipientId)
  @IsOptional()
  @IsMongoId({ message: 'Người nhận không hợp lệ.' })
  recipientId?: string;

  @ApiPropertyOptional({
    description: 'Đơn vị nhận (cấp trên 1 bậc). Có thể gửi chỉ đơn vị, không chọn cá nhân.',
    example: '66af9f31f0e4d3e4f4305e92',
  })
  @ValidateIf((o: SendPersonalKpiDto) => !o.recipientId || !!o.recipientDepartmentId)
  @IsOptional()
  @IsMongoId({ message: 'Đơn vị nhận không hợp lệ.' })
  recipientDepartmentId?: string;

  @StringRequired('Nội dung gửi', { example: 'Kính gửi' })
  @MaxLength(1000, { message: 'Nội dung gửi tối đa 1000 ký tự.' })
  note!: string;
}
