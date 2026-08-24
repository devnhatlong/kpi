import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Axis } from './axis.schema';

export type ReportTemplateDocument = HydratedDocument<ReportTemplate>;

/**
 * Trạng thái của một mẫu báo cáo.
 * - `draft`  : đang cấu hình, chưa ai chấm theo bản này.
 * - `applied`: đã áp dụng - mỗi năm chỉ đúng MỘT bản mang trạng thái này.
 */
export const REPORT_TEMPLATE_STATUSES = ['draft', 'applied'] as const;
export type ReportTemplateStatus = (typeof REPORT_TEMPLATE_STATUSES)[number];

/**
 * Mẫu báo cáo của một năm - bản ghép các khối nội dung lại thành biểu mẫu thật.
 *
 * Khác với `FormTemplate`: mẫu bảng khai BỘ CỘT của một trục, còn mẫu báo cáo
 * khai NĂM NAY DÙNG NHỮNG KHỐI NÀO. Tách hai thứ ra vì bộ cột của trục dùng lại
 * năm này qua năm khác, còn danh sách trục thì mỗi năm mỗi khác - gộp vào một
 * bản ghi thì đổi danh sách trục của năm sau là đạp lên bảng của năm trước.
 */
@Schema({ timestamps: true, collection: 'kpi_report_templates' })
export class ReportTemplate {
  @Prop({ required: true, unique: true, trim: true, uppercase: true })
  code!: string;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ trim: true, default: '' })
  description!: string;

  /** Năm áp dụng - lấy theo năm của server lúc tạo nếu client không khai. */
  @Prop({ required: true, index: true })
  year!: number;

  /** Khối "A. Danh mục điểm tiêu chí chung" có nằm trong mẫu hay không. */
  @Prop({ default: true })
  includeCriteria!: boolean;

  /**
   * Các trục được ghép vào mẫu, THEO THỨ TỰ hiện trên báo cáo (B.1, B.2…).
   * Giữ nguyên thứ tự client gửi lên - không sort lại theo `Axis.sortOrder`,
   * vì mỗi năm có thể xếp khác nhau.
   */
  @Prop({
    type: [{ type: Types.ObjectId, ref: Axis.name }],
    default: [],
    index: true,
  })
  axisIds!: Types.ObjectId[];

  @Prop({
    type: String,
    enum: REPORT_TEMPLATE_STATUSES,
    default: 'draft',
    index: true,
  })
  status!: ReportTemplateStatus;

  /**
   * Thời điểm bấm "Lưu & áp dụng mẫu" - LUÔN lấy giờ server.
   * Không nhận mốc thời gian do client gửi lên: máy trạm lệch giờ là mốc áp
   * dụng của cả năm lệch theo.
   */
  @Prop({ type: Date, default: null })
  appliedAt!: Date | null;

  @Prop({ default: 0, min: 0 })
  sortOrder!: number;

  @Prop({ default: true, index: true })
  isActive!: boolean;
}

export const ReportTemplateSchema =
  SchemaFactory.createForClass(ReportTemplate);
ReportTemplateSchema.index({ year: -1, sortOrder: 1, name: 1 });
