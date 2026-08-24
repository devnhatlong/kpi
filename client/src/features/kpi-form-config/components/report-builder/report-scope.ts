import {
  entityId,
  REPORT_SCOPE_TYPE_LABEL,
  type DepartmentLevelRef,
  type DepartmentRef,
  type ReportScopeType,
  type ReportTemplate,
} from "@/features/kpi-form-config/types";

/** Phạm vi đang sửa trên màn - tách khỏi bản ghi để gõ dở không đụng cache. */
export type ScopeDraft = {
  scopeType: ReportScopeType;
  levelIds: string[];
  departmentIds: string[];
  includeDescendants: boolean;
};

export function scopeFromTemplate(template: ReportTemplate): ScopeDraft {
  return {
    scopeType: template.scopeType ?? "all",
    levelIds: (template.levelIds ?? []).map(entityId),
    departmentIds: (template.departmentIds ?? []).map(entityId),
    includeDescendants: template.includeDescendants ?? true,
  };
}

export const DEFAULT_SCOPE: ScopeDraft = {
  scopeType: "all",
  levelIds: [],
  departmentIds: [],
  includeDescendants: true,
};

/** So sánh ổn định để biết phạm vi có thay đổi chưa lưu không. */
export function scopeFingerprint(scope: ScopeDraft): string {
  return JSON.stringify([
    scope.scopeType,
    [...scope.levelIds].sort(),
    [...scope.departmentIds].sort(),
    scope.includeDescendants,
  ]);
}

function nameOf(value: DepartmentLevelRef | DepartmentRef | string): string {
  return typeof value === "string" ? value : value.name;
}

/**
 * Phạm vi viết thành một dòng đọc được, cho bảng danh sách và tiêu đề mẫu.
 * Dùng dữ liệu đã populate của bản ghi nên không cần gọi thêm danh mục.
 */
export function scopeSummary(template: ReportTemplate): string {
  const type = template.scopeType ?? "all";
  if (type === "all") return REPORT_SCOPE_TYPE_LABEL.all;

  const items =
    type === "by_level"
      ? (template.levelIds ?? []).map(nameOf)
      : (template.departmentIds ?? []).map(nameOf);

  if (!items.length) return `${REPORT_SCOPE_TYPE_LABEL[type]} (chưa chọn)`;

  // Ba cái đầu là đủ để nhận ra, dài hơn thì bảng vỡ dòng.
  const head = items.slice(0, 3).join(", ");
  const rest = items.length > 3 ? ` +${items.length - 3}` : "";
  const inherit =
    type === "by_department" && template.includeDescendants ? " (cả cấp dưới)" : "";
  return `${head}${rest}${inherit}`;
}

/** Phạm vi đã khai đủ chưa - server cũng chặn, đây chỉ để báo sớm. */
export function scopeIsComplete(scope: ScopeDraft): boolean {
  if (scope.scopeType === "by_level") return scope.levelIds.length > 0;
  if (scope.scopeType === "by_department") return scope.departmentIds.length > 0;
  return true;
}
