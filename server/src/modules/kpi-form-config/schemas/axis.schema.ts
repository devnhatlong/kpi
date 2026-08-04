import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AxisDocument = HydratedDocument<Axis>;

/** Trục KPI - phân loại cấp cao cho nội dung công việc. */
@Schema({ timestamps: true })
export class Axis {
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

export const AxisSchema = SchemaFactory.createForClass(Axis);
AxisSchema.index({ sortOrder: 1, name: 1 });
