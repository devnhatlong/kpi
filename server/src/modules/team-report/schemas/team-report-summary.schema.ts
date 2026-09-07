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
   */
  @Prop({ type: Types.ObjectId, ref: User.name, default: null, index: true })
  recipientId!: Types.ObjectId | null;

  @Prop({ trim: true, default: '' })
  recipientName!: string;

  @Prop({ type: Types.ObjectId, ref: Department.name, default: null })
  recipientDepartmentId!: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: User.name, default: null })
  sentById!: Types.ObjectId | null;

  @Prop({ trim: true, default: '' })
  sentByName!: string;

  @Prop({ type: Date, default: null })
  sentAt!: Date | null;

  @Prop({ trim: true, default: '' })
  note!: string;

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

/** Đánh dấu nhiệm vụ đã nằm trong một bản đã trình - tránh trình trùng. */
TeamReportSummarySchema.index({ departmentId: 1, 'rows.taskId': 1 });
