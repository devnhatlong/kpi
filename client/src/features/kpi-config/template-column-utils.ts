import dayjs from "dayjs";
import {
  getAutoIncrementValue,
  isAutoIncrementColumn,
  type KpiTemplate,
  type TaskAssignment,
  type TemplateColumn,
  type TemplateHeaderGroup,
} from "./types";

export const CALCULATED_INPUT = "CALCULATED";

export function isTemplateColumnRequired(column: TemplateColumn): boolean {
  if (isAutoIncrementColumn(column)) return false;
  if (column.inputRoleCode === CALCULATED_INPUT) return false;
  return column.required === true;
}

type SemanticField =
  | "content_name"
  | "task_title"
  | "assignee"
  | "due_date"
  | "report_due_date"
  | "product"
  | "actual_product"
  | "standard_score"
  | "self_progress_percent"
  | "self_progress_score"
  | "self_quality_percent"
  | "self_quality_score"
  | "proposed_adjustment"
  | "proposed_adjustment_reason"
  | "appraisal_progress_percent"
  | "appraisal_progress_score"
  | "appraisal_quality_percent"
  | "appraisal_quality_score"
  | "note";

const NUMERIC_SEMANTIC_FIELDS = new Set<SemanticField>([
  "standard_score",
  "self_progress_percent",
  "self_progress_score",
  "self_quality_percent",
  "self_quality_score",
  "proposed_adjustment",
  "appraisal_progress_percent",
  "appraisal_progress_score",
  "appraisal_quality_percent",
  "appraisal_quality_score",
]);

/** Cột số theo cấu hình, hoặc semantic điểm/% (kể cả khi lỡ để Văn bản). */
export function isNumericTemplateColumn(
  column: TemplateColumn,
  template: KpiTemplate | null = null,
): boolean {
  if (column.dataType === "number") return true;
  if (!template) return false;
  const semantic = inferSemanticField(column, template.headerGroups);
  return semantic != null && NUMERIC_SEMANTIC_FIELDS.has(semantic);
}

function resolvePathLabels(
  groups: TemplateHeaderGroup[],
  path: string[],
): string[] {
  const names: string[] = [];
  let current = groups;
  for (const id of path) {
    const node = current.find((group) => group.id === id);
    if (!node) break;
    names.push(node.name);
    current = node.children;
  }
  return names;
}

function columnContext(
  column: TemplateColumn,
  headerGroups: TemplateHeaderGroup[],
): string {
  return [...resolvePathLabels(headerGroups, column.headerPath), column.title]
    .join(" ")
    .toLowerCase();
}

function inferSemanticField(
  column: TemplateColumn,
  headerGroups: TemplateHeaderGroup[],
): SemanticField | null {
  if (isAutoIncrementColumn(column)) return null;
  const context = columnContext(column, headerGroups);
  const title = column.title.trim().toLowerCase();

  if (title.includes("nội dung công việc")) return "content_name";
  if (title === "nhiệm vụ" || title.includes("nhiệm vụ cụ thể")) {
    return "task_title";
  }
  if (title.includes("người thực hiện")) return "assignee";
  if (title.includes("thời hạn hoàn thành")) return "due_date";
  if (title.includes("hạn báo cáo")) return "report_due_date";
  if (title.includes("sản phẩm dự kiến")) return "product";
  if (title.includes("sản phẩm sau")) return "actual_product";
  if (title.includes("điểm chuẩn")) return "standard_score";
  if (title.includes("ghi chú")) return "note";
  if (context.includes("đề nghị cộng")) return "proposed_adjustment";
  if (context.includes("lý do đề nghị")) {
    return "proposed_adjustment_reason";
  }

  if (context.includes("thực tế hoàn thành") && context.includes("tiến độ")) {
    return context.includes("thẩm") || context.includes("pv01")
      ? "appraisal_progress_percent"
      : "self_progress_percent";
  }
  if (
    (title.includes("điểm tự chấm") || title.includes("điểm thẩm định")) &&
    context.includes("tiến độ")
  ) {
    return context.includes("thẩm") || context.includes("pv01")
      ? "appraisal_progress_score"
      : "self_progress_score";
  }
  if (context.includes("thực tế hoàn thành") && context.includes("chất lượng")) {
    return context.includes("thẩm") || context.includes("pv01")
      ? "appraisal_quality_percent"
      : "self_quality_percent";
  }
  if (
    (title.includes("điểm tự chấm") || title.includes("điểm thẩm định")) &&
    context.includes("chất lượng")
  ) {
    return context.includes("thẩm") || context.includes("pv01")
      ? "appraisal_quality_score"
      : "self_quality_score";
  }

  return null;
}

export type TaskValueSource = {
  contentName: string;
  assigneeName: string;
  title: string;
  description: string;
  dueDate?: string;
  reportDueDate?: string;
  product: string;
  actualProduct?: string;
  standardScore?: number;
  selfProgressPercent?: number;
  selfProgressScore?: number;
  selfQualityPercent?: number;
  selfQualityScore?: number;
  proposedAdjustment?: number;
  proposedAdjustmentReason?: string;
  appraisalProgressPercent?: number;
  appraisalProgressScore?: number;
  appraisalQualityPercent?: number;
  appraisalQualityScore?: number;
  note?: string;
};

function readSemanticValue(
  field: SemanticField,
  source: TaskValueSource,
): string | number | undefined {
  switch (field) {
    case "content_name":
      return source.contentName;
    case "task_title":
      return source.title;
    case "assignee":
      return source.assigneeName;
    case "due_date":
      return source.dueDate
        ? dayjs(source.dueDate).format("DD/MM/YYYY")
        : undefined;
    case "report_due_date":
      return source.reportDueDate
        ? dayjs(source.reportDueDate).format("DD/MM/YYYY")
        : undefined;
    case "product":
      return source.product;
    case "actual_product":
      return source.actualProduct;
    case "standard_score":
      return source.standardScore;
    case "self_progress_percent":
      return source.selfProgressPercent;
    case "self_progress_score":
      return source.selfProgressScore;
    case "self_quality_percent":
      return source.selfQualityPercent;
    case "self_quality_score":
      return source.selfQualityScore;
    case "proposed_adjustment":
      return source.proposedAdjustment;
    case "proposed_adjustment_reason":
      return source.proposedAdjustmentReason;
    case "appraisal_progress_percent":
      return source.appraisalProgressPercent;
    case "appraisal_progress_score":
      return source.appraisalProgressScore;
    case "appraisal_quality_percent":
      return source.appraisalQualityPercent;
    case "appraisal_quality_score":
      return source.appraisalQualityScore;
    case "note":
      return source.note;
    default:
      return undefined;
  }
}

export function taskValueSourceFromAssignment(
  task: TaskAssignment,
  contentName: string,
): TaskValueSource {
  return {
    contentName,
    assigneeName:
      typeof task.assigneeId === "object" && task.assigneeId
        ? task.assigneeId.fullName || task.assigneeId.username || ""
        : "",
    title: task.title,
    description: task.description ?? "",
    dueDate: task.dueDate,
    reportDueDate: task.reportDueDate,
    product: task.product,
    actualProduct: task.actualProduct,
    standardScore: task.standardScore,
    selfProgressPercent: task.selfProgressPercent,
    selfProgressScore: task.selfProgressScore,
    selfQualityPercent: task.selfQualityPercent,
    selfQualityScore: task.selfQualityScore,
    proposedAdjustment: task.proposedAdjustment,
    proposedAdjustmentReason: task.proposedAdjustmentReason,
    appraisalProgressPercent: task.appraisalProgressPercent,
    appraisalProgressScore: task.appraisalProgressScore,
    appraisalQualityPercent: task.appraisalQualityPercent,
    appraisalQualityScore: task.appraisalQualityScore,
    note: task.note,
  };
}

export function buildFieldValuesFromTemplate(
  template: KpiTemplate | null,
  source: TaskValueSource,
  existing: Record<string, string | number> = {},
): Record<string, string | number> {
  if (!template) return existing;
  const next = { ...existing };

  for (const column of template.columns) {
    const semantic = inferSemanticField(column, template.headerGroups);
    if (!semantic) continue;
    if (semantic === "due_date" && source.dueDate) {
      next[column.key] = temporalInputValue(column, String(source.dueDate));
      continue;
    }
    if (semantic === "report_due_date" && source.reportDueDate) {
      next[column.key] = temporalInputValue(
        column,
        String(source.reportDueDate),
      );
      continue;
    }
    const value = readSemanticValue(semantic, source);
    if (value == null || value === "") continue;
    // Không ghi sẵn 0 mặc định schema khi user chưa nhập.
    if (
      typeof value === "number" &&
      value === 0 &&
      !(column.key in existing) &&
      (semantic === "standard_score" || semantic === "proposed_adjustment")
    ) {
      continue;
    }
    next[column.key] = value;
  }

  return next;
}

const DIALOG_MANAGED_FIELDS = new Set<SemanticField>([
  "content_name",
  "task_title",
  "assignee",
  "due_date",
  "report_due_date",
  "product",
  "standard_score",
]);

function columnMatchesUserRole(
  column: TemplateColumn,
  userRoleCodes: readonly string[],
): boolean {
  const role = column.inputRoleCode?.trim() ?? "";
  if (!role || role === CALCULATED_INPUT) return false;
  return userRoleCodes.includes(role);
}

/**
 * Cột hiện trong popup giao/phân rã nhiệm vụ.
 * Chỉ lọc theo ROLE NHẬP (đã bỏ giai đoạn).
 */
export function getAssignmentDialogColumns(
  template: KpiTemplate | null,
  userRoleCodes: readonly string[] = [],
): TemplateColumn[] {
  if (!template) return [];
  return template.columns.filter((column) => {
    if (!column.visible || isAutoIncrementColumn(column)) return false;
    if (column.inputRoleCode === CALCULATED_INPUT) return false;
    return columnMatchesUserRole(column, userRoleCodes);
  });
}

export function getColumnSemanticField(
  column: TemplateColumn,
  template: KpiTemplate | null,
): SemanticField | null {
  if (!template) return null;
  return inferSemanticField(column, template.headerGroups);
}

export function isDialogManagedColumn(
  column: TemplateColumn,
  template: KpiTemplate | null,
): boolean {
  if (!template || isAutoIncrementColumn(column)) return false;
  const semantic = inferSemanticField(column, template.headerGroups);
  return semantic != null && DIALOG_MANAGED_FIELDS.has(semantic);
}

export function isAssignmentDialogColumn(
  column: TemplateColumn,
  template: KpiTemplate | null,
  userRoleCodes: readonly string[] = [],
): boolean {
  return getAssignmentDialogColumns(template, userRoleCodes).some(
    (item) => item.id === column.id,
  );
}

export function canEditTemplateColumn(
  column: TemplateColumn,
  userRoleCodes: readonly string[],
): boolean {
  if (isAutoIncrementColumn(column)) return false;
  if (column.inputRoleCode === CALCULATED_INPUT) return false;
  if (!column.inputRoleCode) return false;
  return userRoleCodes.includes(column.inputRoleCode);
}

/** Sửa trên bảng: chỉ cần đúng ROLE NHẬP. */
export function canInlineEditTemplateColumn(
  column: TemplateColumn,
  userRoleCodes: readonly string[],
  _template: KpiTemplate | null = null,
): boolean {
  return canEditTemplateColumn(column, userRoleCodes);
}

/** Popup giao nhiệm vụ: chỉ cần đúng ROLE NHẬP. */
export function canEditDialogColumn(
  column: TemplateColumn,
  userRoleCodes: readonly string[],
): boolean {
  return canEditTemplateColumn(column, userRoleCodes);
}

export function readFieldValueBySemantic(
  template: KpiTemplate | null,
  fieldValues: Record<string, string>,
  semantic: SemanticField,
): string {
  if (!template) return "";
  const column = template.columns.find(
    (item) => inferSemanticField(item, template.headerGroups) === semantic,
  );
  if (!column) return "";
  return fieldValues[column.key]?.trim() ?? "";
}

export function getTemplateColumnValue(
  column: TemplateColumn,
  task: TaskAssignment,
  rowIndex: number,
  template: KpiTemplate | null,
  contentName: string,
): string {
  if (isAutoIncrementColumn(column)) {
    return String(getAutoIncrementValue(rowIndex));
  }

  const fieldValues = task.fieldValues ?? {};
  const hasStored = Object.prototype.hasOwnProperty.call(fieldValues, column.key);
  if (hasStored) {
    const stored = fieldValues[column.key];
    if (stored == null || stored === "") return "";
    if (template && (stored === 0 || stored === "0")) {
      const semantic = inferSemanticField(column, template.headerGroups);
      // Ẩn 0 mặc định đã bị seed sẵn (điểm chuẩn / đề nghị).
      if (
        semantic === "standard_score" ||
        semantic === "proposed_adjustment"
      ) {
        return "";
      }
    }
    return String(stored);
  }

  if (!template) return "";

  const semantic = inferSemanticField(column, template.headerGroups);
  if (!semantic) return "";

  if (semantic === "due_date" && task.dueDate) {
    return formatTemporalDisplay(column, String(task.dueDate));
  }
  if (semantic === "report_due_date" && task.reportDueDate) {
    return formatTemporalDisplay(column, String(task.reportDueDate));
  }

  const value = readSemanticValue(
    semantic,
    taskValueSourceFromAssignment(task, contentName),
  );
  if (value == null || value === "") return "";
  // Không hiện điểm chuẩn / đề nghị = 0 mặc định khi chưa từng nhập vào fieldValues.
  if (
    typeof value === "number" &&
    value === 0 &&
    (semantic === "standard_score" || semantic === "proposed_adjustment")
  ) {
    return "";
  }
  return String(value);
}

export function normalizeCellInput(
  column: TemplateColumn,
  rawValue: string,
  template: KpiTemplate | null = null,
): string | number | undefined {
  const trimmed = rawValue.trim();
  if (!trimmed) return undefined;
  if (isNumericTemplateColumn(column, template)) {
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  if (column.dataType === "date") {
    return toDateInputValue(trimmed) || undefined;
  }
  if (column.dataType === "time") {
    return toTimeInputValue(trimmed) || undefined;
  }
  if (column.dataType === "datetime") {
    return toDateTimeInputValue(trimmed) || undefined;
  }
  return trimmed;
}

/** Chuẩn hoá về YYYY-MM-DD cho input type=date. */
export function toDateInputValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
  const slash = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    const [, day, month, year] = slash;
    return `${year}-${month!.padStart(2, "0")}-${day!.padStart(2, "0")}`;
  }
  const parsed = dayjs(trimmed);
  return parsed.isValid() ? parsed.format("YYYY-MM-DD") : "";
}

/** Hiển thị ngày DD/MM/YYYY. */
export function formatDateDisplay(value: string): string {
  const iso = toDateInputValue(value);
  if (!iso) return value.trim();
  return dayjs(iso).format("DD/MM/YYYY");
}

/** Chuẩn hoá HH:mm cho input type=time. */
export function toTimeInputValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const match = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return "";
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return "";
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** Chuẩn hoá YYYY-MM-DDTHH:mm cho input type=datetime-local. */
export function toDateTimeInputValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(trimmed)) {
    return trimmed.slice(0, 16);
  }
  const slash = trimmed.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/,
  );
  if (slash) {
    const [, day, month, year, hour = "0", minute = "0"] = slash;
    return `${year}-${month!.padStart(2, "0")}-${day!.padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }
  const parsed = dayjs(trimmed);
  return parsed.isValid() ? parsed.format("YYYY-MM-DDTHH:mm") : "";
}

/** Hiển thị ngày giờ DD/MM/YYYY HH:mm. */
export function formatDateTimeDisplay(value: string): string {
  const local = toDateTimeInputValue(value);
  if (!local) return value.trim();
  return dayjs(local).format("DD/MM/YYYY HH:mm");
}

export type TemporalInputKind = "date" | "time" | "datetime";

export function getTemporalInputKind(
  column: TemplateColumn,
): TemporalInputKind | null {
  if (
    column.dataType === "date" ||
    column.dataType === "time" ||
    column.dataType === "datetime"
  ) {
    return column.dataType;
  }
  return null;
}

/** Giá trị cho input date/time/datetime-local. */
export function temporalInputValue(
  column: TemplateColumn,
  raw: string,
): string {
  switch (column.dataType) {
    case "datetime":
      return toDateTimeInputValue(raw);
    case "date":
      return toDateInputValue(raw);
    case "time":
      return toTimeInputValue(raw);
    default:
      return raw;
  }
}

/** Hiển thị trên bảng theo kiểu cột. */
export function formatTemporalDisplay(
  column: TemplateColumn,
  raw: string,
): string {
  if (!raw.trim()) return "";
  switch (column.dataType) {
    case "datetime":
      return formatDateTimeDisplay(raw);
    case "date":
      return formatDateDisplay(raw);
    case "time":
      return toTimeInputValue(raw) || raw;
    default:
      return raw;
  }
}

/** Chuẩn hoá trước khi gửi API (dueDate, fieldValues…). */
export function parseTemporalForApi(
  column: TemplateColumn,
  raw: string,
): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  if (column.dataType === "datetime") {
    const local = toDateTimeInputValue(trimmed);
    return local ? `${local}:00` : undefined;
  }
  if (column.dataType === "date") {
    return toDateInputValue(trimmed) || undefined;
  }
  if (column.dataType === "time") {
    return toTimeInputValue(trimmed) || undefined;
  }
  return trimmed;
}
