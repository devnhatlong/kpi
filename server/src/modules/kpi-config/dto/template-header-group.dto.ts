import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsOptional, ValidateNested } from 'class-validator';
import { StringRequired } from '@/common/decorators';

export class TemplateHeaderGroupDto {
  @StringRequired('ID nhóm header')
  id!: string;

  @StringRequired('Tên nhóm header')
  name!: string;

  @ApiPropertyOptional({ type: () => [TemplateHeaderGroupDto], default: [] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TemplateHeaderGroupDto)
  children?: TemplateHeaderGroupDto[];
}
