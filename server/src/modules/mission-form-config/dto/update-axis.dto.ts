import { PartialType } from '@nestjs/mapped-types';
import { CreateAxisDto } from './create-axis.dto';

export class UpdateAxisDto extends PartialType(CreateAxisDto) {}
