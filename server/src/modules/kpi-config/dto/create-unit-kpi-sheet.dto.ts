import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsMongoId, IsOptional } from 'class-validator';
import { UnitKpiSheetStatus } from '../schemas/unit-kpi-sheet.schema';

export class CreateUnitKpiSheetDto {
  @ApiProperty({ description: 'Đơn vị sở hữu Form KPI' })
  @IsMongoId({ message: 'Đơn vị không hợp lệ.' })
  departmentId!: string;

  @ApiProperty({ description: 'Kỳ KPI' })
  @IsMongoId({ message: 'Kỳ KPI không hợp lệ.' })
  periodId!: string;

  @ApiProperty({ description: 'Biểu mẫu cột' })
  @IsMongoId({ message: 'Biểu mẫu không hợp lệ.' })
  templateId!: string;

  @ApiPropertyOptional({ enum: UnitKpiSheetStatus })
  @IsOptional()
  @IsEnum(UnitKpiSheetStatus)
  status?: UnitKpiSheetStatus;
}
