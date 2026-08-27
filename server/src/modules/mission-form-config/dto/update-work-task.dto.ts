import { PartialType } from '@nestjs/mapped-types';
import { CreateWorkTaskDto } from './create-work-task.dto';

export class UpdateWorkTaskDto extends PartialType(CreateWorkTaskDto) {}
