import { PartialType } from '@nestjs/mapped-types';
import { CreateContentGroupDto } from './create-content-group.dto';

export class UpdateContentGroupDto extends PartialType(CreateContentGroupDto) {}
