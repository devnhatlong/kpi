import { PartialType } from '@nestjs/mapped-types';
import { CreateWorkContentDto } from './create-work-content.dto';

export class UpdateWorkContentDto extends PartialType(CreateWorkContentDto) {}
