import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsMongoId,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import {
  NumberNotRequired,
  NumberRequired,
  StringNotRequired,
  StringRequired,
} from '@/common/decorators';
import { TaskStatus } from '../schemas/task-assignment.schema';

export class CreateTaskAssignmentDto {
  @ApiProperty({ description: 'ID nội dung công việc', type: String })
  @IsMongoId({ message: 'Nội dung công việc không hợp lệ.' })
  contentId!: string;

  @StringRequired('Nhiệm vụ cụ thể')
  title!: string;

  @StringNotRequired('Mô tả nhiệm vụ')
  description?: string;

  @ApiProperty({ description: 'ID người thực hiện', type: String })
  @IsMongoId({ message: 'Người thực hiện không hợp lệ.' })
  assigneeId!: string;

  @ApiProperty({ description: 'Thời hạn hoàn thành', example: '2026-07-31' })
  @IsDateString({}, { message: 'Thời hạn hoàn thành không hợp lệ.' })
  dueDate!: string;

  @ApiPropertyOptional({
    description: 'Thời hạn báo cáo',
    example: '2026-07-25',
  })
  @IsOptional()
  @IsDateString({}, { message: 'Thời hạn báo cáo không hợp lệ.' })
  reportDueDate?: string;

  @StringRequired('Sản phẩm cần bàn giao')
  product!: string;

  @StringNotRequired('Sản phẩm sau khi thực hiện')
  actualProduct?: string;

  @NumberRequired('Điểm chuẩn', { example: 10 })
  @Min(0, { message: 'Điểm chuẩn không được âm.' })
  standardScore!: number;

  @ApiPropertyOptional({ enum: TaskStatus })
  @IsOptional()
  @IsEnum(TaskStatus, { message: 'Trạng thái nhiệm vụ không hợp lệ.' })
  status?: TaskStatus;

  @NumberNotRequired('Tỷ lệ tiến độ tự chấm')
  @Min(0)
  @Max(100)
  selfProgressPercent?: number;

  @NumberNotRequired('Điểm tiến độ tự chấm')
  @Min(0)
  selfProgressScore?: number;

  @NumberNotRequired('Tỷ lệ chất lượng tự chấm')
  @Min(0)
  @Max(100)
  selfQualityPercent?: number;

  @NumberNotRequired('Điểm chất lượng tự chấm')
  @Min(0)
  selfQualityScore?: number;

  @NumberNotRequired('Điểm cộng/trừ đề nghị')
  proposedAdjustment?: number;

  @StringNotRequired('Lý do đề nghị cộng/trừ')
  proposedAdjustmentReason?: string;

  @NumberNotRequired('Tỷ lệ tiến độ thẩm định')
  @Min(0)
  @Max(100)
  appraisalProgressPercent?: number;

  @NumberNotRequired('Điểm tiến độ thẩm định')
  @Min(0)
  appraisalProgressScore?: number;

  @NumberNotRequired('Tỷ lệ chất lượng thẩm định')
  @Min(0)
  @Max(100)
  appraisalQualityPercent?: number;

  @NumberNotRequired('Điểm chất lượng thẩm định')
  @Min(0)
  appraisalQualityScore?: number;

  @StringNotRequired('Ghi chú')
  note?: string;
}
