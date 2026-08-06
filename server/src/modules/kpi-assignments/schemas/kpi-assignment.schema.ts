import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Axis } from '@/modules/kpi-form-config/schemas/axis.schema';
import { WorkContent } from '@/modules/kpi-form-config/schemas/work-content.schema';
import { ScoreGroup } from '@/modules/kpi-form-config/schemas/score-group.schema';
import { User } from '@/modules/users/schemas/user.schema';

export type KpiAssignmentDocument = HydratedDocument<KpiAssignment>;

export const ASSIGNMENT_STATUSES = [
  'ASSIGNED',
  'IN_PROGRESS',
  'SUBMITTED',
  'APPROVED',
  'REJECTED',
] as const;

export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

/** Chưa gửi lên thì còn sửa / thu hồi được. */
export const OPEN_STATUSES: AssignmentStatus[] = [
  'ASSIGNED',
  'IN_PROGRESS',
  'REJECTED',
];

export const HOLDER_TYPES = ['DEPARTMENT', 'USER'] as const;
export type HolderType = (typeof HOLDER_TYPES)[number];

@Schema({ _id: false })
export class AssignmentEvidenceFile {
  @Prop({ required: true, trim: true })
  key!: string;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ required: true, min: 0 })
  size!: number;

  @Prop({ required: true, trim: true })
  mimeType!: string;
}

export const AssignmentEvidenceFileSchema = SchemaFactory.createForClass(
  AssignmentEvidenceFile,
);

/** Một chặng trên đường chuyền tay nhiệm vụ. */
@Schema({ _id: false })
export class AssignmentTrailStep {
  @Prop({ type: String, enum: HOLDER_TYPES, required: true })
  toType!: HolderType;

  @Prop({ type: Types.ObjectId, ref: 'Department', default: null })
  toDepartmentId!: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: User.name, default: null })
  toUserId!: Types.ObjectId | null;

  /** Người bấm giao. */
  @Prop({ type: Types.ObjectId, ref: User.name, required: true })
  byUserId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Department', default: null })
  byDepartmentId!: Types.ObjectId | null;

  @Prop({ trim: true, default: '' })
  note!: string;

  @Prop({ type: Date, default: Date.now })
  at!: Date;
}

export const AssignmentTrailStepSchema =
  SchemaFactory.createForClass(AssignmentTrailStep);

/**
 * Nhiệm vụ KPI giao từ trên xuống.
 * Một bản ghi = một nhiệm vụ của một nơi nhận. Giao tiếp xuống chỉ đổi nơi
 * đang giữ và ghi thêm một chặng vào trail - không sinh nhiệm vụ con.
 */
@Schema({ timestamps: true, collection: 'kpi_assignments' })
export class KpiAssignment {
  @Prop({ type: Types.ObjectId, ref: Axis.name, required: true, index: true })
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
  product!: string;

  /** Mức điểm của nhiệm vụ - chọn theo danh mục Nhóm điểm, không gõ số. */
  @Prop({
    type: Types.ObjectId,
    ref: ScoreGroup.name,
    required: true,
    index: true,
  })
  scoreGroupId!: Types.ObjectId;

  /** YYYY-MM-DD */
  @Prop({ trim: true, default: '' })
  deadline!: string;

  @Prop({ trim: true, default: '' })
  note!: string;

  /** Người và đơn vị ban hành gốc. */
  @Prop({ type: Types.ObjectId, ref: User.name, required: true, index: true })
  issuerId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Department', default: null, index: true })
  issuerDepartmentId!: Types.ObjectId | null;

  /** Gom các bản ghi tạo cùng một lần giao. */
  @Prop({ required: true, trim: true, index: true })
  batchId!: string;

  /**
   * Chốt theo cấu hình phạm vi của người giao tại thời điểm giao.
   * Tắt = kết quả gửi lên tự hoàn thành, không chờ duyệt.
   */
  @Prop({ default: true })
  requireApproval!: boolean;

  /**
   * Ai giao cho nơi đang giữ hiện tại.
   * Denormalize từ chặng cuối của trail để truy vấn "việc tôi đã giao" và
   * xác định ai có quyền duyệt mà không phải bới mảng trail.
   */
  @Prop({ type: Types.ObjectId, ref: User.name, required: true, index: true })
  lastAssignedById!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Department', default: null, index: true })
  lastAssignedByDepartmentId!: Types.ObjectId | null;

  /** Nơi đang giữ nhiệm vụ. */
  @Prop({ type: String, enum: HOLDER_TYPES, required: true, index: true })
  holderType!: HolderType;

  @Prop({ type: Types.ObjectId, ref: 'Department', default: null, index: true })
  holderDepartmentId!: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: User.name, default: null, index: true })
  holderUserId!: Types.ObjectId | null;

  @Prop({
    type: String,
    enum: ASSIGNMENT_STATUSES,
    default: 'ASSIGNED',
    index: true,
  })
  status!: AssignmentStatus;

  @Prop({ type: Number, default: null })
  progressPercent!: number | null;

  @Prop({ type: Number, default: null })
  qualityPercent!: number | null;

  @Prop({ type: Number, default: null })
  selfScore!: number | null;

  @Prop({ trim: true, default: '' })
  resultNote!: string;

  @Prop({ type: [AssignmentEvidenceFileSchema], default: [] })
  evidenceFiles!: AssignmentEvidenceFile[];

  @Prop({ type: Date, default: null })
  submittedAt!: Date | null;

  @Prop({ type: Types.ObjectId, ref: User.name, default: null })
  approvedById!: Types.ObjectId | null;

  @Prop({ type: Date, default: null })
  approvedAt!: Date | null;

  @Prop({ type: Number, default: null })
  approvedScore!: number | null;

  @Prop({ trim: true, default: '' })
  rejectReason!: string;

  @Prop({ type: [AssignmentTrailStepSchema], default: [] })
  trail!: AssignmentTrailStep[];

  createdAt?: Date;
  updatedAt?: Date;
}

export const KpiAssignmentSchema =
  SchemaFactory.createForClass(KpiAssignment);

KpiAssignmentSchema.index({ holderDepartmentId: 1, status: 1, createdAt: -1 });
KpiAssignmentSchema.index({ holderUserId: 1, status: 1, createdAt: -1 });
KpiAssignmentSchema.index({ issuerId: 1, createdAt: -1 });
KpiAssignmentSchema.index({ batchId: 1, createdAt: -1 });
