export type Axis = {
  _id: string;
  id?: string;
  code: string;
  name: string;
  description?: string;
  /** Điểm tối đa của trục - nhân với tỉ lệ hoàn thành ra dòng "Điểm quy đổi". */
  maxScore: number;
  sortOrder: number;
  isActive: boolean;
};

export type AxisInput = {
  code?: string;
  name: string;
  description?: string;
  maxScore?: number;
  sortOrder?: number;
  isActive?: boolean;
};

export type AxisRef = {
  _id: string;
  code: string;
  name: string;
};

/** Nhóm điểm đã populate - kèm dải điểm để hiện ngay cạnh tên. */
export type ScoreGroupRef = {
  _id: string;
  code: string;
  name: string;
  minScore?: number;
  maxScore?: number;
  maxInclusive?: boolean;
  formulaScore?: number | null;
};

export type WorkContent = {
  _id: string;
  id?: string;
  code: string;
  name: string;
  /** Cột "Nhiệm vụ" của bảng KPI - admin khai sẵn, cán bộ chỉ đọc. */
  description?: string;
  /** Cột "Ghi chú" của bảng KPI - admin khai sẵn (trần điểm của mục…). */
  note?: string;
  axisId: string | AxisRef;
  /** null ở bản ghi tạo trước khi có trường này - hiện "Chưa gán". */
  scoreGroupId?: string | ScoreGroupRef | null;
  sortOrder: number;
  isActive: boolean;
};

export type WorkContentInput = {
  code?: string;
  name: string;
  description?: string;
  note?: string;
  axisId: string;
  scoreGroupId: string;
  sortOrder?: number;
  isActive?: boolean;
};

/**
 * Tiêu chí chấm điểm chung - một dòng của bảng "Danh mục điểm tiêu chí chung".
 * Danh mục phẳng: không thuộc trục nào, admin khai sẵn cả câu chữ lẫn điểm tối
 * đa, người chấm chỉ điền kết quả.
 */
export type Criterion = {
  _id: string;
  id?: string;
  code: string;
  name: string;
  /** Cột "Ghi chú" của bảng tiêu chí - admin khai sẵn. */
  note?: string;
  /** Cột "Điểm tối đa" của dòng. */
  maxScore: number;
  sortOrder: number;
  isActive: boolean;
};

export type CriterionInput = {
  code?: string;
  name: string;
  note?: string;
  maxScore?: number;
  sortOrder?: number;
  isActive?: boolean;
};

/** Dòng "Tổng điểm" cuối bảng - tính trên mọi tiêu chí đang hoạt động. */
export type CriteriaSummary = {
  activeCount: number;
  totalMaxScore: number;
};

/** Nhiệm vụ khai sẵn theo nội dung công việc - form nhập chỉ chọn, không gõ. */
export type WorkTask = {
  _id: string;
  id?: string;
  code: string;
  /** Nguyên văn nhiệm vụ trong bảng KPI. */
  name: string;
  workContentId: string | WorkContentRef;
  /** Điểm chuẩn riêng; null = lấy nhóm điểm của nội dung công việc. */
  scoreGroupId?: string | ScoreGroupRef | null;
  note?: string;
  sortOrder: number;
  isActive: boolean;
};

export type WorkTaskInput = {
  code?: string;
  name: string;
  workContentId: string;
  scoreGroupId?: string | null;
  note?: string;
  sortOrder?: number;
  isActive?: boolean;
};

/** Nội dung công việc đã populate trong bản ghi nhiệm vụ. */
export type WorkContentRef = {
  _id: string;
  code: string;
  name: string;
  axisId?: string;
  scoreGroupId?: string | null;
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
  /** Điểm chuẩn dùng cho công thức; null = suy từ dải điểm. */
  formulaScore?: number | null;
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
  formulaScore?: number | null;
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
  /** Chọn từ danh mục Nhiệm vụ của nội dung công việc đang khai. */
  "work_task",
  /**
   * Ghi chú của mục, ADMIN khai sẵn ở danh mục Nội dung công việc - cán bộ chỉ
   * đọc. Không lưu theo từng nhiệm vụ: sửa danh mục là mọi bảng đổi theo.
   */
  "work_content_note",
  "score_group",
  "quality_level",
  /** Chọn từ danh mục Tiêu chí - cột "Tiêu chí / Nội dung" của bảng chấm. */
  "criterion",
  /** Ghi chú admin khai sẵn ở tiêu chí đang chọn. */
  "criterion_note",
  /** Điểm tối đa admin khai sẵn ở tiêu chí đang chọn - không ai gõ tay. */
  "criterion_max_score",
] as const;

export type FormColumnSemantic = (typeof FORM_COLUMN_SEMANTICS)[number];

export const FORM_COLUMN_SEMANTIC_LABEL: Record<FormColumnSemantic, string> = {
  custom: "Không ánh xạ (nhập tự do)",
  stt: "STT",
  work_content: "Nội dung công việc",
  work_task: "Nhiệm vụ (chọn từ danh mục)",
  work_content_note: "Ghi chú (nội dung công việc)",
  score_group: "Nhóm điểm",
  quality_level: "Chất lượng thực hiện",
  criterion: "Tiêu chí (chọn từ danh mục)",
  criterion_note: "Ghi chú (tiêu chí)",
  criterion_max_score: "Điểm tối đa (tiêu chí)",
};

/**
 * Cột đọc thẳng từ danh mục Nội dung công việc, cán bộ không nhập.
 * Không lưu theo từng nhiệm vụ: sửa danh mục là mọi bảng đã nhập đổi theo.
 */
export const CONTENT_TEXT_SEMANTICS: FormColumnSemantic[] = [
  "work_content_note",
  "criterion_note",
];

export function isContentTextSemantic(semanticKey: FormColumnSemantic) {
  return CONTENT_TEXT_SEMANTICS.includes(semanticKey);
}

/** Danh mục mà một cột lấy giá trị. */
export type ColumnCatalog =
  | "work_content"
  | "work_task"
  | "score_group"
  | "quality_level"
  | "criterion";

/**
 * Ý nghĩa cột quyết định danh mục nguồn - khai một lần ở đây, cả màn cấu hình
 * lẫn form nhập đều đọc bảng này, không nơi nào đoán theo tiêu đề cột.
 */
export const SEMANTIC_CATALOG: Partial<
  Record<FormColumnSemantic, ColumnCatalog>
> = {
  work_content: "work_content",
  work_task: "work_task",
  score_group: "score_group",
  quality_level: "quality_level",
  criterion: "criterion",
};

export const CATALOG_LABEL: Record<ColumnCatalog, string> = {
  work_content: "Nội dung công việc",
  work_task: "Nhiệm vụ",
  score_group: "Nhóm điểm",
  quality_level: "Chất lượng thực hiện",
  criterion: "Tiêu chí chấm điểm",
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
export type SemanticKind = "free" | "catalog" | "content" | "system" | "auto";

export const SEMANTIC_KIND_LABEL: Record<SemanticKind, string> = {
  free: "Nhập tự do",
  catalog: "Chọn từ danh mục",
  content: "Admin khai sẵn ở danh mục",
  system: "Trường hệ thống (nhập tay)",
  auto: "Hệ thống tự điền",
};

export const SEMANTIC_KIND_HINT: Record<SemanticKind, string> = {
  free: "Giá trị chỉ hiển thị lại trên báo cáo, không dùng để chấm hay thống kê.",
  catalog: "Người nhập chọn trong danh mục, không gõ được giá trị lạ.",
  content:
    "Chữ khai một lần ở danh mục (Nội dung công việc / Tiêu chí) rồi in ra mọi bảng; người nhập chỉ đọc, không gõ lại.",
  system: "Người nhập tự gõ, giá trị vào đúng trường để chấm và tổng hợp.",
  auto: "Không cần nhập.",
};

/*
  Cột hệ thống tự điền. "Điểm tối đa (tiêu chí)" nằm đây chứ không nằm nhóm
  "Admin khai sẵn": cùng là giá trị lấy từ danh mục, nhưng nó là SỐ - phải giữ
  kiểu số thì dòng Tổng điểm cuối bảng mới cộng được.
*/
const AUTO_SEMANTICS: FormColumnSemantic[] = ["stt", "criterion_max_score"];

export function kindOfSemantic(semanticKey: FormColumnSemantic): SemanticKind {
  if (semanticKey === "custom") return "free";
  if (catalogOfSemantic(semanticKey)) return "catalog";
  // Nhóm riêng: cùng lấy từ danh mục nhưng admin khai, không phải cán bộ chọn.
  if (isContentTextSemantic(semanticKey)) return "content";
  if (AUTO_SEMANTICS.includes(semanticKey)) return "auto";
  return "system";
}

const SEMANTIC_KIND_ORDER: SemanticKind[] = [
  "free",
  "catalog",
  "content",
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
  work_content_note: "text",
  score_group: "select",
  quality_level: "select",
  criterion: "select",
  criterion_note: "text",
  criterion_max_score: "number",
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
  // Điểm tối đa chép từ tiêu chí - đổi sang kiểu khác là dòng Tổng điểm hết cộng.
  if (semanticKey === "criterion_max_score") return ["number"];
  // Nhiệm vụ / Ghi chú là đoạn chữ admin đã khai - không có kiểu nào khác.
  if (isContentTextSemantic(semanticKey)) return ["text"];
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

export const FORM_COLUMN_AUTO_KINDS = ["percent_of"] as const;

export type FormColumnAutoKind = (typeof FORM_COLUMN_AUTO_KINDS)[number];

/**
 * Cột số tự lấy giá trị thay vì để người nhập gõ - trỏ tới cột khác BẰNG KHOÁ
 * CỘT, không suy theo nhóm header.
 *
 * Nhóm header chỉ để gộp ô cho dễ đọc; buộc công thức vào nó thì đổi bố cục
 * bảng là đổi luôn phép tính. Cùng lý do với `rangeFromColumnKey`.
 */
export type FormColumnAutoValue = {
  kind: FormColumnAutoKind;
  /** Khoá cột Chất lượng thực hiện cho phần trăm. */
  percentColumnKey: string;
  /** Khoá cột điểm gốc đem nhân với phần trăm. */
  baseColumnKey: string;
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
   * Khoá cột quyết định dải điểm hợp lệ cho cột này - trỏ tới cột Nhóm điểm
   * (lấy dải min-max của nhóm) hoặc cột Điểm tối đa (tiêu chí) (điểm phải nằm
   * trong 0 - điểm tối đa của tiêu chí ở cùng dòng).
   * Chỉ đặt được cho cột kiểu số; null = không giới hạn.
   */
  rangeFromColumnKey?: string | null;
  /** Cột tự tính; null = người nhập tự gõ. */
  autoValue?: FormColumnAutoValue | null;
};

/** Các cột Nhóm điểm trong mẫu - nguồn giới hạn cho cột điểm. */
export function scoreGroupColumns(
  columns: FormTemplateColumn[],
): FormTemplateColumn[] {
  return columns.filter((column) => column.semanticKey === "score_group");
}

/**
 * Cột có thể làm trần cho một cột điểm.
 *
 * Hai nguồn, cùng một ý "điểm nhập không được vượt mức đã định":
 * - Nhóm điểm: điểm phải nằm trong dải min-max của nhóm được chọn;
 * - Điểm tối đa (tiêu chí): điểm đạt phải ≤ điểm tối đa của tiêu chí cùng dòng.
 */
export function rangeSourceColumns(
  columns: FormTemplateColumn[],
): FormTemplateColumn[] {
  return columns.filter(
    (column) =>
      column.semanticKey === "score_group" ||
      column.semanticKey === "criterion_max_score",
  );
}

/** Các cột Chất lượng thực hiện - nguồn phần trăm cho cột tự tính. */
export function qualityLevelColumns(
  columns: FormTemplateColumn[],
): FormTemplateColumn[] {
  return columns.filter((column) => column.semanticKey === "quality_level");
}

/** Cột số nhập tay - ứng viên làm điểm gốc cho cột tự tính. */
export function plainNumberColumns(
  columns: FormTemplateColumn[],
): FormTemplateColumn[] {
  return columns.filter(
    (column) => column.dataType === "number" && !column.autoValue,
  );
}

/**
 * Giá trị của một ô tự tính, null khi thiếu đầu vào.
 *
 * Phải khớp từng chữ với `computeAutoValue` bên server - client chỉ hiện trước
 * cho người nhập thấy, con số lưu lại là do server tính.
 *
 * Thiếu đầu vào thì trả null chứ KHÔNG trả 0: ô hiện 0 đọc ra thành "đã chấm 0
 * điểm", khác hẳn nghĩa "chưa chấm".
 */
export function computeAutoValue(
  kind: FormColumnAutoKind,
  percent: number | null,
  base: number | null,
): number | null {
  if (kind !== "percent_of") return null;
  if (percent === null || base === null) return null;
  if (!Number.isFinite(percent) || !Number.isFinite(base)) return null;
  return Math.round((percent / 100) * base * 10000) / 10000;
}

/** Dải điểm của một nhóm, dạng chữ để hiện lên ô nhập. */
export function formatScoreRange(group: {
  minScore: number;
  maxScore: number;
  maxInclusive: boolean;
}): string {
  return `${group.minScore} → ${group.maxInclusive ? group.maxScore : `dưới ${group.maxScore}`}`;
}

/**
 * Điểm chuẩn suy ra từ dải khi nhóm không khai `formulaScore`.
 *
 * Dải hở ("0 → dưới 50") thì trần thật là 49, phải lùi một điểm. Phép lùi này
 * giả định chấm theo điểm nguyên - khai `formulaScore` tường minh để khỏi phụ
 * thuộc vào giả định đó.
 */
export function derivedFormulaScore(
  maxScore: number,
  maxInclusive: boolean,
): number {
  return maxInclusive ? maxScore : maxScore - 1;
}

/**
 * Điểm chuẩn của một nhóm dùng cho công thức tính điểm trục.
 * Khai tường minh thì lấy nguyên, bỏ trống thì suy từ dải.
 */
export function effectiveMaxScore(group: {
  maxScore: number;
  maxInclusive: boolean;
  formulaScore?: number | null;
}): number {
  return (
    group.formulaScore ??
    derivedFormulaScore(group.maxScore, group.maxInclusive)
  );
}

/** Điểm có nằm trong dải của nhóm không - khớp đúng luật bên server. */
export function isScoreInGroupRange(
  score: number,
  group: { minScore: number; maxScore: number; maxInclusive: boolean },
): boolean {
  if (score < group.minScore) return false;
  return group.maxInclusive ? score <= group.maxScore : score < group.maxScore;
}

/**
 * Ba dòng cuối bảng của mỗi trục: "Tổng từng cột", "Tổng điểm trục" và
 * "Điểm quy đổi". Khuôn công thức cố định, cấu hình chỉ chọn cột đóng vai nào:
 *   tổng điểm trục = trung bình cộng của (Σ tử số i / Σ mẫu số)
 *   điểm quy đổi   = tổng điểm trục × điểm max của trục
 *
 * Cột nào được cộng ở dòng "Tổng từng cột" suy ra từ dataType = number, không
 * khai lại ở đây.
 */
/**
 * Cách quy ra điểm trục.
 * - `ratio`  : trung bình cộng của (Σ tử số / Σ mẫu số), rồi × điểm tối đa trục.
 *              Đây là khuôn chung của các trục chấm theo tỉ lệ hoàn thành.
 * - `sum`    : CỘNG THẲNG điểm của các cột đã khai, chặn ở điểm tối đa trục.
 *              Dành cho trục chấm theo mục Đạt / Không đạt - mỗi mục có điểm
 *              chuẩn riêng, cộng lại đúng bằng trần của trục, không có tỉ lệ
 *              nào để chia.
 */
export const FORM_FOOTER_MODES = ["ratio", "sum"] as const;
export type FormFooterMode = (typeof FORM_FOOTER_MODES)[number];

export const FORM_FOOTER_MODE_LABEL: Record<FormFooterMode, string> = {
  ratio: "Theo tỉ lệ (Σ tử số ÷ Σ mẫu số)",
  sum: "Cộng dồn điểm các mục",
};

export type FormTemplateFooter = {
  enabled: boolean;
  /** Bỏ trống = "ratio", để mẫu cũ giữ nguyên cách tính. */
  mode?: FormFooterMode;
  /** Khoá cột mẫu số - "Điểm chuẩn" trong bảng mẫu. Chế độ cộng dồn không cần. */
  baseColumnKey: string | null;
  /** Khoá các cột tử số (chế độ cộng dồn: các cột đem cộng), theo thứ tự. */
  ratioColumnKeys: string[];
};

export const EMPTY_FORM_TEMPLATE_FOOTER: FormTemplateFooter = {
  enabled: false,
  mode: "ratio",
  baseColumnKey: null,
  ratioColumnKeys: [],
};

/** Mẫu cũ chưa có `mode` thì vẫn là công thức tỉ lệ. */
export function footerMode(footer?: FormTemplateFooter | null): FormFooterMode {
  return footer?.mode === "sum" ? "sum" : "ratio";
}

/**
 * Cột gán được vào công thức, kèm con số mà cột đó đóng góp.
 *
 * Không phải cứ `dataType = number` mới cộng được: cột Điểm chuẩn là dropdown
 * Nhóm điểm, giá trị dùng để tính là điểm tối đa của nhóm được chọn. Tương tự
 * cột Chất lượng thực hiện góp phần trăm của mức được chọn.
 */
export type FormulaValueSource =
  "number" | "score_group_max" | "quality_percent";

export const FORMULA_VALUE_SOURCE_HINT: Record<FormulaValueSource, string> = {
  number: "lấy đúng số đã nhập",
  score_group_max:
    "lấy điểm cao nhất đạt được của nhóm (dải hở thì lùi 1 điểm)",
  quality_percent: "lấy phần trăm của mức chất lượng được chọn",
};

export function formulaValueSource(
  column: FormTemplateColumn,
): FormulaValueSource | null {
  if (column.semanticKey === "score_group") return "score_group_max";
  if (column.semanticKey === "quality_level") return "quality_percent";
  if (column.dataType === "number") return "number";
  return null;
}

/** Cột đưa được vào công thức - cột chữ, ngày, tệp thì không cộng chia gì được. */
export function formulaColumns(
  columns: FormTemplateColumn[],
): FormTemplateColumn[] {
  return columns.filter((column) => formulaValueSource(column) !== null);
}

/** Nhãn A, B, C… cho các vai trong công thức - chỉ để hiển thị. */
export function formulaRoleLabel(index: number): string {
  return String.fromCharCode(66 + index); // 0 -> B, 1 -> C, ...
}

export type FormTemplate = {
  _id: string;
  id?: string;
  code: string;
  name: string;
  description?: string;
  columns: FormTemplateColumn[];
  headerGroups: FormHeaderGroup[];
  footer?: FormTemplateFooter;
  axisIds: Array<AxisRef | string>;
  /** Mẫu này là bộ cột của bảng tiêu chí chung - chỉ một mẫu được nhận vai. */
  forCriteria?: boolean;
  sortOrder: number;
  isActive: boolean;
};

export type FormTemplateInput = {
  code?: string;
  name: string;
  description?: string;
  columns: FormTemplateColumn[];
  headerGroups: FormHeaderGroup[];
  footer?: FormTemplateFooter;
  axisIds: string[];
  forCriteria?: boolean;
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
  footer: FormTemplateFooter;
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
    /**
     * Tỉ lệ lấy theo cột điểm tự chấm chứ không phải cột phần trăm: chia điểm
     * cho điểm chuẩn mới ra tỉ lệ, chia phần trăm cho điểm chuẩn thì vô nghĩa.
     * Đổi được ở phần cấu hình công thức nếu đơn vị quy định khác.
     */
    footer: {
      enabled: true,
      baseColumnKey: "standard_score",
      ratioColumnKeys: ["progress_self_score", "quality_self_score"],
    },
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

/**
 * Một mục trong "Thư viện trường" - bấm hoặc kéo vào canvas là ra một cột mới.
 *
 * Preset KHÔNG đẻ ra hành vi mới: mỗi mục chỉ là một cặp (ánh xạ, kiểu dữ liệu)
 * đã có sẵn, đặt tên theo cách người cấu hình gọi nó trong biểu mẫu. Muốn thêm
 * mục thì phải có ánh xạ tương ứng ở FORM_COLUMN_SEMANTICS trước.
 */
export type FieldPreset = {
  id: string;
  label: string;
  hint: string;
  semanticKey: FormColumnSemantic;
  dataType: FormColumnDataType;
  width: number;
  /**
   * Khoá cố định cho cột không ánh xạ - dựng lại mẫu vẫn khớp dữ liệu đã nhập.
   * Bỏ trống thì sinh khoá ngẫu nhiên như cột tự do bình thường.
   */
  key?: string;
  /** Tiêu đề gợi ý sẵn, người cấu hình sửa lại được. */
  title: string;
};

export const FIELD_PRESET_GROUPS: Array<{
  kind: SemanticKind;
  items: FieldPreset[];
}> = [
  {
    kind: "free",
    items: [
      {
        id: "short_text",
        label: "Văn bản ngắn",
        hint: "Ô gõ chữ một dòng",
        title: "Nội dung",
        semanticKey: "custom",
        dataType: "text",
        width: 200,
      },
      {
        id: "number",
        label: "Điểm chuẩn",
        hint: "Ô nhập số, cộng được ở dòng tổng",
        title: "Điểm chuẩn",
        key: "standard_score",
        semanticKey: "custom",
        dataType: "number",
        width: 110,
      },
      {
        id: "percent",
        label: "Tỷ lệ hoàn thành",
        hint: "Ô nhập số phần trăm",
        title: "Tỷ lệ hoàn thành",
        semanticKey: "custom",
        dataType: "number",
        width: 120,
      },
      {
        id: "date",
        label: "Ngày hoàn thành",
        hint: "Ô chọn ngày",
        title: "Thời hạn hoàn thành",
        key: "deadline",
        semanticKey: "custom",
        dataType: "date",
        width: 140,
      },
      {
        id: "boolean",
        label: "Ô tích Đạt / Không đạt",
        hint: "Ô tích hai trạng thái",
        title: "Đạt",
        semanticKey: "custom",
        dataType: "boolean",
        width: 90,
      },
      {
        id: "file",
        label: "Tài liệu kiểm chứng",
        hint: "Ô đính kèm tệp",
        title: "Tài liệu kiểm chứng",
        key: "evidence_files",
        semanticKey: "custom",
        dataType: "file",
        width: 200,
      },
    ],
  },
  {
    kind: "catalog",
    items: [
      {
        id: "work_content",
        label: "Nội dung công việc",
        hint: "Dropdown danh mục Nội dung công việc",
        title: "Nội dung công việc",
        semanticKey: "work_content",
        dataType: "select",
        width: 220,
      },
      {
        id: "work_task",
        label: "Nhiệm vụ",
        hint: "Dropdown nhiệm vụ của nội dung đang khai",
        title: "Nhiệm vụ",
        semanticKey: "work_task",
        dataType: "select",
        width: 200,
      },
      {
        id: "score_group",
        label: "Nhóm điểm",
        hint: "Dropdown danh mục Nhóm điểm",
        title: "Nhóm điểm",
        semanticKey: "score_group",
        dataType: "select",
        width: 140,
      },
      {
        id: "quality_level",
        label: "Chất lượng thực hiện",
        hint: "Dropdown mức 100 / 75 / 50 / 25 / 0%",
        title: "Chất lượng thực hiện",
        semanticKey: "quality_level",
        dataType: "select",
        width: 160,
      },
      {
        id: "criterion",
        label: "Tiêu chí chấm điểm",
        hint: "Dropdown danh mục Tiêu chí chung",
        title: "Tiêu chí / Nội dung",
        semanticKey: "criterion",
        dataType: "select",
        width: 240,
      },
    ],
  },
  {
    kind: "content",
    items: [
      {
        id: "work_content_note",
        label: "Ghi chú nội dung công việc",
        hint: "Chữ admin khai sẵn ở danh mục",
        title: "Ghi chú",
        semanticKey: "work_content_note",
        dataType: "text",
        width: 180,
      },
      {
        id: "criterion_note",
        label: "Ghi chú tiêu chí",
        hint: "Chữ admin khai sẵn ở tiêu chí",
        title: "Ghi chú",
        semanticKey: "criterion_note",
        dataType: "text",
        width: 180,
      },
    ],
  },
  {
    kind: "auto",
    items: [
      {
        id: "stt",
        label: "STT",
        hint: "Hệ thống tự đánh số dòng",
        title: "STT",
        semanticKey: "stt",
        dataType: "auto_increment",
        width: 60,
      },
      {
        id: "criterion_max_score",
        label: "Điểm tối đa tiêu chí",
        hint: "Số lấy từ tiêu chí đang chọn",
        title: "Điểm tối đa",
        semanticKey: "criterion_max_score",
        dataType: "number",
        width: 110,
      },
    ],
  },
];

/** Cột mới dựng từ một mục thư viện trường. */
export function columnFromPreset(preset: FieldPreset): FormTemplateColumn {
  return {
    id: localId("col"),
    key: preset.key ?? (preset.semanticKey === "custom"
      ? localId("field")
      : preset.semanticKey),
    title: preset.title,
    headerPath: [],
    width: preset.width,
    visible: true,
    dataType: preset.dataType,
    semanticKey: preset.semanticKey,
    required: false,
    rangeFromColumnKey: null,
    autoValue: null,
  };
}

/**
 * Phạm vi đơn vị áp dụng mẫu. Thứ tự ưu tiên khi một đơn vị khớp nhiều mẫu:
 * `by_department` > `by_level` > `all` - mẫu riêng của đơn vị đè mẫu của cấp,
 * mẫu của cấp đè mẫu dùng chung. Nhờ vậy một năm có nhiều mẫu áp dụng song song
 * mà vẫn xác định được đơn vị nào dùng bản nào.
 */
export const REPORT_SCOPE_TYPES = ["all", "by_level", "by_department"] as const;
export type ReportScopeType = (typeof REPORT_SCOPE_TYPES)[number];

export const REPORT_SCOPE_TYPE_LABEL: Record<ReportScopeType, string> = {
  all: "Toàn hệ thống",
  by_level: "Theo cấp đơn vị",
  by_department: "Đơn vị chỉ định",
};

export const REPORT_SCOPE_TYPE_HINT: Record<ReportScopeType, string> = {
  all: "Mọi đơn vị chưa có mẫu riêng đều dùng bản này.",
  by_level: "Áp cho mọi đơn vị thuộc các cấp đã chọn (Phòng, Xã, Đội…).",
  by_department:
    "Áp đúng các đơn vị đã chọn; bật thừa kế thì cấp dưới của chúng dùng theo.",
};

/** Cấp đơn vị đã populate trong mẫu báo cáo. */
export type DepartmentLevelRef = {
  _id: string;
  code: string;
  name: string;
  rank?: number;
};

/** Đơn vị đã populate trong mẫu báo cáo. */
export type DepartmentRef = {
  _id: string;
  code: string;
  name: string;
};

/**
 * Hai phần lớn của biểu mẫu báo cáo, đúng như bản Excel đang dùng:
 *   A. DANH MỤC ĐIỂM TIÊU CHÍ CHUNG   - một bảng duy nhất
 *   B. DANH MỤC NHIỆM VỤ CÔNG TÁC     - bọc các trục, đánh số 1., 2., 3.…
 *
 * Trục KHÔNG đứng ngang hàng với A: nó là mục con trong phần B, nên số thứ tự
 * của trục đếm riêng trong B chứ không nối tiếp chữ cái phần.
 */
export const REPORT_SECTION_A_TITLE = "Danh mục điểm tiêu chí chung";
export const REPORT_SECTION_B_TITLE = "Danh mục nhiệm vụ công tác";

/**
 * Điểm đạt của một dòng khối A có hợp lệ không - trả câu lỗi, hoặc null.
 *
 * Nhận CHUỖI thô đang gõ chứ không nhận số: ô để trống nghĩa là chưa chấm, khác
 * hẳn 0 điểm, mà số thì không diễn tả được "chưa chấm". Server chặn cùng một
 * luật; đây là để báo ngay lúc gõ thay vì đợi tới lúc lưu.
 *
 * KHÔNG tự cắt về trần: đang gõ "54" thì ký tự "5" hợp lệ, cắt ngay là người
 * dùng không gõ nổi số có hai chữ số. Cứ để gõ, và bôi đỏ.
 */
export function criterionScoreError(
  raw: string,
  maxScore: number,
): string | null {
  const text = raw.trim();
  if (!text) return null;
  const value = Number(text.replace(",", "."));
  if (!Number.isFinite(value)) return "Điểm phải là một con số.";
  if (value < 0) return "Điểm không được âm.";
  if (value > maxScore) return `Vượt điểm tối đa (${maxScore}).`;
  return null;
}

export const REPORT_TEMPLATE_STATUSES = ["draft", "applied"] as const;
export type ReportTemplateStatus = (typeof REPORT_TEMPLATE_STATUSES)[number];

export const REPORT_TEMPLATE_STATUS_LABEL: Record<
  ReportTemplateStatus,
  string
> = {
  draft: "Đang cấu hình",
  applied: "Đã áp dụng",
};

/**
 * Mẫu báo cáo của một năm - bản ghép các khối nội dung thành biểu mẫu thật.
 * Bộ cột của từng trục nằm ở FormTemplate; ở đây chỉ khai năm nay dùng khối nào.
 */
export type ReportTemplate = {
  _id: string;
  id?: string;
  code: string;
  name: string;
  description?: string;
  year: number;
  includeCriteria: boolean;
  /** Theo thứ tự khối B.1, B.2… trên báo cáo. */
  axisIds: Array<AxisRef | string>;
  scopeType: ReportScopeType;
  /** Chỉ dùng khi scopeType = by_level. */
  levelIds: Array<DepartmentLevelRef | string>;
  /** Chỉ dùng khi scopeType = by_department. */
  departmentIds: Array<DepartmentRef | string>;
  /** Đơn vị con cháu dùng theo mẫu của đơn vị cha. */
  includeDescendants: boolean;
  status: ReportTemplateStatus;
  /** Giờ server lúc áp dụng; null = chưa áp dụng lần nào. */
  appliedAt?: string | null;
  sortOrder: number;
  isActive: boolean;
};

export type ReportTemplateInput = {
  code?: string;
  name: string;
  description?: string;
  year?: number;
  includeCriteria?: boolean;
  axisIds: string[];
  scopeType?: ReportScopeType;
  levelIds?: string[];
  departmentIds?: string[];
  includeDescendants?: boolean;
  sortOrder?: number;
  isActive?: boolean;
};

/** Đơn vị khớp mẫu qua đường nào - màn nhập đọc để nói rõ đang dùng mẫu của ai. */
export type ReportScopeSource = "department" | "level" | "all" | "fallback";

export const REPORT_SCOPE_SOURCE_LABEL: Record<ReportScopeSource, string> = {
  department: "mẫu riêng của đơn vị",
  level: "mẫu của cấp đơn vị",
  all: "mẫu dùng chung",
  fallback: "chưa gán mẫu",
};

/** Kết quả tra mẫu áp dụng cho một đơn vị. */
export type ResolvedReportScope = {
  year: number;
  departmentId: string | null;
  source: ReportScopeSource;
  /** null = chưa mẫu nào phủ đơn vị này; `axes` khi đó là toàn bộ trục. */
  template: ReportTemplate | null;
  includeCriteria: boolean;
  axes: Axis[];
};

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
