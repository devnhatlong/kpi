import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type KpiPeriodDocument = HydratedDocument<KpiPeriod>;

@Schema({ timestamps: true, toJSON: { virtuals: true } })
export class KpiPeriod {
  @Prop({ required: true, unique: true, trim: true, uppercase: true })
  code!: string;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ required: true, type: Date })
  startDate!: Date;

  @Prop({ required: true, type: Date })
  endDate!: Date;

  @Prop({ default: true, index: true })
  isActive!: boolean;
}

export const KpiPeriodSchema = SchemaFactory.createForClass(KpiPeriod);
KpiPeriodSchema.index({ startDate: 1, endDate: 1 });
