import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

import { Department } from '@/modules/departments/schemas/department.schema';
import { User } from '@/modules/users/schemas/user.schema';
import {
  TEAM_REPORT_DAY_STATUSES,
  type TeamReportDayStatus,
} from './team-report-day.schema';
import {
  TeamReportFirstApproval,
  TeamReportFirstApprovalSchema,
  TeamReportParticipant,
  TeamReportParticipantSchema,
} from './team-report-summary.schema';

export type TeamReportAppraisalDocument = TeamReportAppraisal & Document;

/**
 * Một dòng "Tiêu chí cộng điểm" của một đơn vị: điểm cộng + minh chứng.
 *
 * Tiêu chí lấy từ danh mục Điểm cộng (I) - chép tên và trần lúc ghi để bản đã
 * trình đọc lại đúng như lúc trình dù danh mục đổi về sau. Một tiêu chí có thể
 * nhiều dòng (mỗi thành tích một dòng); trần áp cho TỔNG các dòng của tiêu chí.
 */
@Schema({ _id: false })
export class TeamReportAppraisalBonus {
  @Prop({ type: Types.ObjectId, default: null })
  itemId!: Types.ObjectId | null;

  @Prop({ trim: true, default: '' })
  itemName!: string;

  @Prop({ type: Number, default: null })
  maxScore!: number | null;

  @Prop({ type: Number, default: null, min: 0 })
  score!: number | null;

  /** "Cụ thể nội dung minh chứng". */
  @Prop({ trim: true, default: '' })
  evidence!: string;
}

const BonusSchema = SchemaFactory.createForClass(TeamReportAppraisalBonus);

/**
 * Một dòng trừ điểm: "Cụ thể nội dung trừ điểm" + "Điểm trừ" (tự nhập).
 *
 * Gắn vào TIÊU CHÍ như phụ lục giấy - cùng một tiêu chí vừa cộng vừa trừ
 * được, hai bên độc lập. Trừ không có trần. itemId null = dòng cũ chưa gắn.
 */
@Schema({ _id: false })
export class TeamReportAppraisalPenalty {
  @Prop({ type: Types.ObjectId, default: null })
  itemId!: Types.ObjectId | null;

  @Prop({ trim: true, default: '' })
  itemName!: string;

  @Prop({ trim: true, default: '' })
  content!: string;

  @Prop({ type: Number, default: null, min: 0 })
  score!: number | null;
}

const PenaltySchema = SchemaFactory.createForClass(TeamReportAppraisalPenalty);

/**
 * Một ĐƠN VỊ được thẩm định - một khối dòng trong phụ lục giấy.
 *
 * Tổng điểm sau thẩm định = tự chấm + tổng cộng − tổng trừ; KHÔNG lưu, tính
 * lại mỗi lần đọc để không bao giờ lệch với các ô thành phần.
 */
@Schema({ _id: true })
export class TeamReportAppraisalUnit {
  _id!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: Department.name, required: true })
  departmentId!: Types.ObjectId;

  @Prop({ trim: true, default: '' })
  departmentName!: string;

  /** "Tổng điểm tự chấm" của đơn vị - đội thẩm định tự nhập. */
  @Prop({ type: Number, default: null, min: 0 })
  selfScore!: number | null;

  @Prop({ type: [BonusSchema], default: [] })
  bonuses!: TeamReportAppraisalBonus[];

  @Prop({ type: [PenaltySchema], default: [] })
  penalties!: TeamReportAppraisalPenalty[];

  /** "* Đề nghị nâng mức xếp loại … do: …" - tuỳ chọn. */
  @Prop({ trim: true, default: '' })
  upgradeNote!: string;

  /** Đề xuất mức xếp loại (một trong bốn mức) - rỗng = chưa chọn. */
  @Prop({ trim: true, default: '' })
  proposedRating!: string;

  /** Lý do / diễn giải mức xếp loại ("Mức điểm cao, tuy nhiên khống chế…"). */
  @Prop({ trim: true, default: '' })
  ratingNote!: string;
}

const UnitSchema = SchemaFactory.createForClass(TeamReportAppraisalUnit);

/**
 * PHỤ LỤC THEO DÕI, THẨM ĐỊNH tháng của một đội PV01: đội đánh giá lại kết
 * quả tự chấm của các đơn vị mình theo dõi (mỗi đơn vị một khối dòng), rồi
 * trình theo luồng APPRAISAL (mặc định về Đội CNTT duyệt).
 *
 * Tháng một bản mỗi đội. Tài khoản DUYỆT của đội lập bản - chính họ duyệt
 * báo cáo của các đơn vị trong khối nên họ là người thẩm định.
 */
@Schema({ timestamps: true, collection: 'team_report_appraisals' })
export class TeamReportAppraisal {
  /** Đội thẩm định. */
  @Prop({ type: Types.ObjectId, ref: Department.name, required: true })
  departmentId!: Types.ObjectId;

  /** YYYY-MM theo giờ server. */
  @Prop({ required: true, trim: true })
  periodMonth!: string;

  @Prop({ type: [UnitSchema], default: [] })
  units!: TeamReportAppraisalUnit[];

  /** Khối ký cuối phụ lục. */
  @Prop({ trim: true, default: '' })
  leaderName!: string;

  @Prop({ trim: true, default: '' })
  commanderName!: string;

  @Prop({
    type: String,
    enum: TEAM_REPORT_DAY_STATUSES,
    default: 'DRAFT',
    index: true,
  })
  status!: TeamReportDayStatus;

  @Prop({ type: Types.ObjectId, ref: User.name, default: null, index: true })
  recipientId!: Types.ObjectId | null;

  @Prop({ trim: true, default: '' })
  recipientName!: string;

  @Prop({ type: Types.ObjectId, ref: Department.name, default: null })
  recipientDepartmentId!: Types.ObjectId | null;

  @Prop({ type: [TeamReportParticipantSchema], default: [] })
  participants!: TeamReportParticipant[];

  @Prop({ type: Types.ObjectId, ref: User.name, default: null, index: true })
  finalRecipientId!: Types.ObjectId | null;

  @Prop({ trim: true, default: '' })
  finalRecipientName!: string;

  @Prop({ type: Types.ObjectId, ref: Department.name, default: null })
  finalRecipientDepartmentId!: Types.ObjectId | null;

  @Prop({ type: String, enum: ['FIRST', 'FINAL'], default: 'FIRST' })
  stage!: 'FIRST' | 'FINAL';

  @Prop({ type: TeamReportFirstApprovalSchema, default: null })
  firstApproval!: TeamReportFirstApproval | null;

  @Prop({ type: Types.ObjectId, ref: User.name, default: null })
  updatedById!: Types.ObjectId | null;

  @Prop({ trim: true, default: '' })
  updatedByName!: string;

  @Prop({ type: Types.ObjectId, ref: User.name, default: null })
  sentById!: Types.ObjectId | null;

  @Prop({ trim: true, default: '' })
  sentByName!: string;

  @Prop({ type: Date, default: null })
  sentAt!: Date | null;

  @Prop({ type: Types.ObjectId, ref: User.name, default: null })
  decidedById!: Types.ObjectId | null;

  @Prop({ trim: true, default: '' })
  decidedByName!: string;

  @Prop({ type: Date, default: null })
  decidedAt!: Date | null;

  @Prop({ trim: true, default: '' })
  returnReason!: string;

  /** Khoá lạc quan - hai người cùng sửa thì người lưu sau phải tải lại. */
  @Prop({ default: 0 })
  version!: number;

  createdAt?: Date;
  updatedAt?: Date;
}

export const TeamReportAppraisalSchema =
  SchemaFactory.createForClass(TeamReportAppraisal);

TeamReportAppraisalSchema.index(
  { departmentId: 1, periodMonth: 1 },
  { unique: true },
);
TeamReportAppraisalSchema.index({ 'participants.userId': 1 });
