import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Axis } from '@/modules/kpi-form-config/schemas/axis.schema';
import { FormTemplate } from '@/modules/kpi-form-config/schemas/form-template.schema';
import { WorkContent } from '@/modules/kpi-form-config/schemas/work-content.schema';
import { User } from '@/modules/users/schemas/user.schema';

export type PersonalKpiItemDocument = HydratedDocument<PersonalKpiItem>;

/**
 * Trạng thái duyệt TẠI CẤP ĐANG GIỮ nhiệm vụ.
 * - DRAFT    : còn ở chỗ cán bộ, chưa gửi
 * - PENDING  : đang chờ người nhận hiện tại duyệt
 * - APPROVED : cấp đang giữ đã duyệt, có thể gửi tiếp lên trên
 * - RETURNED : bị trả lại, nằm ở chỗ người gửi lượt đó để sửa
 * - COMPLETED: chốt xong, không gửi lên nữa - điểm dừng của chuỗi
 */
export const PERSONAL_KPI_REVIEW_STATUSES = [
  'DRAFT',
  'PENDING',
  'APPROVED',
  'RETURNED',
  'COMPLETED',
] as const;

export type PersonalKpiReviewStatus =
  (typeof PERSONAL_KPI_REVIEW_STATUSES)[number];

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

/** Một trường bị cấp trên sửa - giữ cả giá trị trước và sau. */
@Schema({ _id: false })
export class PersonalKpiFieldChange {
  @Prop({ required: true, trim: true })
  field!: string;

  @Prop({ trim: true, default: '' })
  label!: string;

  @Prop({ type: Object, default: null })
  from!: unknown;

  @Prop({ type: Object, default: null })
  to!: unknown;
}

export const PersonalKpiFieldChangeSchema = SchemaFactory.createForClass(
  PersonalKpiFieldChange,
);

/**
 * Một lần cấp trên sửa nội dung nhiệm vụ trước khi gửi lên.
 * Cán bộ khai gì vẫn tra ngược được từ `from` của lần sửa đầu tiên.
 */
@Schema({ _id: false })
export class PersonalKpiEdit {
  @Prop({ type: Types.ObjectId, ref: User.name, required: true })
  byId!: Types.ObjectId;

  @Prop({ trim: true, default: '' })
  byName!: string;

  @Prop({ type: Types.ObjectId, ref: 'Department', default: null })
  byDepartmentId!: Types.ObjectId | null;

  /** Nhiệm vụ đang ở cấp mấy khi bị sửa. */
  @Prop({ default: 0, min: 0 })
  level!: number;

  @Prop({ type: [PersonalKpiFieldChangeSchema], default: [] })
  changes!: PersonalKpiFieldChange[];

  @Prop({ trim: true, default: '' })
  reason!: string;

  @Prop({ type: Date, default: Date.now })
  at!: Date;
}

export const PersonalKpiEditSchema =
  SchemaFactory.createForClass(PersonalKpiEdit);

/** Nhiệm vụ KPI cá nhân - một dòng trong báo cáo ngày. */
@Schema({ timestamps: true, collection: 'personal_kpi_items' })
export class PersonalKpiItem {
  @Prop({
    type: Types.ObjectId,
    ref: User.name,
    required: true,
    index: true,
  })
  ownerId!: Types.ObjectId;

  /** Đơn vị của cán bộ lúc tạo - để cấp trên gom theo đơn vị mà không join. */
  @Prop({ type: Types.ObjectId, ref: 'Department', default: null, index: true })
  ownerDepartmentId!: Types.ObjectId | null;

  /** Ngày báo cáo (YYYY-MM-DD) theo giờ Việt Nam trên server. */
  @Prop({ required: true, trim: true, index: true })
  reportDate!: string;

  // ------------------------------------------------------------- nội dung

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

  /**
   * Cặp kết quả Đạt / Không đạt. Loại trừ nhau - tích cái này thì cái kia tắt.
   * null = chưa đánh giá, để phân biệt với "đã đánh giá là không đạt".
   */
  @Prop({ type: Boolean, default: null })
  resultPassed!: boolean | null;

  @Prop({ type: Boolean, default: null })
  resultFailed!: boolean | null;

  @Prop({ trim: true, default: '' })
  note!: string;

  @Prop({ type: [PersonalKpiEvidenceFileSchema], default: [] })
  evidenceFiles!: PersonalKpiEvidenceFile[];

  /**
   * Giá trị các cột tự do của mẫu bảng, key = FormTemplateColumn.key.
   * Cột có semanticKey vẫn nằm ở các field cứng phía trên.
   */
  @Prop({ type: Object, default: {} })
  fieldValues!: Record<string, string | number>;

  // --------------------------------------------------------- mẫu bảng khoá

  /**
   * Mẫu bảng dùng để dựng dòng này, chốt tại lần gửi đầu tiên.
   * Super admin sửa mẫu về sau không làm méo báo cáo đã gửi.
   */
  @Prop({
    type: Types.ObjectId,
    ref: FormTemplate.name,
    default: null,
    index: true,
  })
  formTemplateId!: Types.ObjectId | null;

  @Prop({ type: Number, default: null })
  formTemplateVersion!: number | null;

  // ------------------------------------------------- vị trí trong chuỗi gửi

  /** 0 = còn ở cán bộ, 1 = đang ở cấp thứ nhất, 2 = cấp thứ hai... */
  @Prop({ default: 0, min: 0, index: true })
  holderLevel!: number;

  @Prop({
    type: String,
    enum: PERSONAL_KPI_REVIEW_STATUSES,
    default: 'DRAFT',
    index: true,
  })
  reviewStatus!: PersonalKpiReviewStatus;

  /** Người đang phải duyệt. Null khi nhiệm vụ còn ở chỗ cán bộ. */
  @Prop({ type: Types.ObjectId, ref: User.name, default: null, index: true })
  currentRecipientId!: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'Department', default: null })
  currentRecipientDepartmentId!: Types.ObjectId | null;

  @Prop({
    type: Types.ObjectId,
    ref: 'PersonalKpiSubmission',
    default: null,
    index: true,
  })
  currentSubmissionId!: Types.ObjectId | null;

  /** Người gửi lượt gần nhất - đổ vào cột "Người gửi" của bảng tổng. */
  @Prop({ type: Types.ObjectId, ref: User.name, default: null, index: true })
  lastSenderId!: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'Department', default: null })
  lastSenderDepartmentId!: Types.ObjectId | null;

  @Prop({ type: Date, default: null })
  lastSentAt!: Date | null;

  // ------------------------------------------------------- kết quả duyệt

  @Prop({ type: Types.ObjectId, ref: User.name, default: null })
  lastDecidedById!: Types.ObjectId | null;

  @Prop({ type: Date, default: null })
  lastDecidedAt!: Date | null;

  @Prop({ trim: true, default: '' })
  returnReason!: string;

  /** Lịch sử cấp trên sửa nội dung. Rỗng nghĩa là còn nguyên lời cán bộ khai. */
  @Prop({ type: [PersonalKpiEditSchema], default: [] })
  edits!: PersonalKpiEdit[];

  createdAt?: Date;
  updatedAt?: Date;
}

export const PersonalKpiItemSchema =
  SchemaFactory.createForClass(PersonalKpiItem);

/** Danh sách của cán bộ: nhiệm vụ của tôi theo ngày. */
PersonalKpiItemSchema.index({ ownerId: 1, reportDate: -1 });
PersonalKpiItemSchema.index({ ownerId: 1, reviewStatus: 1, reportDate: -1 });

/** Bảng tổng của cấp trên: việc đang nằm ở tay tôi, gom theo trục. */
PersonalKpiItemSchema.index({
  currentRecipientId: 1,
  reviewStatus: 1,
  reportDate: -1,
});
PersonalKpiItemSchema.index({
  currentRecipientId: 1,
  reportDate: -1,
  axisId: 1,
  workContentId: 1,
});
