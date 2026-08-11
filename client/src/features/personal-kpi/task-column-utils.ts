import {
  catalogOfSemantic,
  type FormColumnDataType,
  type FormColumnSemantic,
  type FormTemplateColumn,
} from "@/features/kpi-form-config/types";
import type { PersonalTaskDraft } from "@/features/personal-kpi/types";

/**
 * Ô tích hay ô nhập - chỉ còn quyết định bằng kiểu dữ liệu admin cấu hình.
 * Cột danh mục bị khoá ở kiểu "select" nên không bao giờ rơi vào nhánh này.
 */
export function isCheckboxColumn(dataType: FormColumnDataType): boolean {
  return dataType === "boolean";
}

/** Ô tích lưu chuỗi "1" trong fieldValues. */
export function readCheckboxValue(
  task: PersonalTaskDraft,
  columnKey: string,
): boolean {
  return task.fieldValues?.[columnKey] === "1";
}

export function writeCheckboxValue(
  task: PersonalTaskDraft,
  columnKey: string,
  checked: boolean,
): Partial<PersonalTaskDraft> {
  return {
    fieldValues: {
      ...(task.fieldValues ?? {}),
      [columnKey]: checked ? "1" : "",
    },
  };
}

export type CellInputProps = {
  type?: string;
};

const DATA_TYPE_INPUT: Partial<Record<FormColumnDataType, string>> = {
  number: "number",
  date: "date",
  time: "time",
  datetime: "datetime-local",
};

/** Loại ô nhập, lấy theo kiểu dữ liệu admin cấu hình. */
export function cellInputProps(dataType: FormColumnDataType): CellInputProps {
  return { type: DATA_TYPE_INPUT[dataType] };
}

/**
 * Cột bắt buộc mà chưa có dữ liệu.
 * Đọc cờ `required` do super admin tích khi cấu hình mẫu.
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

    if (isCheckboxColumn(column.dataType)) {
      if (!readCheckboxValue(task, column.key)) missing.push(column.title);
      continue;
    }

    if (!readCellValue(task, column.semanticKey, column.key).trim()) {
      missing.push(column.title);
    }
  }

  return missing;
}

/**
 * Giá trị hiển thị của một ô theo cột.
 * Cột danh mục trả về id đã chọn (dropdown cần id), cột còn lại trả chuỗi.
 */
export function readCellValue(
  task: PersonalTaskDraft,
  semanticKey: FormColumnSemantic,
  columnKey: string,
): string {
  if (catalogOfSemantic(semanticKey)) {
    return task.catalogValues?.[columnKey] ?? "";
  }
  return task.fieldValues?.[columnKey] ?? "";
}

/** Patch tương ứng khi người dùng sửa một ô. */
export function writeCellValue(
  task: PersonalTaskDraft,
  semanticKey: FormColumnSemantic,
  columnKey: string,
  value: string,
): Partial<PersonalTaskDraft> {
  if (catalogOfSemantic(semanticKey)) {
    return {
      catalogValues: { ...(task.catalogValues ?? {}), [columnKey]: value },
    };
  }
  return { fieldValues: { ...(task.fieldValues ?? {}), [columnKey]: value } };
}
