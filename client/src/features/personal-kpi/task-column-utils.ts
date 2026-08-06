import type {
  FormColumnDataType,
  FormColumnSemantic,
} from "@/features/kpi-form-config/types";
import type { PersonalTaskDraft } from "@/features/personal-kpi/types";

/** Cột có semantic ghi thẳng vào field cứng của nhiệm vụ. */
export const SEMANTIC_TO_DRAFT_FIELD: Partial<
  Record<FormColumnSemantic, keyof PersonalTaskDraft>
> = {
  task_title: "title",
  deadline: "deadline",
  product: "product",
  standard_score: "standardScore",
  executing_unit: "executingUnit",
  progress_percent: "progressPercent",
  progress_self_score: "progressSelfScore",
  quality_percent: "qualityPercent",
  quality_self_score: "qualitySelfScore",
  note: "note",
};

export type CellInputProps = {
  type?: string;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
};

/** Ràng buộc & gợi ý nhập theo ý nghĩa cột - không quyết định loại ô. */
const SEMANTIC_HINT: Partial<Record<FormColumnSemantic, CellInputProps>> = {
  product: { placeholder: "Sản phẩm dự kiến" },
  standard_score: { min: 0, step: 0.5, placeholder: "0 *" },
  executing_unit: { placeholder: "Đơn vị thực hiện" },
  progress_percent: { min: 0, max: 100, placeholder: "%" },
  progress_self_score: { min: 0, step: 0.5, placeholder: "Điểm" },
  quality_percent: { min: 0, max: 100, placeholder: "%" },
  quality_self_score: { min: 0, step: 0.5, placeholder: "Điểm" },
  note: { placeholder: "Đề nghị khác" },
};

const DATA_TYPE_INPUT: Partial<Record<FormColumnDataType, string>> = {
  number: "number",
  date: "date",
  time: "time",
  datetime: "datetime-local",
};

/**
 * Thuộc tính input của một ô.
 * Loại ô lấy theo kiểu dữ liệu admin cấu hình; semantic chỉ bổ sung
 * min/max/step/placeholder, và các ràng buộc số bị bỏ khi cột không phải số.
 */
export function cellInputProps(
  semanticKey: FormColumnSemantic,
  dataType: FormColumnDataType,
): CellInputProps {
  const type = DATA_TYPE_INPUT[dataType];
  const hint = SEMANTIC_HINT[semanticKey] ?? {};
  if (type !== "number") return { type, placeholder: hint.placeholder };
  return { type, ...hint };
}

/** Giá trị hiển thị của một ô theo cột. */
export function readCellValue(
  task: PersonalTaskDraft,
  semanticKey: FormColumnSemantic,
  columnKey: string,
): string {
  const field = SEMANTIC_TO_DRAFT_FIELD[semanticKey];
  if (field) return String(task[field] ?? "");
  if (semanticKey === "custom") return task.fieldValues?.[columnKey] ?? "";
  return "";
}

/** Patch tương ứng khi người dùng sửa một ô. */
export function writeCellValue(
  task: PersonalTaskDraft,
  semanticKey: FormColumnSemantic,
  columnKey: string,
  value: string,
): Partial<PersonalTaskDraft> {
  const field = SEMANTIC_TO_DRAFT_FIELD[semanticKey];
  if (field) return { [field]: value } as Partial<PersonalTaskDraft>;
  if (semanticKey === "custom") {
    return { fieldValues: { ...(task.fieldValues ?? {}), [columnKey]: value } };
  }
  return {};
}
