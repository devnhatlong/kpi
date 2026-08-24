import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CriterionDocument = HydratedDocument<Criterion>;

/**
 * Tiêu chí chấm điểm chung - danh mục PHẲNG, mỗi bản ghi là một dòng của bảng
 * "Danh mục điểm tiêu chí chung".
 *
 * Khác nhiệm vụ KPI ở chỗ dòng không do cán bộ khai: admin khai sẵn tiêu chí và
 * điểm tối đa, người chấm chỉ điền kết quả vào các cột. Bộ cột của bảng cấu
 * hình bằng Mẫu bảng KPI y như một trục lấy bộ cột của nó - xem cờ `forCriteria`
 * trong form-template.schema.ts.
 */
@Schema({ timestamps: true, collection: 'kpi_criteria' })
export class Criterion {
  @Prop({ required: true, unique: true, trim: true, uppercase: true })
  code!: string;

  /** Cột "Tiêu chí / Nội dung" - câu chữ dài, chép nguyên từ văn bản. */
  @Prop({ required: true, trim: true })
  name!: string;

  /**
   * Cột "Ghi chú" - admin khai một lần, người chấm chỉ đọc. Trong mẫu giấy ô
   * này thường gộp dọc cho cả nhóm tiêu chí vì các dòng dùng chung một câu.
   */
  @Prop({ trim: true, default: '' })
  note!: string;

  /** Cột "Điểm tối đa" của dòng. Cộng các dòng đang hoạt động ra dòng Tổng điểm. */
  @Prop({ default: 0, min: 0 })
  maxScore!: number;

  @Prop({ default: 0, min: 0 })
  sortOrder!: number;

  @Prop({ default: true, index: true })
  isActive!: boolean;
}

export const CriterionSchema = SchemaFactory.createForClass(Criterion);
CriterionSchema.index({ sortOrder: 1, name: 1 });
