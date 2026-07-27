import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsMongoId, IsOptional } from 'class-validator';
import { UnitKpiSheetStatus } from '../schemas/unit-kpi-sheet.schema';

export class UpdateUnitKpiSheetDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId({ message: 'Biểu mẫu không hợp lệ.' })
  templateId?: string;

  @ApiPropertyOptional({ enum: UnitKpiSheetStatus })
  @IsOptional()
  @IsEnum(UnitKpiSheetStatus)
  status?: UnitKpiSheetStatus;
}
