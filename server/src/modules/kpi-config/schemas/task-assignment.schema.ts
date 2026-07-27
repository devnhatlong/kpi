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

export enum TaskOrigin {
  OWN = 'OWN',
  FROM_HANDOFF = 'FROM_HANDOFF',
  FROM_PARENT = 'FROM_PARENT',
  /** Chỉ tiêu từ form KPI cấp tỉnh phát hành. */
  FROM_PROVINCE = 'FROM_PROVINCE',
}

export enum AssignmentTargetType {
  UNASSIGNED = 'UNASSIGNED',
  CHILD_DEPARTMENT = 'CHILD_DEPARTMENT',
  USER = 'USER',
}

@Schema({ timestamps: true, toJSON: { virtuals: true } })
export class TaskAssignment {
  /** Form 1 sheet chứa nhiệm vụ (optional cho task cũ). */
  @Prop({ type: Types.ObjectId, ref: 'UnitKpiSheet', index: true })
  sheetId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Department', index: true })
  ownerDepartmentId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'TaskAssignment', index: true })
  parentTaskId?: Types.ObjectId;

  @Prop({ enum: TaskOrigin, default: TaskOrigin.OWN, index: true })
  origin!: TaskOrigin;

  @Prop({ type: Types.ObjectId, ref: 'UnitHandoff', index: true })
  sourceHandoffId?: Types.ObjectId;

  /** Form mẫu cấp tỉnh (khi origin = FROM_PROVINCE). */
  @Prop({ type: Types.ObjectId, ref: 'KpiMasterForm', index: true })
  sourceMasterFormId?: Types.ObjectId;

  /** Mã chỉ tiêu trên mẫu tỉnh (KPI-01…). */
  @Prop({ trim: true, uppercase: true, index: true })
  indicatorCode?: string;

  @Prop({ min: 0, max: 100 })
  indicatorWeight?: number;

  @Prop({
    enum: AssignmentTargetType,
    default: AssignmentTargetType.UNASSIGNED,
    index: true,
  })
  assignmentTargetType!: AssignmentTargetType;

  /** Đội con được giao (khi assignmentTargetType = CHILD_DEPARTMENT). */
  @Prop({ type: Types.ObjectId, ref: 'Department', index: true })
  targetDepartmentId?: Types.ObjectId;

  /** Optional khi chỉ tiêu FROM_PROVINCE (không gắn catalog). */
  @Prop({
    type: Types.ObjectId,
    ref: 'WorkContent',
    index: true,
  })
  contentId?: Types.ObjectId;

  @Prop({ required: true, trim: true })
  title!: string;

  @Prop({ trim: true, default: '' })
  description?: string;

  /** Người thực hiện — optional đến khi giao USER. */
  @Prop({ type: Types.ObjectId, ref: 'User', index: true })
  assigneeId?: Types.ObjectId;

  @Prop({ type: Date, index: true })
  dueDate?: Date;

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
TaskAssignmentSchema.index({ sheetId: 1, status: 1 });
TaskAssignmentSchema.index({ ownerDepartmentId: 1, status: 1 });
