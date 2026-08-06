import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  ValidateNested,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { BooleanNotRequired, StringRequired } from '@/common/decorators';
import { KPI_SCOPES, type KpiScope } from '../kpi-scope.constants';

export class KpiScopeConfigItemDto {
  @StringRequired('Mã vai trò', { example: 'UNIT_ADMIN' })
  roleCode!: string;

  @BooleanNotRequired('Vai trò này được giao KPI', { example: true })
  isEnabled?: boolean;

  @ApiProperty({ enum: KPI_SCOPES, isArray: true })
  @IsArray()
  @IsEnum(KPI_SCOPES, { each: true, message: 'Phạm vi không hợp lệ.' })
  scopes!: KpiScope[];

  @BooleanNotRequired('Kết quả cần cấp trên duyệt', { example: true })
  requireApproval?: boolean;

  @StringRequired('Ghi chú nội bộ', { example: '' })
  note!: string;
}

export class SaveKpiScopeConfigDto {
  @ApiProperty({ type: [KpiScopeConfigItemDto] })
  @IsArray()
  @ArrayNotEmpty({ message: 'Chưa có cấu hình nào để lưu.' })
  @ValidateNested({ each: true })
  @Type(() => KpiScopeConfigItemDto)
  items!: KpiScopeConfigItemDto[];
}
