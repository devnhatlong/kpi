import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

import { Axis } from '@/modules/kpi-form-config/schemas/axis.schema';
import { PersonalKpiItem } from '@/modules/personal-kpi/schemas/personal-kpi-item.schema';
import { User } from '@/modules/users/schemas/user.schema';

export type KpiSummaryReportDocument = HydratedDocument<KpiSummaryReport>;

/**
 * Đời của một báo cáo tổng hợp, chạy đúng chuỗi duyệt của KPI cá nhân:
 * - DRAFT    : còn sửa được, thêm bớt nhiệm vụ thoải mái
 * - SENT     : đã trình, đang nằm ở chỗ cấp trên chờ quyết
 * - RETURNED : cấp trên trả lại kèm lý do - người lập sửa rồi trình lại
 * - APPROVED : cấp trên đã duyệt, khoá lại
 *
 * Bản ghi cũ còn trạng thái 'FINALIZED' (thời còn "chốt báo cáo"): đọc lên vẫn
 * chạy, service quy về SENT khi trả cho client nên không cần chuyển dữ liệu.
 */
export const KPI_SUMMARY_REPORT_STATUSES = [
  'DRAFT',
  'SENT',
  'RETURNED',
  'APPROVED',
] as const;

export type KpiSummaryReportStatus =
  (typeof KPI_SUMMARY_REPORT_STATUSES)[number];

/** Việc đã xảy ra với báo cáo - đủ để dựng nhật ký mà không cần bảng riêng. */
export const KPI_SUMMARY_LOG_TYPES = [
  'CREATE',
  'UPDATE',
  'ADD_ITEMS',
  'REMOVE_ITEMS',
  'ADD_MANUAL',
  'REMOVE_MANUAL',
  'SEND',
  'RECALL',
  'APPROVE',
  'RETURN',
  'FORWARD',
] as const;

export type KpiSummaryLogType = (typeof KPI_SUMMARY_LOG_TYPES)[number];

/**
 * Nhiệm vụ tự nhập: việc có thật nhưng không đi qua KPI cá nhân (việc đột xuất,
 * việc của đơn vị phối hợp). Chép thẳng nội dung vào báo cáo vì không có bản
 * ghi gốc nào để trỏ tới.
 */
@Schema({ _id: true, timestamps: false })
export class KpiSummaryManualItem {
  @Prop({ required: true, trim: true, maxlength: 300 })
  title!: string;

  @Prop({ trim: true, default: '', maxlength: 1000 })
  note!: string;

  @Prop({ type: Types.ObjectId, ref: Axis.name, default: null })
  axisId!: Types.ObjectId | null;

  /** Tên trục chép sẵn - trục bị xoá thì báo cáo vẫn đọc được. */
  @Prop({ trim: true, default: '' })
  axisName!: string;

  @Prop({ trim: true, default: '', maxlength: 200 })
  ownerName!: string;

  @Prop({ trim: true, default: '', maxlength: 200 })
  departmentName!: string;

  /** Điểm chỉ huy ghi cho việc này; null = không chấm điểm. */
  @Prop({ type: Number, default: null })
  score!: number | null;

  @Prop({ type: Date, default: () => new Date() })
  createdAt!: Date;
}

export const KpiSummaryManualItemSchema =
  SchemaFactory.createForClass(KpiSummaryManualItem);

@Schema({ _id: false, timestamps: false })
export class KpiSummaryReportLog {
  @Prop({ type: String, enum: KPI_SUMMARY_LOG_TYPES, required: true })
  type!: KpiSummaryLogType;

  @Prop({ trim: true, default: '', maxlength: 500 })
  message!: string;

  @Prop({ type: Types.ObjectId, ref: User.name, default: null })
  byId!: Types.ObjectId | null;

  @Prop({ trim: true, default: '' })
  byName!: string;

  @Prop({ type: Date, default: () => new Date() })
  at!: Date;
}

export const KpiSummaryReportLogSchema =
  SchemaFactory.createForClass(KpiSummaryReportLog);

/**
 * Báo cáo tổng hợp: một tập nhiệm vụ KPI cá nhân ĐÃ HOÀN THÀNH được người lập
 * nhặt ra và gom lại, trải hết các trục, rồi trình lên cấp trên.
 *
 * Chỉ giữ `itemIds` chứ không chép nội dung nhiệm vụ sang đây. Nhiệm vụ đã
 * COMPLETED là điểm dừng của chuỗi duyệt nên nội dung gần như đứng yên, mà giữ
 * tham chiếu thì báo cáo luôn khớp với dữ liệu gốc thay vì trôi thành hai bản.
 * Bù lại, cần bản đóng băng thật sự thì xuất file ra giữ.
 */
@Schema({ timestamps: true, collection: 'kpi_summary_reports' })
export class KpiSummaryReport {
  @Prop({ required: true, trim: true, maxlength: 300 })
  title!: string;

  /** Kỳ báo cáo theo ngày báo cáo của nhiệm vụ (YYYY-MM-DD). */
  @Prop({ trim: true, default: '', index: true })
  fromDate!: string;

  @Prop({ trim: true, default: '', index: true })
  toDate!: string;

  @Prop({ trim: true, default: '', maxlength: 2000 })
  note!: string;

  @Prop({ type: Types.ObjectId, ref: User.name, required: true, index: true })
  ownerId!: Types.ObjectId;

  @Prop({ trim: true, default: '' })
  ownerName!: string;

  @Prop({ type: Types.ObjectId, ref: 'Department', default: null, index: true })
  ownerDepartmentId!: Types.ObjectId | null;

  /**
   * Phạm vi tổng hợp: đơn vị mà báo cáo này nói thay. Mặc định là đơn vị của
   * người lập, đổi được sang đơn vị con để tổng hợp riêng cho nhánh đó.
   */
  @Prop({ type: Types.ObjectId, ref: 'Department', default: null, index: true })
  scopeDepartmentId!: Types.ObjectId | null;

  /** Tên phạm vi chép sẵn - danh sách báo cáo tìm được theo tên này. */
  @Prop({ trim: true, default: '', maxlength: 200 })
  scopeName!: string;

  /** Nhiệm vụ đã nhặt vào báo cáo, giữ nguyên thứ tự người lập tích. */
  @Prop({
    type: [{ type: Types.ObjectId, ref: PersonalKpiItem.name }],
    default: [],
    index: true,
  })
  itemIds!: Types.ObjectId[];

  /**
   * Số nhiệm vụ lấy từ KPI, chép lại để danh sách báo cáo khỏi phải nạp cả mảng
   * itemIds. Luôn ghi cùng lúc với itemIds.
   */
  @Prop({ default: 0, min: 0 })
  itemCount!: number;

  @Prop({ type: [KpiSummaryManualItemSchema], default: [] })
  manualItems!: KpiSummaryManualItem[];

  @Prop({ type: [KpiSummaryReportLogSchema], default: [] })
  logs!: KpiSummaryReportLog[];

  @Prop({
    type: String,
    enum: KPI_SUMMARY_REPORT_STATUSES,
    default: 'DRAFT',
    index: true,
  })
  status!: KpiSummaryReportStatus;

  /** Cấp trên đang giữ bản trình hiện tại. */
  @Prop({ type: Types.ObjectId, ref: User.name, default: null })
  sentToId!: Types.ObjectId | null;

  /**
   * Người trình bản hiện tại: lần đầu là người lập, những lần sau là cấp trên
   * chuyển tiếp lên. Trả lại thì báo cáo về đúng tay người này, không rơi thẳng
   * xuống người lập ban đầu.
   */
  @Prop({ type: Types.ObjectId, ref: User.name, default: null })
  sentById!: Types.ObjectId | null;

  @Prop({ trim: true, default: '' })
  sentByName!: string;

  /**
   * Mọi cấp đã từng giữ báo cáo này. Chuyển tiếp lên trên rồi thì cấp dưới vẫn
   * thấy bản mình đã xử lý trong hộp thư, không phải là biến mất.
   */
  @Prop({
    type: [{ type: Types.ObjectId, ref: User.name }],
    default: [],
    index: true,
  })
  holderIds!: Types.ObjectId[];

  @Prop({ trim: true, default: '' })
  sentToName!: string;

  @Prop({ trim: true, default: '', maxlength: 1000 })
  sentNote!: string;

  @Prop({ type: Date, default: null })
  sentAt!: Date | null;

  /** Lý do cấp trên trả lại lần gần nhất - người lập phải đọc được. */
  @Prop({ trim: true, default: '', maxlength: 1000 })
  returnReason!: string;

  /** Ai duyệt / trả lại gần nhất, lúc nào. */
  @Prop({ type: Types.ObjectId, ref: User.name, default: null })
  decidedById!: Types.ObjectId | null;

  @Prop({ trim: true, default: '' })
  decidedByName!: string;

  @Prop({ type: Date, default: null })
  decidedAt!: Date | null;

  createdAt?: Date;
  updatedAt?: Date;
}

export const KpiSummaryReportSchema =
  SchemaFactory.createForClass(KpiSummaryReport);

/** Danh sách báo cáo của tôi, mới nhất trước. */
KpiSummaryReportSchema.index({ ownerId: 1, createdAt: -1 });

/** Hộp thư đến của cấp trên: báo cáo cấp dưới trình lên mình. */
KpiSummaryReportSchema.index({ sentToId: 1, createdAt: -1 });

/** Tra ngược "nhiệm vụ này đã nằm trong báo cáo nào chưa". */
KpiSummaryReportSchema.index({ itemIds: 1, ownerId: 1 });
