import { IsEnum, IsIn, IsMongoId, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';
import { UnitHandoffStatus } from '../schemas/unit-handoff.schema';
import { UnitKpiSheetStatus } from '../schemas/unit-kpi-sheet.schema';

export class UnitKpiSheetListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsMongoId()
  departmentId?: string;

  @IsOptional()
  @IsMongoId()
  periodId?: string;

  @IsOptional()
  @IsEnum(UnitKpiSheetStatus)
  status?: UnitKpiSheetStatus;
}

export class UnitHandoffListQueryDto extends PaginationQueryDto {
  /** out = Form 2 (chủ trì), in = Form 3 (tiếp nhận) */
  @IsOptional()
  @IsIn(['out', 'in'])
  direction?: 'out' | 'in';

  @IsOptional()
  @IsMongoId()
  departmentId?: string;

  @IsOptional()
  @IsMongoId()
  periodId?: string;

  @IsOptional()
  @IsEnum(UnitHandoffStatus)
  status?: UnitHandoffStatus;
}
