import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

import { Department } from '@/modules/departments/schemas/department.schema';
import { FormTemplate } from '@/modules/mission-form-config/schemas/form-template.schema';
import {
  TeamReportEdit,
  TeamReportEditSchema,
} from './team-report-task.schema';

export type TeamReportCriteriaSheetDocument = TeamReportCriteriaSheet &
  Document;

/**
 * Một dòng của bảng A - MỘT DÒNG LÀ MỘT TIÊU CHÍ.
 *
 * Tên tiêu chí, ghi chú và điểm tối đa CHÉP LẠI lúc lập bảng chứ không đọc live
 * từ danh mục: quản trị sửa danh mục cho kỳ sau thì bảng của kỳ trước vẫn phải
 * giữ đúng chữ và đúng trần điểm lúc chấm.
 *
 * Các ô còn lại lưu theo KHOÁ CỘT của mẫu `forCriteria`, y như nhiệm vụ lưu
 * `fieldValues`: bảng A do quản trị thiết kế cột nên không có trường cứng nào
 * đoán trước được.
 */
@Schema({ _id: false })
export class TeamReportCriterionRow {
  @Prop({ type: Types.ObjectId, required: true })
  criterionId!: Types.ObjectId;

  @Prop({ trim: true, default: '' })
  criterionName!: string;

  @Prop({ trim: true, default: '' })
  criterionNote!: string;

  @Prop({ type: Number, default: 0 })
  maxScore!: number;

  /** Ô tích lưu "1" hoặc vắng mặt - cùng quy ước với bảng nhiệm vụ. */
  @Prop({ type: Object, default: {} })
  fieldValues!: Record<string, string | number>;
}

export const TeamReportCriterionRowSchema = SchemaFactory.createForClass(
  TeamReportCriterionRow,
);

/**
 * Bảng A "Danh mục điểm tiêu chí chung" của MỘT ĐỘI cho MỘT THÁNG.
 *
 * Khối B (nhiệm vụ) chấm theo từng việc, từng ngày. Khối A là đánh giá chung
 * của cả tháng - tháng một bản, nhập lúc nào trong tháng (hay sau tháng) cũng
 * được, chỉ cần ghi rõ bản này thuộc tháng nào. Khoá duy nhất vì thế là
 * `departmentId + periodMonth`: hai bản cho cùng một tháng thì không biết cộng
 * bản nào vào báo cáo.
 *
 * Tách collection khỏi `personal_mission_criteria_sheets` của bản cũ dù cùng
 * hình dạng: hai bản nghiệp vụ phải bật tắt độc lập, dùng chung collection là
 * xoá bản này mất luôn dữ liệu bản kia.
 *
 * Không có trạng thái duyệt riêng: bảng A đi lên cấp trên bằng cách được gộp
 * vào báo cáo tổng hợp của kỳ, duyệt ở đó.
 */
@Schema({ timestamps: true, collection: 'team_report_criteria_sheets' })
export class TeamReportCriteriaSheet {
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

  @Prop({ type: [TeamReportCriterionRowSchema], default: [] })
  rows!: TeamReportCriterionRow[];

  /*
    Mẫu `forCriteria` dựng nên bảng này, chốt lúc tạo - quản trị sửa cột về sau
    không làm méo bảng đã chấm. Cùng nguyên tắc với mẫu của trục.
  */
  @Prop({ type: Types.ObjectId, ref: FormTemplate.name, default: null })
  formTemplateId!: Types.ObjectId | null;

  @Prop({ type: Number, default: null })
  formTemplateVersion!: number | null;

  /** Chống đè: cả đội gõ chung một bảng qua một tài khoản. */
  @Prop({ type: Number, default: 0 })
  version!: number;

  /** Ai đổi ô nào, từ gì sang gì, lúc nào - để trace về sau. */
  @Prop({ type: [TeamReportEditSchema], default: [] })
  edits!: TeamReportEdit[];

  createdAt?: Date;
  updatedAt?: Date;
}

export const TeamReportCriteriaSheetSchema = SchemaFactory.createForClass(
  TeamReportCriteriaSheet,
);

TeamReportCriteriaSheetSchema.index(
  { departmentId: 1, periodMonth: 1 },
  { unique: true },
);
