import { PartialType } from '@nestjs/swagger';
import { CreateWorkContentDto } from './create-work-content.dto';

export class UpdateWorkContentDto extends PartialType(CreateWorkContentDto) {}
