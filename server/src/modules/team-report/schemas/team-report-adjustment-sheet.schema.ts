import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

import { Department } from '@/modules/departments/schemas/department.schema';
import { User } from '@/modules/users/schemas/user.schema';
import {
  ADJUSTMENT_SECTIONS,
  type AdjustmentSection,
} from '@/modules/mission-form-config/schemas/adjustment-item.schema';
import {
  TEAM_REPORT_DAY_STATUSES,
  type TeamReportDayStatus,
} from './team-report-day.schema';
import {
  TeamReportEdit,
  TeamReportEditSchema,
} from './team-report-task.schema';

export type TeamReportAdjustmentSheetDocument = TeamReportAdjustmentSheet &
  Document;

/**
 * Một dòng đơn vị điền ở NỬA PHẢI của bảng - "Nội dung theo dõi, thẩm định".
 *
 * Một nội dung soi chiếu (dòng danh mục) có thể có NHIỀU dòng kết quả: mẫu giấy
 * ghi "Ví dụ 1", "Ví dụ 2", "…" dưới cùng một mục. Mỗi dòng ở đây là một kết
 * quả / một tồn tại / một tình tiết cụ thể, kèm điểm đề xuất riêng.
 *
 * Tên, mã và trần điểm của mục CHÉP LẠI lúc ghi: quản trị sửa danh mục cho
 * tháng sau thì bảng tháng trước vẫn giữ đúng chữ và đúng trần lúc chấm.
 */
@Schema({ _id: true })
export class TeamReportAdjustmentEntry {
  _id!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  itemId!: Types.ObjectId;

  @Prop({ type: String, enum: ADJUSTMENT_SECTIONS, required: true })
  section!: AdjustmentSection;

  @Prop({ trim: true, default: '' })
  itemCode!: string;

  @Prop({ trim: true, default: '' })
  itemName!: string;

  /** Trần của mục (chỉ Điểm cộng) - để kiểm tổng các dòng cùng mục. */
  @Prop({ type: Number, default: null })
  itemMaxScore!: number | null;

  /**
   * Các ô đội điền, theo KHOÁ CỘT của mẫu `forAdjustment` của phần đó - y như
   * nhiệm vụ lưu `fieldValues`. Cột nào có, tên gì, kiểu gì là do quản trị
   * dựng ở Mẫu báo cáo nhiệm vụ; ở đây không có trường cứng nào.
   */
  @Prop({ type: Object, default: {} })
  fieldValues!: Record<string, string | number>;
}

export const TeamReportAdjustmentEntrySchema = SchemaFactory.createForClass(
  TeamReportAdjustmentEntry,
);

/**
 * "Bảng đề xuất điểm cộng, điểm trừ và điều chỉnh, khống chế mức xếp loại" của
 * MỘT ĐỘI cho MỘT THÁNG - phụ lục đi kèm báo cáo tháng.
 *
 * Cùng nhịp với bảng A (tiêu chí chung): tháng một bản, nhập lúc nào cũng
 * được, chỉ cần đứng đúng tháng. Khoá duy nhất `departmentId + periodMonth`.
 *
 * Khác bảng A ở chỗ dòng không cố định theo danh mục: danh mục chỉ là nửa trái
 * để soi chiếu, đơn vị tự thêm bao nhiêu dòng kết quả dưới mỗi mục cũng được -
 * nên lưu `entries` phẳng, mỗi dòng trỏ về mục của nó.
 */
@Schema({ timestamps: true, collection: 'team_report_adjustment_sheets' })
export class TeamReportAdjustmentSheet {
  @Prop({
    type: Types.ObjectId,
    ref: Department.name,
    required: true,
    index: true,
  })
  departmentId!: Types.ObjectId;

  /** Tháng áp dụng, YYYY-MM theo giờ server. */
  @Prop({ required: true, trim: true, index: true })
  periodMonth!: string;

  @Prop({ type: [TeamReportAdjustmentEntrySchema], default: [] })
  entries!: TeamReportAdjustmentEntry[];

  /*
    Mẫu của từng phần, chốt lúc lập bảng - quản trị sửa mẫu về sau không làm
    méo bảng đã nhập. Khoá theo phần (BONUS / PENALTY / RANKING).
  */
  @Prop({ type: Object, default: {} })
  templates!: Partial<
    Record<
      AdjustmentSection,
      {
        formTemplateId: Types.ObjectId | null;
        formTemplateVersion: number | null;
      }
    >
  >;

  // ---------------------------------------------------- vòng đời gửi / duyệt

  /*
    Cùng vòng đời với báo cáo tổng hợp: DRAFT (đội đang nhập) → PENDING (đã
    trình, cấp trên cầm) → APPROVED / RETURNED. Trình tới một người cấp trên
    do đội chọn, như bản tổng hợp.
  */
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

  @Prop({
    type: Types.ObjectId,
    ref: Department.name,
    default: null,
    index: true,
  })
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

  /** Chống đè: cả đội gõ chung một bảng qua một tài khoản. */
  @Prop({ type: Number, default: 0 })
  version!: number;

  @Prop({ type: [TeamReportEditSchema], default: [] })
  edits!: TeamReportEdit[];

  createdAt?: Date;
  updatedAt?: Date;
}

export const TeamReportAdjustmentSheetSchema = SchemaFactory.createForClass(
  TeamReportAdjustmentSheet,
);

TeamReportAdjustmentSheetSchema.index(
  { departmentId: 1, periodMonth: 1 },
  { unique: true },
);

/** Hộp đến của cấp trên: bản trình tới đơn vị mình, mới nhất trước. */
TeamReportAdjustmentSheetSchema.index({
  recipientDepartmentId: 1,
  status: 1,
  periodMonth: -1,
});
