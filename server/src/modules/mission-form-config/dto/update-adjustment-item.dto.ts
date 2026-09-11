import { PartialType } from '@nestjs/mapped-types';
import { CreateAdjustmentItemDto } from './create-adjustment-item.dto';

export class UpdateAdjustmentItemDto extends PartialType(
  CreateAdjustmentItemDto,
) {}
