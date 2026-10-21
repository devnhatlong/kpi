import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

import { Department } from '@/modules/departments/schemas/department.schema';
import { User } from '@/modules/users/schemas/user.schema';
import {
  TEAM_REPORT_DAY_STATUSES,
  TeamReportDayRow,
  TeamReportDayRowSchema,
  type TeamReportDayStatus,
} from './team-report-day.schema';
import {
  TeamReportEditSchema,
  TeamReportEdit,
} from './team-report-task.schema';

export type TeamReportSummaryDocument = TeamReportSummary & Document;

/**
 * Một đơn vị PHỐI HỢP hoặc NHẬN ĐỂ BIẾT bản tổng hợp - chụp từ bảng đơn vị của
 * luồng ngay lúc trình, để đổi cấu hình luồng về sau không đổi ngược vai của
 * những bản đã đi.
 *
 * Đơn vị chủ trì KHÔNG nằm ở đây mà ở `recipientDepartmentId` - giữ đúng một
 * chỗ cho "nơi được quyết", mọi đường duyệt / chấm lại sẵn có đọc chỗ đó.
 *
 * - COORDINATE: xem, gửi một ý kiến cho chủ trì (sửa được, khi còn chờ duyệt).
 * - INFORM: chỉ xem.
 *
 * Hộp đến lọc theo ĐƠN VỊ: ai trong đơn vị đó cũng mở được.
 */
@Schema({ _id: false })
export class TeamReportParticipant {
  @Prop({ type: Types.ObjectId, ref: Department.name, required: true })
  departmentId!: Types.ObjectId;

  @Prop({ trim: true, default: '' })
  departmentName!: string;

  /** Tài khoản quản trị gán trong luồng - để biết đích danh nơi nhận. */
  @Prop({ type: Types.ObjectId, ref: User.name, default: null })
  userId!: Types.ObjectId | null;

  @Prop({ trim: true, default: '' })
  userName!: string;

  @Prop({ type: String, enum: ['COORDINATE', 'INFORM'], required: true })
  role!: 'COORDINATE' | 'INFORM';

  /** Lần đầu có người ở đơn vị này mở bản ra - để đội gửi biết đã xem. */
  @Prop({ type: Date, default: null })
  seenAt!: Date | null;

  @Prop({ trim: true, default: '' })
  comment!: string;

  @Prop({ trim: true, default: '' })
  commentedByName!: string;

  @Prop({ type: Date, default: null })
  commentedAt!: Date | null;
}

export const TeamReportParticipantSchema = SchemaFactory.createForClass(
  TeamReportParticipant,
);

/** Dấu vết lần duyệt cấp 1 của bản duyệt 2 cấp. */
@Schema({ _id: false })
export class TeamReportFirstApproval {
  @Prop({ type: Types.ObjectId, ref: User.name, required: true })
  byId!: Types.ObjectId;

  @Prop({ trim: true, default: '' })
  byName!: string;

  @Prop({ type: Date, required: true })
  at!: Date;
}

export const TeamReportFirstApprovalSchema = SchemaFactory.createForClass(
  TeamReportFirstApproval,
);

/**
 * Duyệt cuối trả bản về người duyệt cấp 1 (không về đơn vị lập) - lý do để cấp
 * 1 đọc khi bản quay lại hộp chờ duyệt của mình. Dùng chung cho mọi luồng 2
 * cấp; xoá khi cấp 1 duyệt lại hoặc khi đơn vị trình lại.
 */
@Schema({ _id: false })
export class TeamReportStageReturn {
  @Prop({ type: Types.ObjectId, ref: User.name, required: true })
  byId!: Types.ObjectId;

  @Prop({ trim: true, default: '' })
  byName!: string;

  @Prop({ trim: true, default: '' })
  reason!: string;

  @Prop({ type: Date, required: true })
  at!: Date;
}

export const TeamReportStageReturnSchema = SchemaFactory.createForClass(
  TeamReportStageReturn,
);

/** Mức đề nghị xếp loại tháng - đúng bốn mức của phụ lục. */
export const TEAM_REPORT_RATINGS = [
  'Hoàn thành xuất sắc nhiệm vụ',
  'Hoàn thành tốt nhiệm vụ',
  'Hoàn thành nhiệm vụ',
  'Không hoàn thành nhiệm vụ',
] as const;
export type TeamReportRating = (typeof TEAM_REPORT_RATINGS)[number];

/**
 * Phần cuối phụ lục - đơn vị tự khai lúc trình: "Tổng điểm KPI tập thể",
 * "Đề nghị xếp loại tháng", cán bộ tổng hợp (họ tên, số điện thoại) và lãnh đạo
 * đơn vị ký.
 *
 * Tổng điểm = điểm BẢNG A + điểm quy đổi các trục bảng B, do server tính và
 * chốt lúc trình - đơn vị không gõ được. Lưu kèm điểm tối đa để in "x / 100".
 */
@Schema({ _id: false })
export class TeamReportConclusion {
  @Prop({ type: Number, required: true, min: 0 })
  totalScore!: number;

  @Prop({ type: Number, default: 0, min: 0 })
  maxScore!: number;

  @Prop({ type: String, enum: TEAM_REPORT_RATINGS, required: true })
  proposedRating!: TeamReportRating;

  @Prop({ trim: true, required: true })
  compilerName!: string;

  @Prop({ trim: true, required: true })
  compilerPhone!: string;

  @Prop({ trim: true, required: true })
  leaderName!: string;
}

export const TeamReportConclusionSchema =
  SchemaFactory.createForClass(TeamReportConclusion);

/**
 * Bảng A (tiêu chí chung) CHỤP kèm bản tổng hợp lúc trình.
 *
 * Bảng A sống theo tháng ở `team_report_criteria_sheets` và đội sửa được bất
 * cứ lúc nào - giữ tham chiếu thì cấp trên mở bản đã duyệt sẽ thấy số của hôm
 * nay. Lấy tháng MỚI NHẤT ĐÃ CHẤM trong kỳ; kỳ chưa tháng nào chấm thì chụp
 * bảng trống dựng từ danh mục (`saved: false`, 0 điểm) để trần vẫn đủ.
 *
 * Lưu kiểu Object vì bộ cột do mẫu quyết định - không có trường cứng nào.
 */
export type TeamReportSummaryCriteria = {
  periodMonth: string;
  saved: boolean;
  template: {
    _id: string;
    code: string;
    name: string;
    version: number;
    columns: unknown[];
    headerGroups: unknown[];
  } | null;
  rows: {
    criterionId: Types.ObjectId;
    criterionName: string;
    criterionNote: string;
    maxScore: number;
    fieldValues: Record<string, string | number>;
  }[];
  scoreColumnKey: string | null;
  total: number | null;
  max: number;
  scoredRows: number;
};

/**
 * Kỳ của báo cáo - chỉ là NHÃN, phạm vi thật nằm ở `fromDate`/`toDate`.
 *
 * Thêm kỳ mới thì chỉ cần nối vào đây và khai nhãn bên client; server không suy
 * ra ngày từ nhãn, nên không có chỗ nào phải sửa thêm.
 */
export const TEAM_REPORT_PERIODS = [
  'DAY',
  'WEEK',
  'MONTH',
  'QUARTER',
  'YEAR',
  'CUSTOM',
] as const;
export type TeamReportPeriod = (typeof TEAM_REPORT_PERIODS)[number];

/**
 * Báo cáo tổng hợp của đội: chọn tay các nhiệm vụ trong một khoảng ngày rồi
 * trình lên một người cấp trên cụ thể.
 *
 * Khác hẳn `team_report_days` dù cùng chụp lại nhiệm vụ:
 *
 * - Bản ngày là TOÀN BỘ bảng của đúng một ngày, người nhận suy ra từ cây đơn vị,
 *   một đội một ngày một bản (có ràng buộc duy nhất).
 * - Bản tổng hợp là một TẬP CHỌN TAY trải trên nhiều ngày, người gửi tự chọn cấp
 *   trên nhận, và một kỳ lập bao nhiêu bản cũng được - tuần một bản, tháng một
 *   bản, cùng một nhiệm vụ nằm trong cả hai là chuyện bình thường.
 *
 * Hai thứ đó không nhét chung một collection được: ràng buộc duy nhất theo ngày
 * của bản ngày sẽ chặn mất bản tổng hợp thứ hai, còn bỏ ràng buộc đó đi thì bản
 * ngày mất chính thứ đang giữ cho nó không bị gửi trùng.
 */
@Schema({ timestamps: true, collection: 'team_report_summaries' })
export class TeamReportSummary {
  /** Đội lập báo cáo. */
  @Prop({
    type: Types.ObjectId,
    ref: Department.name,
    required: true,
    index: true,
  })
  departmentId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  title!: string;

  @Prop({ type: String, enum: TEAM_REPORT_PERIODS, default: 'CUSTOM' })
  period!: TeamReportPeriod;

  /** Khoảng ngày (YYYY-MM-DD, giờ server), bao gồm cả hai đầu. */
  @Prop({ required: true, trim: true, index: true })
  fromDate!: string;

  @Prop({ required: true, trim: true })
  toDate!: string;

  /*
    Bản CHỤP y như bản ngày: nhiệm vụ còn chạy tiếp sau khi trình, giữ tham chiếu
    thì mở lại báo cáo đã duyệt sẽ ra số của hôm nay chứ không phải số đã trình.
  */
  @Prop({ type: [TeamReportDayRowSchema], default: [] })
  rows!: TeamReportDayRow[];

  @Prop({
    type: String,
    enum: TEAM_REPORT_DAY_STATUSES,
    default: 'DRAFT',
    index: true,
  })
  status!: TeamReportDayStatus;

  // ------------------------------------------------------------ trình lên

  /**
   * Người cấp trên nhận bản này - do người gửi CHỌN, không suy ra từ cây.
   *
   * Bản ngày suy người nhận từ đơn vị cha vì nó là lượt bắt buộc hằng ngày, đi
   * đúng một đường. Bản tổng hợp thì người lập tự quyết trình cho ai, nên phải
   * lưu đích danh.
   *
   * null khi luồng dùng BẢNG ĐƠN VỊ cố định: bản đi tới đơn vị chủ trì, không
   * tới một người cụ thể - khi đó `recipientName` là tên đơn vị chủ trì.
   */
  @Prop({ type: Types.ObjectId, ref: User.name, default: null, index: true })
  recipientId!: Types.ObjectId | null;

  @Prop({ trim: true, default: '' })
  recipientName!: string;

  /** Đơn vị CHỦ TRÌ - nơi duy nhất được chấm lại, duyệt, trả lại. */
  @Prop({ type: Types.ObjectId, ref: Department.name, default: null })
  recipientDepartmentId!: Types.ObjectId | null;

  /** Các đơn vị phối hợp / nhận để biết - xem TeamReportParticipant. */
  @Prop({ type: [TeamReportParticipantSchema], default: [] })
  participants!: TeamReportParticipant[];

  /**
   * DUYỆT 2 CẤP - chỉ có khi luồng đặt "Duyệt cuối".
   *
   * `recipient*` ở trên là CẤP 1 (chủ trì). Cấp 1 duyệt thì bản chưa chốt mà
   * chuyển sang `finalRecipient*` duyệt cuối; trả lại ở cấp nào bản cũng về
   * đơn vị lập. null = luồng một cấp như cũ.
   */
  @Prop({ type: Types.ObjectId, ref: User.name, default: null, index: true })
  finalRecipientId!: Types.ObjectId | null;

  @Prop({ trim: true, default: '' })
  finalRecipientName!: string;

  @Prop({ type: Types.ObjectId, ref: Department.name, default: null })
  finalRecipientDepartmentId!: Types.ObjectId | null;

  /**
   * Bước đang chờ khi PENDING: FIRST = chủ trì cấp 1 đang cầm; FINAL = cấp 1
   * đã duyệt, đang chờ duyệt cuối. Người đang cầm bản suy từ trường này.
   */
  @Prop({ type: String, enum: ['FIRST', 'FINAL'], default: 'FIRST' })
  stage!: 'FIRST' | 'FINAL';

  /** Lần duyệt cấp 1 - giữ lại để bản nào cũng thấy ai đã duyệt trước. */
  @Prop({ type: TeamReportFirstApprovalSchema, default: null })
  firstApproval!: TeamReportFirstApproval | null;

  /** Duyệt cuối trả về cấp 1 - xem TeamReportStageReturn. */
  @Prop({ type: TeamReportStageReturnSchema, default: null })
  returnedToFirst!: TeamReportStageReturn | null;

  @Prop({ type: Types.ObjectId, ref: User.name, default: null })
  sentById!: Types.ObjectId | null;

  @Prop({ trim: true, default: '' })
  sentByName!: string;

  @Prop({ type: Date, default: null })
  sentAt!: Date | null;

  @Prop({ trim: true, default: '' })
  note!: string;

  /** Phần cuối phụ lục - bắt buộc lúc trình; bản nháp chưa có. */
  @Prop({ type: TeamReportConclusionSchema, default: null })
  conclusion!: TeamReportConclusion | null;

  /** Bảng A chụp lúc trình - xem TeamReportSummaryCriteria. Nháp chưa có. */
  @Prop({ type: Object, default: null })
  criteria!: TeamReportSummaryCriteria | null;

  @Prop({ type: Types.ObjectId, ref: User.name, default: null })
  decidedById!: Types.ObjectId | null;

  @Prop({ trim: true, default: '' })
  decidedByName!: string;

  @Prop({ type: Date, default: null })
  decidedAt!: Date | null;

  @Prop({ trim: true, default: '' })
  returnReason!: string;

  @Prop({ type: [TeamReportEditSchema], default: [] })
  edits!: TeamReportEdit[];

  createdAt?: Date;
  updatedAt?: Date;
}

export const TeamReportSummarySchema =
  SchemaFactory.createForClass(TeamReportSummary);

/** Danh sách bản đã lập của đội, mới nhất trước. */
TeamReportSummarySchema.index({ departmentId: 1, createdAt: -1 });

/** Hộp đến của người nhận. */
TeamReportSummarySchema.index({ recipientId: 1, status: 1, createdAt: -1 });

/** Hộp đến "Phối hợp" / "Nhận để biết" - lọc theo đơn vị tham gia. */
TeamReportSummarySchema.index({ 'participants.departmentId': 1, sentAt: -1 });

/** Đánh dấu nhiệm vụ đã nằm trong một bản đã trình - tránh trình trùng. */
TeamReportSummarySchema.index({ departmentId: 1, 'rows.taskId': 1 });
// Tra khoá nhiệm vụ: bản CHỜ DUYỆT nào chứa việc này, của bất kỳ đơn vị nào.
TeamReportSummarySchema.index({ 'rows.taskId': 1, status: 1 });
