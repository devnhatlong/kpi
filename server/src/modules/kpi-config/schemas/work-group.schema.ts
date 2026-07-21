import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type WorkGroupDocument = HydratedDocument<WorkGroup>;

@Schema({ timestamps: true, toJSON: { virtuals: true } })
export class WorkGroup {
  @Prop({ required: true, unique: true, trim: true, uppercase: true })
  code!: string;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ trim: true, default: '' })
  description?: string;

  @Prop({ default: 0 })
  sortOrder!: number;

  @Prop({ default: true, index: true })
  isActive!: boolean;
}

export const WorkGroupSchema = SchemaFactory.createForClass(WorkGroup);
