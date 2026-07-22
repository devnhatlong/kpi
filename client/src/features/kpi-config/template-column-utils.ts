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
  dueDate: string;
  reportDueDate?: string;
  product: string;
  actualProduct?: string;
  standardScore: number;
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
    assigneeName: task.assigneeId.fullName || task.assigneeId.username,
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
    const value = readSemanticValue(semantic, source);
    if (value == null || value === "") continue;
    next[column.key] = value;
  }

  return next;
}

const ASSIGNMENT_DIALOG_ROLES = new Set(["SUPER_ADMIN", "UNIT_ADMIN", ""]);

const DIALOG_MANAGED_FIELDS = new Set<SemanticField>([
  "content_name",
  "task_title",
  "assignee",
  "due_date",
  "report_due_date",
  "product",
  "standard_score",
]);

/** Cột hiện trong popup giao nhiệm vụ — lấy từ biểu mẫu, đúng nhãn header. */
export function getAssignmentDialogColumns(
  template: KpiTemplate | null,
): TemplateColumn[] {
  if (!template) return [];
  return template.columns.filter((column) => {
    if (!column.visible || isAutoIncrementColumn(column)) return false;
    if (column.inputRoleCode === CALCULATED_INPUT) return false;
    // Ưu tiên cột semantic giao nhiệm vụ; fallback theo Role nhập admin
    if (isDialogManagedColumn(column, template)) return true;
    return ASSIGNMENT_DIALOG_ROLES.has(column.inputRoleCode ?? "");
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
): boolean {
  return getAssignmentDialogColumns(template).some(
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
  if (userRoleCodes.includes("SUPER_ADMIN")) return true;
  return userRoleCodes.includes(column.inputRoleCode);
}

/** Chỉ cho sửa inline trên bảng; cột giao nhiệm vụ (popup) thì chỉ đọc. */
export function canInlineEditTemplateColumn(
  column: TemplateColumn,
  userRoleCodes: readonly string[],
  template: KpiTemplate | null,
): boolean {
  if (isAssignmentDialogColumn(column, template)) return false;
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

  const stored = task.fieldValues?.[column.key];
  if (stored != null && stored !== "") {
    return String(stored);
  }

  if (!template) return "";

  const semantic = inferSemanticField(column, template.headerGroups);
  if (!semantic) return "";

  const value = readSemanticValue(
    semantic,
    taskValueSourceFromAssignment(task, contentName),
  );
  return value == null ? "" : String(value);
}

export function normalizeCellInput(
  column: TemplateColumn,
  rawValue: string,
): string | number | undefined {
  const trimmed = rawValue.trim();
  if (!trimmed) return undefined;
  if (column.dataType === "number") {
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return trimmed;
}
