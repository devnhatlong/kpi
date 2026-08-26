import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { FormTemplate } from '@/modules/kpi-form-config/schemas/form-template.schema';
import { User } from '@/modules/users/schemas/user.schema';
import {
  PERSONAL_KPI_REVIEW_STATUSES,
  PersonalKpiProgressLog,
  PersonalKpiProgressLogSchema,
  type PersonalKpiReviewStatus,
} from './personal-kpi-item.schema';

export type PersonalKpiCriteriaSheetDocument =
  HydratedDocument<PersonalKpiCriteriaSheet>;

/**
 * Một dòng chấm của khối A trong báo cáo cá nhân - MỘT DÒNG LÀ MỘT TIÊU CHÍ.
 *
 * Giá trị các ô lưu theo KHOÁ CỘT của mẫu `forCriteria`, y hệt cách nhiệm vụ
 * lưu `fieldValues` / `catalogValues`: bảng A do admin thiết kế cột, nên không
 * có trường cứng nào đoán trước được. Đổi cột ở mẫu là bảng đổi theo, dữ liệu
 * cũ của cột bị bỏ vẫn nằm nguyên trong bản ghi chứ không mất.
 *
 * Tên tiêu chí và điểm tối đa CHỤP LẠI lúc chấm, không đọc live từ danh mục:
 * sửa danh mục sang kỳ sau là mọi bản đã gửi đổi theo, cán bộ nhìn lại thấy
 * khác bản mình khai.
 */
@Schema({ _id: false, timestamps: false })
export class PersonalKpiCriterionRow {
  @Prop({ type: Types.ObjectId, required: true })
  criterionId!: Types.ObjectId;

  @Prop({ trim: true, default: '', maxlength: 500 })
  criterionName!: string;

  @Prop({ default: 0, min: 0 })
  maxScore!: number;

  /** Giá trị các cột chữ / số / ô tích, key = FormTemplateColumn.key. */
  @Prop({ type: Object, default: {} })
  fieldValues!: Record<string, string | number | boolean>;

  /** Giá trị các cột lấy từ danh mục, key = FormTemplateColumn.key. */
  @Prop({ type: Object, default: {} })
  catalogValues!: Record<string, { id: string; name: string }>;

  /**
   * Điểm chỉ huy chấm lại cho dòng này - ĐÂY MỚI LÀ SỐ CHỐT.
   *
   * Để riêng chứ không đè lên `fieldValues`, cùng lý do với `reviewValues` của
   * nhiệm vụ: đè thì mất số cán bộ tự chấm, không đối chiếu được và cũng không
   * biết ai sửa. Ô nào chỉ huy chưa chấm thì vẫn đọc số tự chấm.
   */
  @Prop({ type: Object, default: {} })
  reviewValues!: Record<string, string | number | boolean>;

  /** Ô danh mục do chỉ huy chọn lại, theo khoá cột. */
  @Prop({ type: Object, default: {} })
  reviewCatalogValues!: Record<string, { id: string; name: string }>;
}

export const PersonalKpiCriterionRowSchema = SchemaFactory.createForClass(
  PersonalKpiCriterionRow,
);

/**
 * Bảng khối A cán bộ tự chấm - MỘT BẢN MỖI THÁNG, chốt kết quả của cả tháng.
 *
 * Một document cho cả bảng chứ không phải mỗi tiêu chí một document: bảng luôn
 * được lưu trọn vẹn một lượt từ màn nhập, tách ra chỉ đẻ thêm 6 lượt ghi và một
 * bài toán đồng bộ không ai cần.
 *
 * THEO THÁNG, CẬP NHẬT HẰNG NGÀY: khối A là đánh giá tổng của tháng, cán bộ sửa
 * lại ngày nào cũng được (hoặc không đụng tới ngày nào cũng được) - mỗi lần sửa
 * là một mốc trong `progressLogs`, không phải một bản ghi mới. Đây là lý do khoá
 * duy nhất là `ownerId + periodMonth` chứ không phải theo ngày: chấm lại theo
 * ngày thì một tháng đẻ ra ba mươi bảng, mà 30 điểm của khối A sẽ nhân lên theo
 * số bảng khi vào báo cáo tổng hợp.
 *
 * VÒNG ĐỜI GIỐNG NHIỆM VỤ: có trạng thái duyệt, đi theo chuỗi gửi lên cấp trên
 * (gửi kèm báo cáo của một ngày bất kỳ trong tháng), sửa sau khi gửi thì ghi vết,
 * chốt hoàn thành thì khoá.
 *
 * Báo cáo tổng hợp nạp bản có `periodMonth` LỚN NHẤT trong kỳ làm điểm của cán
 * bộ đó - xem `KpiSummaryReport.criteriaScores`.
 */
@Schema({ timestamps: true, collection: 'personal_kpi_criteria_sheets' })
export class PersonalKpiCriteriaSheet {
  @Prop({ type: Types.ObjectId, ref: User.name, required: true, index: true })
  ownerId!: Types.ObjectId;

  /** Đơn vị của cán bộ lúc chấm - chép sẵn để thống kê khỏi join lại. */
  @Prop({ type: Types.ObjectId, ref: 'Department', default: null, index: true })
  ownerDepartmentId!: Types.ObjectId | null;

  /** Kỳ tháng YYYY-MM theo giờ server - bảng chốt cho cả tháng này. */
  @Prop({ required: true, trim: true, index: true })
  periodMonth!: string;

  @Prop({ type: [PersonalKpiCriterionRowSchema], default: [] })
  rows!: PersonalKpiCriterionRow[];

  // --------------------------------------------------------- mẫu bảng khoá

  /**
   * Mẫu `forCriteria` dùng để dựng bảng này, chốt tại lần gửi đầu tiên - cùng
   * nguyên tắc với nhiệm vụ: admin sửa cột về sau không làm méo bảng đã gửi.
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

  @Prop({ type: Types.ObjectId, ref: User.name, default: null, index: true })
  lastSenderId!: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'Department', default: null })
  lastSenderDepartmentId!: Types.ObjectId | null;

  @Prop({ type: Date, default: null })
  lastSentAt!: Date | null;

  /** Lần cán bộ sửa lại bảng gần nhất - mốc để tính "im lặng N ngày". */
  @Prop({ type: Date, default: null })
  lastProgressAt!: Date | null;

  /** Nhật ký đời bảng (sửa, gửi, trả lại, chốt) - cũ trước mới sau. */
  @Prop({ type: [PersonalKpiProgressLogSchema], default: [] })
  progressLogs!: PersonalKpiProgressLog[];

  // --------------------------------------------------------- kết quả duyệt

  @Prop({ type: Types.ObjectId, ref: User.name, default: null })
  lastDecidedById!: Types.ObjectId | null;

  @Prop({ type: Date, default: null })
  lastDecidedAt!: Date | null;

  @Prop({ trim: true, default: '' })
  returnReason!: string;

  @Prop({ trim: true, default: '' })
  reviewNote!: string;

  @Prop({ type: Types.ObjectId, ref: User.name, default: null })
  reviewScoredById!: Types.ObjectId | null;

  @Prop({ trim: true, default: '' })
  reviewScoredByName!: string;

  @Prop({ type: Date, default: null })
  reviewScoredAt!: Date | null;

  createdAt?: Date;
  updatedAt?: Date;
}

export const PersonalKpiCriteriaSheetSchema = SchemaFactory.createForClass(
  PersonalKpiCriteriaSheet,
);

// Mỗi cán bộ mỗi THÁNG đúng một bảng - hai bảng thì không biết cộng bản nào.
PersonalKpiCriteriaSheetSchema.index(
  { ownerId: 1, periodMonth: 1 },
  { unique: true },
);

/** Bảng tổng của cấp trên: bảng A đang nằm ở tay tôi. */
PersonalKpiCriteriaSheetSchema.index({
  currentRecipientId: 1,
  reviewStatus: 1,
  periodMonth: -1,
});
