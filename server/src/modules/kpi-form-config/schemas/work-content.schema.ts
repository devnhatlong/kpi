import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type WorkContentDocument = HydratedDocument<WorkContent>;

/** Danh mục nội dung công việc — dùng cho dropdown form KPI cá nhân. */
@Schema({ timestamps: true })
export class WorkContent {
  @Prop({ required: true, unique: true, trim: true, uppercase: true })
  code!: string;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ trim: true, default: '' })
  description!: string;

  @Prop({ default: 0, min: 0 })
  sortOrder!: number;

  @Prop({ default: true, index: true })
  isActive!: boolean;
}

export const WorkContentSchema = SchemaFactory.createForClass(WorkContent);
WorkContentSchema.index({ sortOrder: 1, name: 1 });
