import {
  catalogOfSemantic,
  formatScoreRange,
  isScoreInGroupRange,
  type FormColumnDataType,
  type FormColumnSemantic,
  type FormTemplateColumn,
  type ScoreGroup,
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
    // Nhóm điểm đổ theo nội dung công việc, cột tự tính do server tính - báo
    // "chưa nhập" cho hai loại này là chặn người dùng ở chỗ họ không sửa được.
    if (column.semanticKey === "score_group" || column.autoValue) continue;

    if (isCheckboxColumn(column.dataType)) {
      if (!readCheckboxValue(task, column.key)) missing.push(column.title);
      continue;
    }

    // Cột tệp nằm ở attachments chứ không phải fieldValues - đọc nhầm chỗ thì
    // cột tệp bắt buộc nào cũng bị báo thiếu dù đã đính kèm.
    if (column.dataType === "file") {
      if (!task.attachments?.[column.key]?.length) missing.push(column.title);
      continue;
    }

    if (!readCellValue(task, column.semanticKey, column.key).trim()) {
      missing.push(column.title);
    }
  }

  return missing;
}

/**
 * Cột điểm có giá trị nằm ngoài dải của nhóm điểm đã chọn.
 * Trả về mô tả sẵn để hiện toast, khỏi phải chờ server trả lỗi.
 *
 * `autoScoreGroupId` là nhóm điểm của nội dung công việc - màn nhập đổ nhóm
 * theo nội dung nên nhiệm vụ không còn giữ id nhóm trong catalogValues; bỏ
 * trống thì rơi về giá trị đã lưu trên nhiệm vụ (dữ liệu cũ, màn chỉ xem).
 */
export function outOfRangeColumns(
  task: PersonalTaskDraft,
  columns: FormTemplateColumn[],
  scoreGroupById: Map<string, ScoreGroup>,
  autoScoreGroupId?: string,
): string[] {
  const problems: string[] = [];

  for (const column of columns) {
    if (!column.visible || !column.rangeFromColumnKey) continue;

    const groupId =
      autoScoreGroupId || task.catalogValues?.[column.rangeFromColumnKey] || "";
    const group = scoreGroupById.get(groupId);
    if (!group) continue;

    const raw = task.fieldValues?.[column.key] ?? "";
    if (!raw.trim()) continue;

    const score = Number(raw);
    if (!Number.isFinite(score)) {
      problems.push(`"${column.title}" không phải số`);
      continue;
    }
    if (!isScoreInGroupRange(score, group)) {
      problems.push(
        `"${column.title}" phải trong dải ${formatScoreRange(group)} của ${group.name}`,
      );
    }
  }

  return problems;
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
