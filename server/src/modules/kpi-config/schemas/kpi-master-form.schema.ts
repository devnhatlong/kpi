import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type KpiMasterFormDocument = HydratedDocument<KpiMasterForm>;

export enum KpiMasterFormStatus {
  DRAFT = 'DRAFT',
  READY = 'READY',
  PUBLISHED = 'PUBLISHED',
  LOCKED = 'LOCKED',
  CLOSED = 'CLOSED',
  CANCELLED = 'CANCELLED',
}

export enum KpiMasterFormScope {
  /** Toàn Công an tỉnh (mọi phòng dưới CAT). */
  PROVINCE = 'PROVINCE',
  /** Tất cả đơn vị cấp phòng đang active. */
  ALL_PHONG = 'ALL_PHONG',
  /** Danh sách phòng được chọn. */
  SELECTED_DEPTS = 'SELECTED_DEPTS',
}

@Schema({ _id: false })
export class KpiIndicator {
  @Prop({ required: true, trim: true, uppercase: true })
  code!: string;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ trim: true, default: '' })
  description?: string;

  /** Trọng số % (tổng nên = 100). */
  @Prop({ required: true, min: 0, max: 100 })
  weight!: number;

  @Prop({ trim: true, default: '' })
  criteria?: string;

  @Prop({ trim: true, default: '' })
  unit?: string;

  @Prop({ trim: true, default: '' })
  evidenceRequired?: string;

  @Prop({ trim: true, default: '' })
  scoringMethod?: string;

  @Prop({ type: Date })
  dueDate?: Date;

  @Prop({ default: 0 })
  sortOrder!: number;
}

export const KpiIndicatorSchema = SchemaFactory.createForClass(KpiIndicator);

@Schema({ timestamps: true, toJSON: { virtuals: true } })
export class KpiMasterForm {
  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ required: true, unique: true, trim: true, uppercase: true })
  code!: string;

  @Prop({ trim: true, default: '' })
  description?: string;

  /** Loại form (nhãn nghiệp vụ). */
  @Prop({ trim: true, default: 'KPI' })
  formType!: string;

  @Prop({
    required: true,
    type: Types.ObjectId,
    ref: 'KpiPeriod',
    index: true,
  })
  periodId!: Types.ObjectId;

  /** Layout cột/header Form 1. */
  @Prop({
    required: true,
    type: Types.ObjectId,
    ref: 'KpiTemplate',
    index: true,
  })
  templateId!: Types.ObjectId;

  /** CAT gốc khi scope = PROVINCE (optional nếu ALL_PHONG). */
  @Prop({ type: Types.ObjectId, ref: 'Department', index: true })
  provinceDepartmentId?: Types.ObjectId;

  @Prop({
    enum: KpiMasterFormScope,
    default: KpiMasterFormScope.ALL_PHONG,
    index: true,
  })
  scopeType!: KpiMasterFormScope;

  /** Phòng được chọn khi scope = SELECTED_DEPTS. */
  @Prop({
    type: [{ type: Types.ObjectId, ref: 'Department' }],
    default: [],
  })
  targetDepartmentIds!: Types.ObjectId[];

  @Prop({ type: [KpiIndicatorSchema], default: [] })
  indicators!: KpiIndicator[];

  @Prop({
    enum: KpiMasterFormStatus,
    default: KpiMasterFormStatus.DRAFT,
    index: true,
  })
  status!: KpiMasterFormStatus;

  @Prop({ type: Date })
  publishedAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  publishedBy?: Types.ObjectId;

  @Prop({ default: 1, min: 1 })
  version!: number;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  createdBy!: Types.ObjectId;
}

export const KpiMasterFormSchema = SchemaFactory.createForClass(KpiMasterForm);
KpiMasterFormSchema.index({ status: 1, periodId: 1, updatedAt: -1 });
