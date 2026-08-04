import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ContentGroupDocument = HydratedDocument<ContentGroup>;

/** Nhóm nội dung công việc - dùng để phân loại nội dung KPI. */
@Schema({ timestamps: true })
export class ContentGroup {
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

export const ContentGroupSchema = SchemaFactory.createForClass(ContentGroup);
ContentGroupSchema.index({ sortOrder: 1, name: 1 });
