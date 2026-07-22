import dayjs from "dayjs";
import {
  getAutoIncrementValue,
  isAutoIncrementColumn,
  type TaskAssignment,
  type TemplateColumn,
  type TemplateColumnSourceField,
} from "./types";

export const TEMPLATE_SOURCE_FIELD_LABELS: Record<
  TemplateColumnSourceField,
  string
> = {
  content_name: "Nội dung công việc",
  task_title: "Nhiệm vụ",
  assignee: "Người thực hiện",
  due_date: "Thời hạn hoàn thành",
  report_due_date: "Hạn báo cáo",
  product: "Sản phẩm dự kiến",
  actual_product: "Sản phẩm sau khi thực hiện",
  standard_score: "Điểm chuẩn",
  self_progress_percent: "Tự chấm - Tiến độ %",
  self_progress_score: "Tự chấm - Tiến độ điểm",
  self_quality_percent: "Tự chấm - Chất lượng %",
  self_quality_score: "Tự chấm - Chất lượng điểm",
  proposed_adjustment: "Đề nghị cộng/trừ điểm",
  proposed_adjustment_reason: "Lý do đề nghị điều chỉnh",
  appraisal_progress_percent: "Thẩm định - Tiến độ %",
  appraisal_progress_score: "Thẩm định - Tiến độ điểm",
  appraisal_quality_percent: "Thẩm định - Chất lượng %",
  appraisal_quality_score: "Thẩm định - Chất lượng điểm",
  note: "Ghi chú",
};

export type TaskEditableField =
  | "actualProduct"
  | "selfProgressPercent"
  | "selfProgressScore"
  | "selfQualityPercent"
  | "selfQualityScore"
  | "proposedAdjustment"
  | "proposedAdjustmentReason"
  | "appraisalProgressPercent"
  | "appraisalProgressScore"
  | "appraisalQualityPercent"
  | "appraisalQualityScore"
  | "note";

const sourceToEditableField: Partial<
  Record<TemplateColumnSourceField, TaskEditableField>
> = {
  actual_product: "actualProduct",
  self_progress_percent: "selfProgressPercent",
  self_progress_score: "selfProgressScore",
  self_quality_percent: "selfQualityPercent",
  self_quality_score: "selfQualityScore",
  proposed_adjustment: "proposedAdjustment",
  proposed_adjustment_reason: "proposedAdjustmentReason",
  appraisal_progress_percent: "appraisalProgressPercent",
  appraisal_progress_score: "appraisalProgressScore",
  appraisal_quality_percent: "appraisalQualityPercent",
  appraisal_quality_score: "appraisalQualityScore",
  note: "note",
};

const titleInference: Array<{
  match: (title: string) => boolean;
  field: TemplateColumnSourceField;
}> = [
  {
    match: (title) => title.includes("nội dung công việc"),
    field: "content_name",
  },
  { match: (title) => title === "nhiệm vụ", field: "task_title" },
  {
    match: (title) => title.includes("thời hạn hoàn thành"),
    field: "due_date",
  },
  {
    match: (title) => title.includes("sản phẩm dự kiến"),
    field: "product",
  },
  {
    match: (title) => title.includes("sản phẩm sau"),
    field: "actual_product",
  },
  { match: (title) => title.includes("điểm chuẩn"), field: "standard_score" },
  {
    match: (title) =>
      title.includes("thực tế hoàn thành") && title.includes("tiến độ"),
    field: "self_progress_percent",
  },
  {
    match: (title) =>
      title.includes("điểm tự chấm") && title.includes("tiến độ"),
    field: "self_progress_score",
  },
  {
    match: (title) =>
      title.includes("thực tế hoàn thành") && title.includes("chất lượng"),
    field: "self_quality_percent",
  },
  {
    match: (title) =>
      title.includes("điểm tự chấm") && title.includes("chất lượng"),
    field: "self_quality_score",
  },
  {
    match: (title) => title.includes("đề nghị cộng"),
    field: "proposed_adjustment",
  },
  {
    match: (title) => title.includes("điểm thẩm định") && title.includes("tiến độ"),
    field: "appraisal_progress_score",
  },
  {
    match: (title) =>
      title.includes("thực tế hoàn thành") && title.includes("thẩm"),
    field: "appraisal_progress_percent",
  },
  {
    match: (title) =>
      title.includes("điểm thẩm định") && title.includes("chất lượng"),
    field: "appraisal_quality_score",
  },
  { match: (title) => title.includes("ghi chú"), field: "note" },
];

export function resolveColumnSourceField(
  column: TemplateColumn,
): TemplateColumnSourceField | "" {
  if (column.sourceField) return column.sourceField;
  if (isAutoIncrementColumn(column)) return "";
  const title = column.title.trim().toLowerCase();
  const inferred = titleInference.find((item) => item.match(title));
  return inferred?.field ?? "";
}

export function getColumnEditableField(
  column: TemplateColumn,
): TaskEditableField | null {
  const sourceField = resolveColumnSourceField(column);
  if (!sourceField) return null;
  return sourceToEditableField[sourceField] ?? null;
}

export function resolveTaskColumnValue(
  column: TemplateColumn,
  context: {
    rowIndex: number;
    contentName: string;
    task: TaskAssignment;
  },
): string | number | undefined {
  if (isAutoIncrementColumn(column)) {
    return getAutoIncrementValue(context.rowIndex);
  }

  const sourceField = resolveColumnSourceField(column);
  const { task, contentName } = context;

  switch (sourceField) {
    case "content_name":
      return contentName;
    case "task_title":
      return task.title;
    case "assignee":
      return task.assigneeId.fullName || task.assigneeId.username;
    case "due_date":
      return dayjs(task.dueDate).format("DD/MM/YYYY");
    case "report_due_date":
      return task.reportDueDate
        ? dayjs(task.reportDueDate).format("DD/MM/YYYY")
        : "";
    case "product":
      return task.product;
    case "actual_product":
      return task.actualProduct;
    case "standard_score":
      return task.standardScore;
    case "self_progress_percent":
      return task.selfProgressPercent;
    case "self_progress_score":
      return task.selfProgressScore;
    case "self_quality_percent":
      return task.selfQualityPercent;
    case "self_quality_score":
      return task.selfQualityScore;
    case "proposed_adjustment":
      return task.proposedAdjustment;
    case "proposed_adjustment_reason":
      return task.proposedAdjustmentReason;
    case "appraisal_progress_percent":
      return task.appraisalProgressPercent;
    case "appraisal_progress_score":
      return task.appraisalProgressScore;
    case "appraisal_quality_percent":
      return task.appraisalQualityPercent;
    case "appraisal_quality_score":
      return task.appraisalQualityScore;
    case "note":
      return task.note;
    default:
      return "";
  }
}

export function inferSourceFieldFromTitle(
  title: string,
): TemplateColumnSourceField | "" {
  const normalized = title.trim().toLowerCase();
  if (!normalized || normalized === "stt") return "";
  const inferred = titleInference.find((item) => item.match(normalized));
  return inferred?.field ?? "";
}
