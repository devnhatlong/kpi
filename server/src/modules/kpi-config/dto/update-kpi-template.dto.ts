import { PartialType } from '@nestjs/swagger';
import { CreateKpiTemplateDto } from './create-kpi-template.dto';

export class UpdateKpiTemplateDto extends PartialType(CreateKpiTemplateDto) {}
