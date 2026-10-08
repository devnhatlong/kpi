import { PartialType } from '@nestjs/mapped-types';
import { CreateWorkContentSetDto } from './create-work-content-set.dto';

export class UpdateWorkContentSetDto extends PartialType(
  CreateWorkContentSetDto,
) {}
