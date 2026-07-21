import { PartialType } from '@nestjs/swagger';
import { CreateWorkGroupDto } from './create-work-group.dto';

export class UpdateWorkGroupDto extends PartialType(CreateWorkGroupDto) {}
