import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type WorkContentDocument = HydratedDocument<WorkContent>;

@Schema({ timestamps: true, toJSON: { virtuals: true } })
export class WorkContent {
  @Prop({ required: true, unique: true, trim: true, uppercase: true })
  code!: string;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'WorkGroup', index: true })
  groupId!: Types.ObjectId;

  @Prop({ trim: true, default: '' })
  description?: string;

  @Prop({ default: 0 })
  sortOrder!: number;

  @Prop({ default: true, index: true })
  isActive!: boolean;
}

export const WorkContentSchema = SchemaFactory.createForClass(WorkContent);
WorkContentSchema.index({ groupId: 1, sortOrder: 1, name: 1 });
