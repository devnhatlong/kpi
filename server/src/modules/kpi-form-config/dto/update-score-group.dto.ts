import { PartialType } from '@nestjs/mapped-types';
import { CreateScoreGroupDto } from './create-score-group.dto';

export class UpdateScoreGroupDto extends PartialType(CreateScoreGroupDto) {}
