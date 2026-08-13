import type { PersonalKpiBoardRow } from "@/features/personal-kpi/api";
import type { FormTemplateColumn } from "@/features/kpi-form-config/types";

/** Tên hiển thị của một tham chiếu đã populate; chuỗi id thì không có gì để đọc. */
export function refLabel(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return "";
  const ref = value as { name?: string; fullName?: string; username?: string };
  return ref.fullName ?? ref.name ?? ref.username ?? "";
}

/**
 * Giá trị hiển thị của một ô theo ánh xạ cột của mẫu.
 * Dùng chung cho bảng duyệt, báo cáo tổng và file xuất ra, để ba nơi không bao
 * giờ đọc cùng một ô ra ba kiểu khác nhau.
 */
export function cellText(
  row: PersonalKpiBoardRow,
  column: FormTemplateColumn,
): string {
  switch (column.semanticKey) {
    case "work_content":
      return refLabel(row.workContentId);
    // Cột danh mục lấy theo khoá cột, để hai cột cùng danh mục không lẫn nhau.
    case "score_group":
    case "quality_level":
      return row.catalogValues?.[column.key]?.name ?? "";
    case "stt":
      return "";
    default: {
      const value = row.fieldValues?.[column.key];
      return value == null ? "" : String(value);
    }
  }
}

export function isTickedCell(
  row: PersonalKpiBoardRow,
  column: FormTemplateColumn,
): boolean {
  return row.fieldValues?.[column.key] === "1";
}

/** Người gửi / cán bộ đứng tên dòng, kèm đơn vị - cột hay dùng ở mọi bảng tổng. */
export function rowSenderLabel(row: PersonalKpiBoardRow) {
  return {
    name: refLabel(row.lastSenderId) || refLabel(row.ownerId) || "-",
    department:
      refLabel(row.lastSenderDepartmentId) ||
      refLabel(row.ownerDepartmentId) ||
      "",
  };
}
