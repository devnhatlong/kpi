import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Axis } from '@/modules/kpi-form-config/schemas/axis.schema';
import { WorkContent } from '@/modules/kpi-form-config/schemas/work-content.schema';
import { User } from '@/modules/users/schemas/user.schema';

export type PersonalKpiItemDocument = HydratedDocument<PersonalKpiItem>;

export const PERSONAL_KPI_STATUSES = [
  'DRAFT',
  'SENT',
  'REJECTED',
  'COMPLETED',
] as const;

export type PersonalKpiStatus = (typeof PERSONAL_KPI_STATUSES)[number];

@Schema({ _id: false })
export class PersonalKpiEvidenceFile {
  @Prop({ required: true, trim: true })
  key!: string;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ required: true, min: 0 })
  size!: number;

  @Prop({ required: true, trim: true })
  mimeType!: string;
}

export const PersonalKpiEvidenceFileSchema = SchemaFactory.createForClass(
  PersonalKpiEvidenceFile,
);

/** Nhiệm vụ KPI cá nhân (một dòng trên danh sách / form nháp). */
@Schema({ timestamps: true, collection: 'personal_kpi_items' })
export class PersonalKpiItem {
  @Prop({
    type: Types.ObjectId,
    ref: User.name,
    required: true,
    index: true,
  })
  ownerId!: Types.ObjectId;

  /**
   * Ngày báo cáo (YYYY-MM-DD) theo giờ Việt Nam trên server.
   * Nhiều nhiệm vụ cùng ngày gom thành 1 báo cáo trên danh sách.
   */
  @Prop({ trim: true, index: true })
  reportDate?: string;

  @Prop({
    type: String,
    enum: PERSONAL_KPI_STATUSES,
    default: 'DRAFT',
    index: true,
  })
  status!: PersonalKpiStatus;

  @Prop({
    type: Types.ObjectId,
    ref: Axis.name,
    required: true,
    index: true,
  })
  axisId!: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: WorkContent.name,
    required: true,
    index: true,
  })
  workContentId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  title!: string;

  @Prop({ trim: true, default: '' })
  deadline!: string;

  @Prop({ trim: true, default: '' })
  product!: string;

  @Prop({ default: 0, min: 0 })
  standardScore!: number;

  @Prop({ trim: true, default: '' })
  executingUnit!: string;

  @Prop({ type: Number, default: null })
  progressPercent!: number | null;

  @Prop({ type: Number, default: null })
  progressSelfScore!: number | null;

  @Prop({ type: Number, default: null })
  qualityPercent!: number | null;

  @Prop({ type: Number, default: null })
  qualitySelfScore!: number | null;

  @Prop({ trim: true, default: '' })
  note!: string;

  @Prop({ type: [PersonalKpiEvidenceFileSchema], default: [] })
  evidenceFiles!: PersonalKpiEvidenceFile[];

  @Prop({ type: Date, default: null })
  sentAt!: Date | null;

  /** Người nhận (cá nhân) khi gửi */
  @Prop({ type: Types.ObjectId, ref: User.name, default: null, index: true })
  recipientId!: Types.ObjectId | null;

  /** Đơn vị nhận (cấp trên 1 bậc) khi gửi */
  @Prop({
    type: Types.ObjectId,
    ref: 'Department',
    default: null,
    index: true,
  })
  recipientDepartmentId!: Types.ObjectId | null;

  @Prop({ trim: true, default: '' })
  recipientName!: string;

  @Prop({ trim: true, default: '' })
  sendNote!: string;

  @Prop({ trim: true, default: '' })
  rejectReason!: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const PersonalKpiItemSchema =
  SchemaFactory.createForClass(PersonalKpiItem);

PersonalKpiItemSchema.index({ ownerId: 1, reportDate: -1 });
PersonalKpiItemSchema.index({ ownerId: 1, status: 1, reportDate: -1 });
PersonalKpiItemSchema.index({ ownerId: 1, createdAt: -1 });
