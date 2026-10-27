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
  TeamReportStageReturn,
  TeamReportStageReturnSchema,
  TeamReportParticipant,
  TeamReportParticipantSchema,
} from './team-report-summary.schema';

export type TeamReportCommendationDocument = TeamReportCommendation & Document;

/**
 * Một dòng của bảng biểu dương HOẶC phê bình.
 *
 * Đơn vị chọn từ danh mục (nhiều đơn vị một dòng - "Công an các xã A, B, C"),
 * chép kèm tên lúc lưu: đơn vị đổi tên về sau thì bản đã gửi vẫn giữ chữ cũ.
 * Lưu id để các đội PV01 tra được "đơn vị X tháng này có bị phê bình không"
 * khi thẩm định.
 */
@Schema({ _id: true })
export class TeamReportCommendationRow {
  _id!: Types.ObjectId;

  /**
   * Chỉ dòng BIỂU DƯƠNG: "Nhóm nội dung đề xuất biểu dương" - đúng các mục
   * Điểm cộng (I) của danh mục cộng / trừ. Dòng phê bình để null.
   */
  @Prop({ type: Types.ObjectId, default: null })
  itemId!: Types.ObjectId | null;

  @Prop({ trim: true, default: '' })
  itemName!: string;

  @Prop({ type: [Types.ObjectId], ref: Department.name, default: [] })
  departmentIds!: Types.ObjectId[];

  @Prop({ type: [String], default: [] })
  departmentNames!: string[];

  /**
   * "Không có đơn vị" - chọn tường minh khi dòng không nêu đơn vị nào (VD
   * nhóm này tháng này không có). Chỉ true khi `departmentIds` rỗng.
   */
  @Prop({ type: Boolean, default: false })
  noUnit!: boolean;

  /** Biểu dương: nội dung, kết quả nổi bật. Phê bình: nội dung tồn tại, hạn chế. */
  @Prop({ trim: true, default: '' })
  content!: string;

  /** Căn cứ, tài liệu kiểm chứng. */
  @Prop({ trim: true, default: '' })
  evidence!: string;

  @Prop({ trim: true, default: '' })
  note!: string;

  /**
   * Dòng phòng LẤY TỪ bảng của một đội trong phòng (đã duyệt) - id dòng gốc
   * và tên đội, để không lấy trùng và để biết dòng nào do đội nào đề xuất.
   * null = phòng tự nhập.
   */
  @Prop({ type: Types.ObjectId, default: null })
  sourceRowId!: Types.ObjectId | null;

  @Prop({ trim: true, default: '' })
  sourceName!: string;
}

const RowSchema = SchemaFactory.createForClass(TeamReportCommendationRow);

/**
 * "Bảng tổng hợp nội dung biểu dương, phê bình, chấn chỉnh Công an các đơn vị,
 * địa phương" của MỘT ĐƠN VỊ (phòng hoặc đội thuộc phòng) cho MỘT THÁNG.
 *
 * Hai tầng, theo luồng COMMENDATION:
 * - ĐỘI thuộc phòng (vai MANAGER ở cấp đội - tổ của xã không có) lập, gửi
 *   trưởng phòng trực thuộc duyệt / trả lại.
 * - TRƯỞNG PHÒNG (vai UNIT_ADMIN ở cấp phòng - cấp xã không có) lấy dòng từ
 *   bảng các đội đã duyệt + tự nhập, gửi các đội Phòng Tham mưu: một đội chủ
 *   trì duyệt / trả lại, các đội còn lại nhận để biết.
 */
@Schema({ timestamps: true, collection: 'team_report_commendations' })
export class TeamReportCommendation {
  /** Phòng lập bảng. */
  @Prop({ type: Types.ObjectId, ref: Department.name, required: true })
  departmentId!: Types.ObjectId;

  /** YYYY-MM theo giờ server. */
  @Prop({ required: true, trim: true })
  periodMonth!: string;

  /** 1. Bảng nội dung biểu dương. */
  @Prop({ type: [RowSchema], default: [] })
  praises!: TeamReportCommendationRow[];

  /** 2. Bảng nội dung phê bình, chấn chỉnh. */
  @Prop({ type: [RowSchema], default: [] })
  criticisms!: TeamReportCommendationRow[];

  /**
   * "Tháng này không có đề xuất" - chọn tường minh để gửi bảng rỗng (trước
   * đây phải nhập dòng giả "không có", lọt sang phần soi chiếu khi thẩm
   * định). Chỉ true khi cả hai bảng rỗng.
   */
  @Prop({ type: Boolean, default: false })
  noProposal!: boolean;

  // ------------------------------------------------- vòng đời gửi / duyệt
  @Prop({
    type: String,
    enum: TEAM_REPORT_DAY_STATUSES,
    default: 'DRAFT',
    index: true,
  })
  status!: TeamReportDayStatus;

  @Prop({ type: String, enum: ['FIRST', 'FINAL'], default: 'FIRST' })
  stage!: 'FIRST' | 'FINAL';

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

  @Prop({ type: TeamReportFirstApprovalSchema, default: null })
  firstApproval!: TeamReportFirstApproval | null;

  /** Duyệt cuối trả về cấp 1 - xem TeamReportStageReturn. */
  @Prop({ type: TeamReportStageReturnSchema, default: null })
  returnedToFirst!: TeamReportStageReturn | null;

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

export const TeamReportCommendationSchema = SchemaFactory.createForClass(
  TeamReportCommendation,
);

TeamReportCommendationSchema.index(
  { departmentId: 1, periodMonth: 1 },
  { unique: true },
);
TeamReportCommendationSchema.index({ 'participants.userId': 1 });
// Đội PV01 tra "đơn vị X có bị phê bình / được biểu dương tháng này không".
TeamReportCommendationSchema.index({ 'criticisms.departmentIds': 1 });
TeamReportCommendationSchema.index({ 'praises.departmentIds': 1 });
