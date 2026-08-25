import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { User } from '@/modules/users/schemas/user.schema';

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
}

export const PersonalKpiCriterionRowSchema = SchemaFactory.createForClass(
  PersonalKpiCriterionRow,
);

/**
 * Bảng khối A cán bộ tự chấm trong báo cáo cá nhân - MỘT BẢN MỖI NGÀY.
 *
 * Một document cho cả bảng chứ không phải mỗi tiêu chí một document: bảng luôn
 * được lưu trọn vẹn một lượt từ màn nhập, tách ra chỉ đẻ thêm 6 lượt ghi và một
 * bài toán đồng bộ không ai cần.
 *
 * Báo cáo tổng hợp nạp bản có `reportDate` LỚN NHẤT trong kỳ làm điểm tự chấm
 * của cán bộ đó, rồi chỉ huy sửa đè được - xem `KpiSummaryReport.criteriaScores`.
 */
@Schema({ timestamps: true, collection: 'personal_kpi_criteria_sheets' })
export class PersonalKpiCriteriaSheet {
  @Prop({ type: Types.ObjectId, ref: User.name, required: true, index: true })
  ownerId!: Types.ObjectId;

  /** Đơn vị của cán bộ lúc chấm - chép sẵn để thống kê khỏi join lại. */
  @Prop({ type: Types.ObjectId, ref: 'Department', default: null, index: true })
  ownerDepartmentId!: Types.ObjectId | null;

  /** Ngày báo cáo YYYY-MM-DD theo giờ server. */
  @Prop({ required: true, trim: true, index: true })
  reportDate!: string;

  @Prop({ type: [PersonalKpiCriterionRowSchema], default: [] })
  rows!: PersonalKpiCriterionRow[];
}

export const PersonalKpiCriteriaSheetSchema = SchemaFactory.createForClass(
  PersonalKpiCriteriaSheet,
);

// Mỗi cán bộ mỗi ngày đúng một bảng - hai bảng thì không biết cộng bản nào.
PersonalKpiCriteriaSheetSchema.index(
  { ownerId: 1, reportDate: 1 },
  { unique: true },
);
