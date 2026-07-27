import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type UnitHandoffDocument = HydratedDocument<UnitHandoff>;

export enum UnitHandoffStatus {
  DRAFT = 'DRAFT',
  SENT = 'SENT',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
}

@Schema({ timestamps: true, toJSON: { virtuals: true } })
export class UnitHandoff {
  @Prop({ type: Types.ObjectId, ref: 'KpiPeriod', index: true })
  periodId?: Types.ObjectId;

  @Prop({
    required: true,
    type: Types.ObjectId,
    ref: 'Department',
    index: true,
  })
  sourceDepartmentId!: Types.ObjectId;

  @Prop({
    required: true,
    type: Types.ObjectId,
    ref: 'Department',
    index: true,
  })
  targetDepartmentId!: Types.ObjectId;

  @Prop({
    required: true,
    type: Types.ObjectId,
    ref: 'WorkContent',
    index: true,
  })
  contentId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  title!: string;

  @Prop({ trim: true, default: '' })
  description?: string;

  @Prop({ required: true, type: Date })
  dueDate!: Date;

  @Prop({ required: true, trim: true })
  product!: string;

  @Prop({ required: true, min: 0, default: 0 })
  standardScore!: number;

  /** Task Form 1 bên gửi (optional). */
  @Prop({ type: Types.ObjectId, ref: 'TaskAssignment', index: true })
  sourceTaskId?: Types.ObjectId;

  @Prop({
    enum: UnitHandoffStatus,
    default: UnitHandoffStatus.SENT,
    index: true,
  })
  status!: UnitHandoffStatus;

  /** Task Form 1 bên nhận sau khi pick. */
  @Prop({ type: Types.ObjectId, ref: 'TaskAssignment' })
  acceptedTaskId?: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User', index: true })
  createdBy!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  acceptedBy?: Types.ObjectId;

  @Prop({ type: Date })
  acceptedAt?: Date;

  @Prop({ trim: true, default: '' })
  rejectReason?: string;

  @Prop({ trim: true, default: '' })
  note?: string;
}

export const UnitHandoffSchema = SchemaFactory.createForClass(UnitHandoff);
UnitHandoffSchema.index({ sourceDepartmentId: 1, status: 1, createdAt: -1 });
UnitHandoffSchema.index({ targetDepartmentId: 1, status: 1, createdAt: -1 });
