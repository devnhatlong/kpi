import type {
  FormColumnDataType,
  FormColumnSemantic,
  FormTemplateColumn,
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
  result_passed: "resultPassed",
  result_failed: "resultFailed",
  note: "note",
};

/** Cột Đạt/Không đạt vẽ ô tích chứ không phải ô nhập chữ. */
export function isCheckboxColumn(
  semanticKey: FormColumnSemantic,
  dataType: FormColumnDataType,
): boolean {
  return (
    dataType === "boolean" ||
    semanticKey === "result_passed" ||
    semanticKey === "result_failed"
  );
}

/** Ô tích đọc giá trị boolean, không phải chuỗi. */
export function readCheckboxValue(
  task: PersonalTaskDraft,
  semanticKey: FormColumnSemantic,
  columnKey: string,
): boolean {
  const field = SEMANTIC_TO_DRAFT_FIELD[semanticKey];
  if (field) return task[field] === true;
  if (semanticKey === "custom") {
    return task.fieldValues?.[columnKey] === "1";
  }
  return false;
}

/**
 * Patch khi tích một ô boolean.
 * Đạt và Không đạt loại trừ nhau - tích bên này thì bên kia tự tắt, để không
 * lưu được dòng vừa đạt vừa không đạt.
 */
export function writeCheckboxValue(
  task: PersonalTaskDraft,
  semanticKey: FormColumnSemantic,
  columnKey: string,
  checked: boolean,
): Partial<PersonalTaskDraft> {
  if (semanticKey === "result_passed") {
    return {
      resultPassed: checked,
      ...(checked ? { resultFailed: false } : {}),
    };
  }
  if (semanticKey === "result_failed") {
    return {
      resultFailed: checked,
      ...(checked ? { resultPassed: false } : {}),
    };
  }

  const field = SEMANTIC_TO_DRAFT_FIELD[semanticKey];
  if (field) return { [field]: checked } as Partial<PersonalTaskDraft>;
  if (semanticKey === "custom") {
    return {
      fieldValues: {
        ...(task.fieldValues ?? {}),
        [columnKey]: checked ? "1" : "",
      },
    };
  }
  return {};
}

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

/**
 * Cột bắt buộc mà chưa có dữ liệu.
 * Đọc cờ `required` do super admin tích khi cấu hình mẫu - trước đây cờ này
 * chỉ nằm trong DB chứ không chặn gì.
 */
export function missingRequiredColumns(
  task: PersonalTaskDraft,
  columns: FormTemplateColumn[],
): string[] {
  const missing: string[] = [];

  for (const column of columns) {
    if (!column.visible || !column.required) continue;
    // STT tự đánh số, không phải ô nhập nên không xét.
    if (column.semanticKey === "stt") continue;

    if (column.semanticKey === "evidence_files") {
      if (!task.evidenceFiles?.length) missing.push(column.title);
      continue;
    }

    if (isCheckboxColumn(column.semanticKey, column.dataType)) {
      if (!readCheckboxValue(task, column.semanticKey, column.key)) {
        missing.push(column.title);
      }
      continue;
    }

    if (!readCellValue(task, column.semanticKey, column.key).trim()) {
      missing.push(column.title);
    }
  }

  return missing;
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
