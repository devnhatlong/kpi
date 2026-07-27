import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type UnitKpiSheetDocument = HydratedDocument<UnitKpiSheet>;

export enum UnitKpiSheetStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  CLOSED = 'CLOSED',
}

@Schema({ timestamps: true, toJSON: { virtuals: true } })
export class UnitKpiSheet {
  @Prop({
    required: true,
    type: Types.ObjectId,
    ref: 'Department',
    index: true,
  })
  departmentId!: Types.ObjectId;

  @Prop({
    required: true,
    type: Types.ObjectId,
    ref: 'KpiPeriod',
    index: true,
  })
  periodId!: Types.ObjectId;

  @Prop({
    required: true,
    type: Types.ObjectId,
    ref: 'KpiTemplate',
    index: true,
  })
  templateId!: Types.ObjectId;

  @Prop({
    enum: UnitKpiSheetStatus,
    default: UnitKpiSheetStatus.ACTIVE,
    index: true,
  })
  status!: UnitKpiSheetStatus;
}

export const UnitKpiSheetSchema = SchemaFactory.createForClass(UnitKpiSheet);
UnitKpiSheetSchema.index(
  { departmentId: 1, periodId: 1 },
  { unique: true },
);
