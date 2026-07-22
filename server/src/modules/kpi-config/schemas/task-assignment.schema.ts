import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type TaskAssignmentDocument = HydratedDocument<TaskAssignment>;

export enum TaskStatus {
  ASSIGNED = 'ASSIGNED',
  IN_PROGRESS = 'IN_PROGRESS',
  SUBMITTED = 'SUBMITTED',
  APPRAISED = 'APPRAISED',
  CANCELLED = 'CANCELLED',
}

@Schema({ timestamps: true, toJSON: { virtuals: true } })
export class TaskAssignment {
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

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  assigneeId!: Types.ObjectId;

  @Prop({ required: true, type: Date, index: true })
  dueDate!: Date;

  @Prop({ type: Date })
  reportDueDate?: Date;

  @Prop({ required: true, trim: true })
  product!: string;

  @Prop({ trim: true, default: '' })
  actualProduct?: string;

  @Prop({ required: true, min: 0, default: 0 })
  standardScore!: number;

  @Prop({ enum: TaskStatus, default: TaskStatus.ASSIGNED, index: true })
  status!: TaskStatus;

  @Prop({ min: 0, max: 100 })
  selfProgressPercent?: number;

  @Prop({ min: 0 })
  selfProgressScore?: number;

  @Prop({ min: 0, max: 100 })
  selfQualityPercent?: number;

  @Prop({ min: 0 })
  selfQualityScore?: number;

  @Prop({ default: 0 })
  proposedAdjustment?: number;

  @Prop({ trim: true, default: '' })
  proposedAdjustmentReason?: string;

  @Prop({ min: 0, max: 100 })
  appraisalProgressPercent?: number;

  @Prop({ min: 0 })
  appraisalProgressScore?: number;

  @Prop({ min: 0, max: 100 })
  appraisalQualityPercent?: number;

  @Prop({ min: 0 })
  appraisalQualityScore?: number;

  @Prop({ trim: true, default: '' })
  note?: string;

  @Prop({ type: Object, default: {} })
  fieldValues!: Record<string, string | number>;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User', index: true })
  createdBy!: Types.ObjectId;
}

export const TaskAssignmentSchema =
  SchemaFactory.createForClass(TaskAssignment);
TaskAssignmentSchema.index({ contentId: 1, dueDate: 1 });
TaskAssignmentSchema.index({ assigneeId: 1, status: 1 });
