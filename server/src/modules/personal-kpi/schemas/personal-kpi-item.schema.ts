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

/**
 * Một tệp đã đính vào cột kiểu "file".
 * `id` trỏ tới bản ghi trong collection uploads; tên và cỡ chép lại để hiển thị
 * danh sách mà không phải join.
 */
export type PersonalKpiAttachment = {
  id: string;
  name: string;
  size: number;
  mimeType: string;
};

/**
 * Giá trị đã chọn ở một cột lấy từ danh mục.
 * Tên chép lại lúc lưu để báo cáo đã gửi giữ nguyên chữ tại thời điểm đó, kể cả
 * khi danh mục bị sửa về sau - cùng nguyên tắc với việc khoá phiên bản mẫu bảng.
 */
export type PersonalKpiCatalogValue = {
  id: string;
  name: string;
};

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

/** Các ô mà một lần cập nhật tiến độ có thể động tới. */
export const PERSONAL_KPI_PROGRESS_FIELDS = [
  'progress',
  'quality',
  'product',
  'evidence',
] as const;

export type PersonalKpiProgressField =
  (typeof PERSONAL_KPI_PROGRESS_FIELDS)[number];

/**
 * Một ô đổi giá trị trong lần cập nhật.
 *
 * Chỉ lưu giá trị thô (số phần trăm, chữ, số tệp) chứ không lưu câu chữ đã
 * định dạng - nhãn và cách hiển thị để client lo, vì tên cột còn đổi theo mẫu.
 */
@Schema({ _id: false })
export class PersonalKpiProgressChange {
  @Prop({
    type: String,
    enum: PERSONAL_KPI_PROGRESS_FIELDS,
    required: true,
  })
  field!: PersonalKpiProgressField;

  @Prop({ trim: true, default: '' })
  from!: string;

  @Prop({ trim: true, default: '' })
  to!: string;

  /** Chi tiết thêm - ví dụ tên các tệp vừa đính kèm. */
  @Prop({ trim: true, default: '' })
  detail!: string;
}

export const PersonalKpiProgressChangeSchema = SchemaFactory.createForClass(
  PersonalKpiProgressChange,
);

/**
 * Một lần cán bộ cập nhật tiến độ.
 *
 * Ghi lại thành nhật ký thay vì chỉ đè lên con số hiện tại: cấp trên cần thấy
 * việc chạy nhanh chậm ra sao qua từng ngày, và "im lặng mấy ngày" phải tra
 * được chứ không chỉ tin vào một cái mốc cuối cùng.
 */
@Schema({ _id: false })
export class PersonalKpiProgressLog {
  @Prop({ type: Types.ObjectId, ref: User.name, required: true })
  byId!: Types.ObjectId;

  @Prop({ trim: true, default: '' })
  byName!: string;

  /** Phần trăm tiến độ ngay sau lần cập nhật này; null = chưa nhập. */
  @Prop({ type: Number, default: null })
  percent!: number | null;

  @Prop({ trim: true, default: '' })
  note!: string;

  /** Ngày báo cáo (YYYY-MM-DD theo giờ server) của lần cập nhật. */
  @Prop({ trim: true, default: '' })
  onDate!: string;

  /** Những ô đã đổi giá trị trong lần này. */
  @Prop({ type: [PersonalKpiProgressChangeSchema], default: [] })
  changes!: PersonalKpiProgressChange[];

  @Prop({ type: Date, default: Date.now })
  at!: Date;
}

export const PersonalKpiProgressLogSchema = SchemaFactory.createForClass(
  PersonalKpiProgressLog,
);

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

  /**
   * Giá trị các cột lấy từ danh mục, key = FormTemplateColumn.key.
   * Theo khoá cột chứ không theo loại danh mục, để hai cột cùng lấy một danh
   * mục vẫn giữ được hai giá trị khác nhau.
   */
  @Prop({ type: Object, default: {} })
  catalogValues!: Record<string, PersonalKpiCatalogValue>;

  /**
   * Giá trị mọi cột chữ/số của mẫu bảng, key = FormTemplateColumn.key.
   * Chỉ cột lấy từ danh mục mới có field cứng riêng (workContentId,
   * scoreGroupId, qualityLevelId); còn lại nằm hết ở đây.
   */
  @Prop({ type: Object, default: {} })
  fieldValues!: Record<string, string | number>;

  /**
   * Tệp đính kèm của các cột kiểu "file", key = FormTemplateColumn.key.
   * Để riêng khỏi fieldValues vì giá trị là danh sách chứ không phải chuỗi -
   * nhét JSON vào fieldValues sẽ làm hỏng cả hiển thị lẫn tìm kiếm.
   */
  @Prop({ type: Object, default: {} })
  attachments!: Record<string, PersonalKpiAttachment[]>;

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

  /**
   * Lần cán bộ cập nhật tiến độ gần nhất.
   *
   * Tách khỏi `updatedAt` vì `updatedAt` nhúc nhích cả khi cấp trên duyệt hay
   * hệ thống tính lại cột - dựa vào nó thì việc bỏ bê vẫn trông như vừa được
   * đụng tới. Đây là mốc để tính "im lặng N ngày".
   */
  @Prop({ type: Date, default: null })
  lastProgressAt!: Date | null;

  /** Nhật ký cập nhật tiến độ, cũ trước mới sau. */
  @Prop({ type: [PersonalKpiProgressLogSchema], default: [] })
  progressLogs!: PersonalKpiProgressLog[];

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
