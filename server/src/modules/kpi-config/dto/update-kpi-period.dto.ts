import { PartialType } from '@nestjs/swagger';
import { CreateKpiPeriodDto } from './create-kpi-period.dto';

export class UpdateKpiPeriodDto extends PartialType(CreateKpiPeriodDto) {}
