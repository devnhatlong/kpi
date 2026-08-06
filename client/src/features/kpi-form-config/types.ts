export type ContentGroup = {
  _id: string;
  id?: string;
  code: string;
  name: string;
  description?: string;
  sortOrder: number;
  isActive: boolean;
};

export type ContentGroupInput = {
  code?: string;
  name: string;
  description?: string;
  sortOrder?: number;
  isActive?: boolean;
};

export type ContentGroupRef = {
  _id: string;
  code: string;
  name: string;
};

export type Axis = {
  _id: string;
  id?: string;
  code: string;
  name: string;
  description?: string;
  sortOrder: number;
  isActive: boolean;
};

export type AxisInput = {
  code?: string;
  name: string;
  description?: string;
  sortOrder?: number;
  isActive?: boolean;
};

export type AxisRef = {
  _id: string;
  code: string;
  name: string;
};

export type WorkContent = {
  _id: string;
  id?: string;
  code: string;
  name: string;
  description?: string;
  contentGroupId: string | ContentGroupRef;
  axisId: string | AxisRef;
  sortOrder: number;
  isActive: boolean;
};

export type WorkContentInput = {
  code?: string;
  name: string;
  description?: string;
  contentGroupId: string;
  axisId: string;
  sortOrder?: number;
  isActive?: boolean;
};

export type ScoreGroup = {
  _id: string;
  id?: string;
  code: string;
  name: string;
  description?: string;
  minScore: number;
  maxScore: number;
  maxInclusive: boolean;
  sortOrder: number;
  isActive: boolean;
  isSystem?: boolean;
};

export type ScoreGroupInput = {
  code?: string;
  name: string;
  description?: string;
  minScore: number;
  maxScore: number;
  maxInclusive?: boolean;
  sortOrder?: number;
  isActive?: boolean;
};

export const FORM_COLUMN_DATA_TYPES = [
  "text",
  "number",
  "date",
  "time",
  "datetime",
  "file",
  "auto_increment",
] as const;

export type FormColumnDataType = (typeof FORM_COLUMN_DATA_TYPES)[number];

export const FORM_COLUMN_DATA_TYPE_LABEL: Record<FormColumnDataType, string> = {
  text: "Văn bản",
  number: "Số",
  date: "Ngày",
  time: "Giờ",
  datetime: "Ngày giờ",
  file: "Tệp đính kèm",
  auto_increment: "Tự đánh số",
};

/**
 * Ý nghĩa cột - khai báo tường minh, không đoán theo tiêu đề.
 * Cột `custom` lưu vào fieldValues theo `key`.
 */
export const FORM_COLUMN_SEMANTICS = [
  "custom",
  "stt",
  "work_content",
  "task_title",
  "deadline",
  "product",
  "standard_score",
  "executing_unit",
  "progress_percent",
  "progress_self_score",
  "quality_percent",
  "quality_self_score",
  "note",
  "evidence_files",
] as const;

export type FormColumnSemantic = (typeof FORM_COLUMN_SEMANTICS)[number];

export const FORM_COLUMN_SEMANTIC_LABEL: Record<FormColumnSemantic, string> = {
  custom: "Cột tự do",
  stt: "STT",
  work_content: "Nội dung công việc",
  task_title: "Nhiệm vụ",
  deadline: "Thời hạn hoàn thành",
  product: "Sản phẩm dự kiến",
  standard_score: "Điểm chuẩn",
  executing_unit: "Đơn vị thực hiện",
  progress_percent: "KPI tiến độ %",
  progress_self_score: "Điểm tự chấm tiến độ",
  quality_percent: "KPI chất lượng %",
  quality_self_score: "Điểm tự chấm chất lượng",
  note: "Ghi chú",
  evidence_files: "Tài liệu kiểm chứng",
};

/** Semantic dùng để chấm điểm - thiếu thì luồng duyệt mất dữ liệu. */
export const SCORING_SEMANTICS: FormColumnSemantic[] = [
  "standard_score",
  "progress_percent",
  "progress_self_score",
  "quality_percent",
  "quality_self_score",
];

/** Kiểu dữ liệu mặc định theo ý nghĩa cột - vẫn đổi được khi cấu hình. */
export const SEMANTIC_DATA_TYPE: Partial<
  Record<FormColumnSemantic, FormColumnDataType>
> = {
  stt: "auto_increment",
  deadline: "date",
  standard_score: "number",
  progress_percent: "number",
  progress_self_score: "number",
  quality_percent: "number",
  quality_self_score: "number",
  evidence_files: "file",
};

const INPUT_DATA_TYPES: FormColumnDataType[] = [
  "text",
  "number",
  "date",
  "time",
  "datetime",
];

/**
 * Kiểu dữ liệu chọn được cho một cột.
 * STT luôn tự đánh số, Tài liệu kiểm chứng luôn là ô đính kèm - hai cột này
 * không phải ô nhập nên không đổi kiểu; còn lại chọn tự do.
 */
export function allowedDataTypes(
  semanticKey: FormColumnSemantic,
): FormColumnDataType[] {
  if (semanticKey === "stt") return ["auto_increment"];
  if (semanticKey === "evidence_files") return ["file"];
  return INPUT_DATA_TYPES;
}

export type FormHeaderGroup = {
  id: string;
  name: string;
  children: FormHeaderGroup[];
};

export type FormTemplateColumn = {
  id: string;
  key: string;
  title: string;
  /** Đường dẫn id nhóm header từ gốc xuống - rỗng = cột đứng riêng. */
  headerPath: string[];
  width: number;
  visible: boolean;
  dataType: FormColumnDataType;
  semanticKey: FormColumnSemantic;
  required: boolean;
};

export type FormTemplate = {
  _id: string;
  id?: string;
  code: string;
  name: string;
  description?: string;
  columns: FormTemplateColumn[];
  headerGroups: FormHeaderGroup[];
  axisIds: Array<AxisRef | string>;
  sortOrder: number;
  isActive: boolean;
};

export type FormTemplateInput = {
  code?: string;
  name: string;
  description?: string;
  columns: FormTemplateColumn[];
  headerGroups: FormHeaderGroup[];
  axisIds: string[];
  sortOrder?: number;
  isActive?: boolean;
};

export function localId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

/** Bộ cột mặc định - đúng bảng đang dùng ở form nhập nhiệm vụ. */
export function createDefaultTemplateDraft(): {
  columns: FormTemplateColumn[];
  headerGroups: FormHeaderGroup[];
} {
  const progressGroupId = "grp-progress";
  const qualityGroupId = "grp-quality";
  const column = (
    semanticKey: FormColumnSemantic,
    title: string,
    width: number,
    headerPath: string[] = [],
  ): FormTemplateColumn => ({
    id: localId("col"),
    key: semanticKey === "custom" ? localId("field") : semanticKey,
    title,
    headerPath,
    width,
    visible: true,
    dataType: SEMANTIC_DATA_TYPE[semanticKey] ?? "text",
    semanticKey,
    required: false,
  });

  return {
    headerGroups: [
      { id: progressGroupId, name: "Kết quả KPI tiến độ (B)", children: [] },
      { id: qualityGroupId, name: "Kết quả KPI chất lượng (C)", children: [] },
    ],
    columns: [
      column("stt", "STT", 60),
      column("work_content", "Nội dung công việc", 220),
      column("task_title", "Nhiệm vụ", 200),
      column("deadline", "Thời hạn hoàn thành", 140),
      column("product", "Sản phẩm dự kiến", 160),
      column("standard_score", "Điểm chuẩn", 100),
      column("executing_unit", "Đơn vị thực hiện", 140),
      column("progress_percent", "KPI tiến độ %", 100, [progressGroupId]),
      column("progress_self_score", "Điểm tự chấm", 110, [progressGroupId]),
      column("quality_percent", "KPI chất lượng %", 100, [qualityGroupId]),
      column("quality_self_score", "Điểm tự chấm", 110, [qualityGroupId]),
      column("note", "Ghi chú", 160),
      column("evidence_files", "Tài liệu kiểm chứng", 200),
    ],
  };
}

export type ListQueryParams = {
  page?: number;
  limit?: number;
  q?: string;
  all?: boolean;
};

export type PaginatedResult<T> = {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
};

export function entityId(
  value: { _id?: string; id?: string } | string,
): string {
  if (typeof value === "string") return value;
  return value._id ?? value.id ?? "";
}
