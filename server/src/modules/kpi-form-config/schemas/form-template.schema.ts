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
] as const;

export type FormColumnDataType = (typeof FORM_COLUMN_DATA_TYPES)[number];

/**
 * Ý nghĩa cột - khai báo tường minh khi cấu hình, KHÔNG đoán theo tiêu đề.
 * Cột `custom` lưu vào PersonalKpiItem.fieldValues theo `key`.
 */
export const FORM_COLUMN_SEMANTICS = [
  'custom',
  'stt',
  'work_content',
  'task_title',
  'deadline',
  'product',
  'standard_score',
  'executing_unit',
  'progress_percent',
  'progress_self_score',
  'quality_percent',
  'quality_self_score',
  /** Cặp kết quả đánh giá - tích một trong hai, loại trừ nhau. */
  'result_passed',
  'result_failed',
  'note',
  'evidence_files',
] as const;

export type FormColumnSemantic = (typeof FORM_COLUMN_SEMANTICS)[number];

/** Semantic chỉ được xuất hiện tối đa 1 lần trong một mẫu. */
export const SINGLETON_SEMANTICS: FormColumnSemantic[] =
  FORM_COLUMN_SEMANTICS.filter((item) => item !== 'custom');

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
