import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsMongoId,
  IsOptional,
  Min,
} from 'class-validator';
import {
  NumberRequired,
  StringNotRequired,
  StringRequired,
} from '@/common/decorators';
import { UnitHandoffStatus } from '../schemas/unit-handoff.schema';

export class CreateUnitHandoffDto {
  @ApiProperty({ description: 'Đơn vị chủ trì (gửi)' })
  @IsMongoId({ message: 'Đơn vị chủ trì không hợp lệ.' })
  sourceDepartmentId!: string;

  @ApiProperty({ description: 'Đơn vị nhận (peer)' })
  @IsMongoId({ message: 'Đơn vị nhận không hợp lệ.' })
  targetDepartmentId!: string;

  @ApiPropertyOptional({ description: 'Kỳ KPI' })
  @IsOptional()
  @IsMongoId({ message: 'Kỳ KPI không hợp lệ.' })
  periodId?: string;

  @ApiProperty({ description: 'ID nội dung công việc' })
  @IsMongoId({ message: 'Nội dung công việc không hợp lệ.' })
  contentId!: string;

  @StringRequired('Nhiệm vụ')
  title!: string;

  @StringNotRequired('Mô tả')
  description?: string;

  @ApiProperty({ example: '2026-07-31' })
  @IsDateString({}, { message: 'Thời hạn không hợp lệ.' })
  dueDate!: string;

  @StringRequired('Sản phẩm cần bàn giao')
  product!: string;

  @NumberRequired('Điểm chuẩn', { example: 10 })
  @Min(0)
  standardScore!: number;

  @ApiPropertyOptional({ description: 'Task Form 1 bên gửi (optional)' })
  @IsOptional()
  @IsMongoId()
  sourceTaskId?: string;

  @StringNotRequired('Ghi chú')
  note?: string;

  @ApiPropertyOptional({ enum: UnitHandoffStatus })
  @IsOptional()
  @IsEnum(UnitHandoffStatus)
  status?: UnitHandoffStatus;
}
