import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsMongoId,
  IsOptional,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateKpiPeriodDto {
  @ApiProperty({ example: '2026-Q3' })
  @MinLength(2)
  @MaxLength(32)
  code!: string;

  @ApiProperty({ example: 'Quý 3/2026' })
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: '2026-07-01' })
  @IsDateString({}, { message: 'Ngày bắt đầu không hợp lệ.' })
  startDate!: string;

  @ApiProperty({ example: '2026-09-30' })
  @IsDateString({}, { message: 'Ngày kết thúc không hợp lệ.' })
  endDate!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isActive?: boolean;
}
