import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

import { Department } from '@/modules/departments/schemas/department.schema';
import { User } from '@/modules/users/schemas/user.schema';
import { Axis } from '@/modules/mission-form-config/schemas/axis.schema';
import { FormTemplate } from '@/modules/mission-form-config/schemas/form-template.schema';
import { WorkContent } from '@/modules/mission-form-config/schemas/work-content.schema';
import {
  TeamReportEdit,
  TeamReportEditSchema,
  TeamReportTask,
} from './team-report-task.schema';

export type TeamReportDayDocument = TeamReportDay & Document;

export const TEAM_REPORT_DAY_STATUSES = [
  'DRAFT',
  'PENDING',
  'APPROVED',
  'RETURNED',
] as const;
export type TeamReportDayStatus = (typeof TEAM_REPORT_DAY_STATUSES)[number];

/**
 * Bản CHỤP của một nhiệm vụ tại thời điểm gửi.
 *
 * Chép đủ giá trị chứ không giữ mỗi `taskId`: nhiệm vụ sống qua nhiều ngày và
 * vẫn chạy tiếp sau khi gửi, nên nếu chỉ giữ tham chiếu thì mở lại báo cáo đã
 * duyệt hôm trước sẽ hiện số của hôm nay - cái cấp trên đã duyệt không còn là
 * cái đang lưu.
 *
 * Tên nội dung công việc cũng chép luôn: danh mục đổi tên về sau thì báo cáo cũ
 * phải giữ nguyên chữ lúc trình.
 */
@Schema({ _id: false })
export class TeamReportDayRow {
  @Prop({ type: Types.ObjectId, ref: TeamReportTask.name, required: true })
  taskId!: Types.ObjectId;

  @Prop({ trim: true, default: '' })
  name!: string;

  @Prop({ trim: true, default: '' })
  deadline!: string;

  /** Sản phẩm đội khai ở GĐ1 - chép sang để cấp trên đọc mà không phải tra lại. */
  @Prop({ trim: true, default: '' })
  product!: string;

  @Prop({ type: Types.ObjectId, ref: Axis.name, default: null })
  axisId!: Types.ObjectId | null;

  @Prop({ trim: true, default: '' })
  axisName!: string;

  @Prop({ type: Types.ObjectId, ref: WorkContent.name, default: null })
  workContentId!: Types.ObjectId | null;

  @Prop({ trim: true, default: '' })
  workContentName!: string;

  /*
    Bộ cột lúc gửi. Phải đóng dấu cả id lẫn phiên bản: quản trị sửa mẫu sau
    ngày gửi thì bản đã trình vẫn phải bày đúng bộ cột hôm đó.
  */
  @Prop({ type: Types.ObjectId, ref: FormTemplate.name, default: null })
  formTemplateId!: Types.ObjectId | null;

  @Prop({ type: Number, default: null })
  formTemplateVersion!: number | null;

  /** Giá trị CHỐT theo khoá cột - số cấp trên chỉnh đã ghép đè lên số đội khai. */
  @Prop({ type: Object, default: {} })
  fieldValues!: Record<string, string | number>;

  @Prop({ type: Object, default: {} })
  catalogValues!: Record<string, { id: string; name: string }>;

  @Prop({ type: Number, default: 0 })
  evidenceCount!: number;

  /** Việc này đóng lại ngay trong lượt gửi đó hay không. */
  @Prop({ default: false })
  closed!: boolean;
}

export const TeamReportDayRowSchema =
  SchemaFactory.createForClass(TeamReportDayRow);

/**
 * Báo cáo MỘT NGÀY của MỘT ĐỘI.
 *
 * Gửi lên phòng là khoá bảng của ngày đó lại - không sửa được nữa. Nhiệm vụ bên
 * trong thì vẫn chạy tiếp và xuất hiện lại ở báo cáo ngày hôm sau, chừng nào
 * chưa đóng.
 */
@Schema({ timestamps: true, collection: 'team_report_days' })
export class TeamReportDay {
  @Prop({
    type: Types.ObjectId,
    ref: Department.name,
    required: true,
    index: true,
  })
  departmentId!: Types.ObjectId;

  /** Ngày báo cáo (YYYY-MM-DD) theo giờ server. */
  @Prop({ required: true, trim: true, index: true })
  reportDate!: string;

  @Prop({
    type: String,
    enum: TEAM_REPORT_DAY_STATUSES,
    default: 'PENDING',
    index: true,
  })
  status!: TeamReportDayStatus;

  @Prop({ type: [TeamReportDayRowSchema], default: [] })
  rows!: TeamReportDayRow[];

  // ------------------------------------------------------------ gửi / duyệt

  @Prop({ type: Types.ObjectId, ref: User.name, default: null })
  sentById!: Types.ObjectId | null;

  @Prop({ trim: true, default: '' })
  sentByName!: string;

  @Prop({ type: Date, default: null })
  sentAt!: Date | null;

  @Prop({ trim: true, default: '' })
  note!: string;

  /** Phòng nhận báo cáo này - suy từ đơn vị cha của đội lúc gửi. */
  @Prop({
    type: Types.ObjectId,
    ref: Department.name,
    default: null,
    index: true,
  })
  recipientDepartmentId!: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: User.name, default: null })
  decidedById!: Types.ObjectId | null;

  @Prop({ trim: true, default: '' })
  decidedByName!: string;

  @Prop({ type: Date, default: null })
  decidedAt!: Date | null;

  /** Lý do trả lại - do người duyệt gõ, bắt buộc khi trả. */
  @Prop({ trim: true, default: '' })
  returnReason!: string;

  /** Phòng chỉnh số gì trên bản chụp này. */
  @Prop({ type: [TeamReportEditSchema], default: [] })
  edits!: TeamReportEdit[];

  createdAt?: Date;
  updatedAt?: Date;
}

export const TeamReportDaySchema = SchemaFactory.createForClass(TeamReportDay);

/*
  Một đội một ngày chỉ có một báo cáo. Ràng buộc ở tầng CSDL chứ không chỉ ở
  service: cả đội dùng chung tài khoản nên hai người bấm gửi gần như cùng lúc là
  chuyện thường, mà kiểm trong code thì vẫn lọt.
*/
TeamReportDaySchema.index({ departmentId: 1, reportDate: 1 }, { unique: true });

/** Hộp đến của phòng: báo cáo các đội gửi lên, mới nhất trước. */
TeamReportDaySchema.index({
  recipientDepartmentId: 1,
  status: 1,
  reportDate: -1,
});

// Dùng lại kiểu lưu vết của nhiệm vụ - hai chỗ ghi cùng một hình dạng.
export { TeamReportEdit };
