import { PartialType } from '@nestjs/mapped-types';
import { CreateReportTemplateDto } from './create-report-template.dto';

export class UpdateReportTemplateDto extends PartialType(
  CreateReportTemplateDto,
) {}
