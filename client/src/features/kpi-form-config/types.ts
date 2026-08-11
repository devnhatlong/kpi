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

/** Mức chất lượng thực hiện - danh mục giá trị rời rạc (100%, 75%...). */
export type QualityLevel = {
  _id: string;
  id?: string;
  code: string;
  name: string;
  description?: string;
  percent: number;
  sortOrder: number;
  isActive: boolean;
  isSystem?: boolean;
};

export type QualityLevelInput = {
  code?: string;
  name: string;
  description?: string;
  percent: number;
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
  "boolean",
  "select",
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
  boolean: "Ô tích",
  select: "Chọn từ danh mục",
};

/**
 * Ánh xạ cột -> trường dữ liệu của hệ thống. Khai báo tường minh, không đoán
 * theo tiêu đề. Cột `custom` không ánh xạ, lưu vào fieldValues theo `key`.
 *
 * LUẬT: chỉ có mặt ở đây khi hệ thống thực sự làm gì đó khác với giá trị - lấy
 * từ danh mục, hoặc cần ô nhập không phải ô chữ. Cột chỉ lưu rồi hiện lại (thời
 * hạn, sản phẩm, điểm chuẩn, ghi chú...) để `custom`; gán ánh xạ cho nó cũng
 * không đổi được hành vi nào.
 */
export const FORM_COLUMN_SEMANTICS = [
  "custom",
  "stt",
  "work_content",
  "score_group",
  "quality_level",
] as const;

export type FormColumnSemantic = (typeof FORM_COLUMN_SEMANTICS)[number];

export const FORM_COLUMN_SEMANTIC_LABEL: Record<FormColumnSemantic, string> = {
  custom: "Không ánh xạ (nhập tự do)",
  stt: "STT",
  work_content: "Nội dung công việc",
  score_group: "Nhóm điểm",
  quality_level: "Chất lượng thực hiện",
};

/** Danh mục mà một cột lấy giá trị. */
export type ColumnCatalog = "work_content" | "score_group" | "quality_level";

/**
 * Ý nghĩa cột quyết định danh mục nguồn - khai một lần ở đây, cả màn cấu hình
 * lẫn form nhập đều đọc bảng này, không nơi nào đoán theo tiêu đề cột.
 */
export const SEMANTIC_CATALOG: Partial<
  Record<FormColumnSemantic, ColumnCatalog>
> = {
  work_content: "work_content",
  score_group: "score_group",
  quality_level: "quality_level",
};

export const CATALOG_LABEL: Record<ColumnCatalog, string> = {
  work_content: "Nội dung công việc",
  score_group: "Nhóm điểm",
  quality_level: "Chất lượng thực hiện",
};

export function catalogOfSemantic(
  semanticKey: FormColumnSemantic,
): ColumnCatalog | null {
  return SEMANTIC_CATALOG[semanticKey] ?? null;
}

/**
 * Bốn kiểu ánh xạ - quyết định người nhập nhiệm vụ sẽ thấy ô gì:
 * `free`    không ánh xạ, giá trị lưu vào fieldValues theo khoá riêng của cột;
 * `catalog` dropdown lấy từ danh mục đã cấu hình sẵn;
 * `system`  ô nhập tay nhưng đổ vào đúng trường hệ thống để chấm và thống kê;
 * `auto`    hệ thống tự điền, người nhập không sửa.
 */
export type SemanticKind = "free" | "catalog" | "system" | "auto";

export const SEMANTIC_KIND_LABEL: Record<SemanticKind, string> = {
  free: "Nhập tự do",
  catalog: "Chọn từ danh mục",
  system: "Trường hệ thống (nhập tay)",
  auto: "Hệ thống tự điền",
};

export const SEMANTIC_KIND_HINT: Record<SemanticKind, string> = {
  free: "Giá trị chỉ hiển thị lại trên báo cáo, không dùng để chấm hay thống kê.",
  catalog: "Người nhập chọn trong danh mục, không gõ được giá trị lạ.",
  system: "Người nhập tự gõ, giá trị vào đúng trường để chấm và tổng hợp.",
  auto: "Không cần nhập.",
};

const AUTO_SEMANTICS: FormColumnSemantic[] = ["stt"];

export function kindOfSemantic(semanticKey: FormColumnSemantic): SemanticKind {
  if (semanticKey === "custom") return "free";
  if (catalogOfSemantic(semanticKey)) return "catalog";
  if (AUTO_SEMANTICS.includes(semanticKey)) return "auto";
  return "system";
}

const SEMANTIC_KIND_ORDER: SemanticKind[] = [
  "free",
  "catalog",
  "system",
  "auto",
];

/** Danh sách ánh xạ gom theo kiểu - dùng để dựng dropdown có phân nhóm. */
export function semanticsByKind(): Array<{
  kind: SemanticKind;
  items: FormColumnSemantic[];
}> {
  return SEMANTIC_KIND_ORDER.map((kind) => ({
    kind,
    items: FORM_COLUMN_SEMANTICS.filter(
      (item) => kindOfSemantic(item) === kind,
    ),
  })).filter((group) => group.items.length > 0);
}

/** Kiểu dữ liệu mặc định theo ánh xạ cột - vẫn đổi được khi cấu hình. */
export const SEMANTIC_DATA_TYPE: Partial<
  Record<FormColumnSemantic, FormColumnDataType>
> = {
  stt: "auto_increment",
  score_group: "select",
  quality_level: "select",
};

const INPUT_DATA_TYPES: FormColumnDataType[] = [
  "text",
  "number",
  "date",
  "time",
  "datetime",
  "boolean",
  "file",
];

/**
 * Kiểu dữ liệu chọn được cho một cột.
 * STT luôn tự đánh số, cột gắn danh mục luôn là dropdown; còn lại chọn tự do.
 */
export function allowedDataTypes(
  semanticKey: FormColumnSemantic,
): FormColumnDataType[] {
  if (semanticKey === "stt") return ["auto_increment"];
  // Đổi cột danh mục sang ô nhập tay là mất ràng buộc với danh mục, người nhập
  // gõ được giá trị không tồn tại.
  if (catalogOfSemantic(semanticKey)) return ["select"];
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
  /**
   * Khoá cột Nhóm điểm quyết định dải điểm hợp lệ cho cột này.
   * Chỉ đặt được cho cột kiểu số; null = không giới hạn.
   */
  rangeFromColumnKey?: string | null;
};

/** Các cột Nhóm điểm trong mẫu - nguồn giới hạn cho cột điểm. */
export function scoreGroupColumns(
  columns: FormTemplateColumn[],
): FormTemplateColumn[] {
  return columns.filter((column) => column.semanticKey === "score_group");
}

/** Dải điểm của một nhóm, dạng chữ để hiện lên ô nhập. */
export function formatScoreRange(group: {
  minScore: number;
  maxScore: number;
  maxInclusive: boolean;
}): string {
  return `${group.minScore} → ${group.maxInclusive ? group.maxScore : `dưới ${group.maxScore}`}`;
}

/** Điểm có nằm trong dải của nhóm không - khớp đúng luật bên server. */
export function isScoreInGroupRange(
  score: number,
  group: { minScore: number; maxScore: number; maxInclusive: boolean },
): boolean {
  if (score < group.minScore) return false;
  return group.maxInclusive ? score <= group.maxScore : score < group.maxScore;
}

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

  /**
   * Cột không ánh xạ - chỉ lưu rồi hiện lại. Khoá đặt cố định thay vì sinh ngẫu
   * nhiên để mẫu tạo lần nào cũng ra cùng khoá, dữ liệu cũ khớp được.
   */
  const freeColumn = (
    key: string,
    title: string,
    width: number,
    dataType: FormColumnDataType = "text",
    headerPath: string[] = [],
  ): FormTemplateColumn => ({
    id: localId("col"),
    key,
    title,
    headerPath,
    width,
    visible: true,
    dataType,
    semanticKey: "custom",
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
      freeColumn("task_title", "Nhiệm vụ", 200),
      freeColumn("deadline", "Thời hạn hoàn thành", 140, "date"),
      freeColumn("product", "Sản phẩm dự kiến", 160),
      freeColumn("standard_score", "Điểm chuẩn", 100, "number"),
      freeColumn("executing_unit", "Đơn vị thực hiện", 140),
      freeColumn("progress_percent", "KPI tiến độ %", 100, "number", [
        progressGroupId,
      ]),
      freeColumn("progress_self_score", "Điểm tự chấm", 110, "number", [
        progressGroupId,
      ]),
      freeColumn("quality_percent", "KPI chất lượng %", 100, "number", [
        qualityGroupId,
      ]),
      freeColumn("quality_self_score", "Điểm tự chấm", 110, "number", [
        qualityGroupId,
      ]),
      freeColumn("note", "Ghi chú", 160),
      freeColumn("evidence_files", "Tài liệu kiểm chứng", 200),
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
