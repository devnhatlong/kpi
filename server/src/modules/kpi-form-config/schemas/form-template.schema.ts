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
  /** Chọn từ danh mục Nhiệm vụ của nội dung công việc đang khai. */
  'work_task',
  /** Ghi chú - đọc ghi chú của nội dung công việc, admin khai sẵn. */
  'work_content_note',
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
  Record<
    FormColumnSemantic,
    'work_content' | 'work_task' | 'score_group' | 'quality_level'
  >
> = {
  work_content: 'work_content',
  work_task: 'work_task',
  score_group: 'score_group',
  quality_level: 'quality_level',
};

export function catalogOfSemantic(semanticKey: FormColumnSemantic) {
  return SEMANTIC_CATALOG[semanticKey] ?? null;
}

/**
 * Con số mà một cột đóng góp vào công thức điểm, null = cột không tính được.
 *
 * Không phải cứ `dataType = number` mới cộng được: cột Điểm chuẩn là dropdown
 * Nhóm điểm, số dùng để tính là điểm tối đa của nhóm được chọn; cột Chất lượng
 * thực hiện góp phần trăm của mức được chọn. Khai chung một chỗ để cấu hình và
 * bảng tổng không bao giờ hiểu khác nhau về "cột này ra số nào".
 */
export type FormulaValueSource =
  | 'number'
  | 'score_group_max'
  | 'quality_percent';

export function formulaValueSource(column: {
  semanticKey: FormColumnSemantic;
  dataType: FormColumnDataType;
}): FormulaValueSource | null {
  if (column.semanticKey === 'score_group') return 'score_group_max';
  if (column.semanticKey === 'quality_level') return 'quality_percent';
  if (column.dataType === 'number') return 'number';
  return null;
}

/**
 * Cách một cột số tự lấy giá trị thay vì để người nhập gõ.
 * `percent_of`: phần trăm của cột Chất lượng thực hiện nhân với cột điểm gốc -
 * đúng ô "Điểm tự chấm" trong bảng KPI.
 */
export const FORM_COLUMN_AUTO_KINDS = ['percent_of'] as const;

export type FormColumnAutoKind = (typeof FORM_COLUMN_AUTO_KINDS)[number];

/**
 * Cột trỏ tới cột khác BẰNG KHOÁ CỘT, không suy theo nhóm header.
 *
 * Nhóm header chỉ để gộp ô cho dễ đọc; buộc công thức vào nó thì đổi bố cục
 * bảng là đổi luôn phép tính. Cùng lý do với `rangeFromColumnKey` bên dưới.
 */
@Schema({ _id: false })
export class FormColumnAutoValue {
  @Prop({ type: String, enum: FORM_COLUMN_AUTO_KINDS, required: true })
  kind!: FormColumnAutoKind;

  /** Khoá cột Chất lượng thực hiện cho phần trăm. */
  @Prop({ required: true, trim: true })
  percentColumnKey!: string;

  /** Khoá cột điểm gốc đem nhân với phần trăm. */
  @Prop({ required: true, trim: true })
  baseColumnKey!: string;
}

export const FormColumnAutoValueSchema =
  SchemaFactory.createForClass(FormColumnAutoValue);

/**
 * Giá trị của một ô tự tính, null khi thiếu đầu vào.
 *
 * Thiếu thì trả null chứ KHÔNG trả 0: ô hiện 0 đọc ra thành "đã chấm 0 điểm",
 * khác hẳn nghĩa "chưa chấm".
 */
export function computeAutoValue(
  kind: FormColumnAutoKind,
  percent: number | null,
  base: number | null,
): number | null {
  if (kind !== 'percent_of') return null;
  if (percent === null || base === null) return null;
  if (!Number.isFinite(percent) || !Number.isFinite(base)) return null;
  // Làm tròn 4 số để khỏi lưu 24.750000000000004; hiển thị vẫn cắt còn 2 số.
  return Math.round((percent / 100) * base * 10000) / 10000;
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

  /**
   * Cột tự tính - null = người nhập tự gõ như mọi cột số khác.
   * Ô của cột này khoá lại ở form nhập, và server tính lại lúc lưu.
   */
  @Prop({ type: FormColumnAutoValueSchema, default: null })
  autoValue!: FormColumnAutoValue | null;
}

export const FormTemplateColumnSchema =
  SchemaFactory.createForClass(FormTemplateColumn);

/**
 * Ba dòng cuối bảng của mỗi trục: "Tổng từng cột", "Tổng điểm trục" và
 * "Điểm quy đổi".
 *
 * Khuôn công thức cố định, cấu hình chỉ chọn cột đóng vai trò nào - không chạy
 * biểu thức tuỳ ý:
 *   tổng điểm trục = trung bình cộng của (Σ tử số i / Σ mẫu số)
 *   điểm quy đổi   = tổng điểm trục × Axis.maxScore
 *
 * Cột nào được cộng ở dòng "Tổng từng cột" thì suy ra từ dataType = number,
 * không khai lại ở đây - khai thêm cũng không đổi được hành vi nào.
 */
/**
 * Cách quy ra điểm trục.
 * - ratio: trung bình cộng của (Σ tử số / Σ mẫu số) rồi × điểm tối đa trục.
 * - sum  : cộng thẳng điểm các cột đã khai, chặn ở điểm tối đa trục - dành cho
 *          trục chấm theo mục Đạt / Không đạt, mỗi mục một điểm chuẩn riêng.
 */
export const FORM_FOOTER_MODES = ['ratio', 'sum'] as const;
export type FormFooterMode = (typeof FORM_FOOTER_MODES)[number];

@Schema({ _id: false })
export class FormTemplateFooter {
  @Prop({ default: false })
  enabled!: boolean;

  /** Bỏ trống = 'ratio', để mẫu cũ giữ nguyên cách tính. */
  @Prop({ type: String, enum: FORM_FOOTER_MODES, default: 'ratio' })
  mode!: FormFooterMode;

  /** Khoá cột mẫu số - "Điểm chuẩn" trong bảng mẫu. Cộng dồn thì không cần. */
  @Prop({ type: String, default: null })
  baseColumnKey!: string | null;

  /**
   * Khoá các cột tử số, theo thứ tự hiện trên công thức. Một phần tử thì công
   * thức rút về (Σ B / Σ A), không chia trung bình.
   */
  @Prop({ type: [String], default: [] })
  ratioColumnKeys!: string[];
}

export const FormTemplateFooterSchema =
  SchemaFactory.createForClass(FormTemplateFooter);

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

  /** Công thức ba dòng cuối bảng. Tắt = bảng không có dòng tính điểm. */
  @Prop({ type: FormTemplateFooterSchema, default: () => ({}) })
  footer!: FormTemplateFooter;

  /** Các trục dùng mẫu này. Một trục chỉ thuộc đúng một mẫu đang hoạt động. */
  @Prop({ type: [{ type: Types.ObjectId, ref: Axis.name }], default: [], index: true })
  axisIds!: Types.ObjectId[];

  /**
   * Mẫu này là bộ cột của bảng "Danh mục điểm tiêu chí chung".
   *
   * Bảng tiêu chí là danh mục phẳng, không có trục để gán, nên chỗ móc bộ cột
   * là một cờ ở đây - vẫn đúng luật "một bảng đúng một mẫu đang hoạt động" như
   * trục, chỉ khác là bảng tiêu chí chỉ có một.
   */
  @Prop({ default: false, index: true })
  forCriteria!: boolean;

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
