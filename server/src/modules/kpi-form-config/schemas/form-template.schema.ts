import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Axis } from './axis.schema';

export type FormTemplateDocument = HydratedDocument<FormTemplate>;

export const FORM_COLUMN_DATA_TYPES = [
  'text',
  'number',
  'date',
  'time',
  'datetime',
  'file',
  'auto_increment',
  /** Ô tích - dùng cho các cột kiểu Đạt / Không đạt. */
  'boolean',
  /** Chọn từ danh mục có sẵn - nguồn suy ra từ semanticKey. */
  'select',
] as const;

export type FormColumnDataType = (typeof FORM_COLUMN_DATA_TYPES)[number];

/**
 * Ánh xạ cột -> trường dữ liệu hệ thống. Khai tường minh khi cấu hình, KHÔNG
 * đoán theo tiêu đề. Cột `custom` lưu vào PersonalKpiItem.fieldValues theo `key`.
 *
 * LUẬT: chỉ có mặt ở đây khi hệ thống thực sự làm gì đó khác với giá trị - lấy
 * từ danh mục, hoặc cần ô nhập không phải ô chữ. Cột chỉ lưu rồi hiện lại thì
 * để `custom`; gán ánh xạ cho nó cũng không đổi được hành vi nào.
 */
export const FORM_COLUMN_SEMANTICS = [
  'custom',
  /** Tự đánh số, không phải ô nhập. */
  'stt',
  /** Chọn từ danh mục Nội dung công việc; cấp trên gom bảng theo cột này. */
  'work_content',
  /** Chọn từ danh mục Nhóm điểm. */
  'score_group',
  /** Chọn từ danh mục Chất lượng thực hiện (100/75/50/25/0%). */
  'quality_level',
] as const;

export type FormColumnSemantic = (typeof FORM_COLUMN_SEMANTICS)[number];

/**
 * Cột lấy giá trị từ danh mục nào.
 * Khai ở đây một lần, cả cấu hình lẫn form nhập đều đọc bảng này - không nơi
 * nào tự đoán theo tiêu đề cột.
 */
export const SEMANTIC_CATALOG: Partial<
  Record<FormColumnSemantic, 'work_content' | 'score_group' | 'quality_level'>
> = {
  work_content: 'work_content',
  score_group: 'score_group',
  quality_level: 'quality_level',
};

export function catalogOfSemantic(semanticKey: FormColumnSemantic) {
  return SEMANTIC_CATALOG[semanticKey] ?? null;
}

/** Nhóm header (gộp ô) - lồng nhau nhiều tầng. */
export class FormHeaderGroup {
  id!: string;
  name!: string;
  children!: FormHeaderGroup[];
}

@Schema({ _id: false })
export class FormTemplateColumn {
  @Prop({ required: true, trim: true })
  id!: string;

  /** Khoá lưu dữ liệu - dùng cho fieldValues khi semanticKey = custom. */
  @Prop({ required: true, trim: true })
  key!: string;

  @Prop({ required: true, trim: true })
  title!: string;

  /** Đường dẫn id nhóm header từ gốc xuống - rỗng = cột đứng riêng. */
  @Prop({ type: [String], default: [] })
  headerPath!: string[];

  @Prop({ default: 160, min: 40 })
  width!: number;

  @Prop({ default: true })
  visible!: boolean;

  @Prop({
    type: String,
    enum: FORM_COLUMN_DATA_TYPES,
    default: 'text',
  })
  dataType!: FormColumnDataType;

  @Prop({
    type: String,
    enum: FORM_COLUMN_SEMANTICS,
    default: 'custom',
  })
  semanticKey!: FormColumnSemantic;

  @Prop({ default: false })
  required!: boolean;

  /**
   * Khoá của cột Nhóm điểm quyết định dải điểm hợp lệ cho cột này.
   * Chỉ đặt cho cột kiểu số. Một mẫu có thể có nhiều cột Nhóm điểm nên phải
   * chỉ đích danh, không đoán ngầm.
   */
  @Prop({ type: String, default: null })
  rangeFromColumnKey!: string | null;
}

export const FormTemplateColumnSchema =
  SchemaFactory.createForClass(FormTemplateColumn);

/** Mẫu bảng KPI - bộ cột + header gộp, gán cho một hoặc nhiều trục. */
@Schema({ timestamps: true, collection: 'kpi_form_templates' })
export class FormTemplate {
  @Prop({ required: true, unique: true, trim: true, uppercase: true })
  code!: string;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ trim: true, default: '' })
  description!: string;

  @Prop({ type: [FormTemplateColumnSchema], default: [] })
  columns!: FormTemplateColumn[];

  @Prop({ type: [Object], default: [] })
  headerGroups!: FormHeaderGroup[];

  /** Các trục dùng mẫu này. Một trục chỉ thuộc đúng một mẫu đang hoạt động. */
  @Prop({ type: [{ type: Types.ObjectId, ref: Axis.name }], default: [], index: true })
  axisIds!: Types.ObjectId[];

  @Prop({ default: 0, min: 0 })
  sortOrder!: number;

  @Prop({ default: true, index: true })
  isActive!: boolean;

  /**
   * Tăng mỗi lần sửa cột/nhóm header. Nhiệm vụ đã gửi lưu lại số này để hiển
   * thị đúng bảng lúc gửi, kể cả sau khi mẫu bị sửa.
   */
  @Prop({ default: 1, min: 1 })
  version!: number;
}

export const FormTemplateSchema = SchemaFactory.createForClass(FormTemplate);
FormTemplateSchema.index({ sortOrder: 1, name: 1 });
