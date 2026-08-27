import {
  EMPTY_FORM_TEMPLATE_FOOTER,
  entityId,
  footerMode,
  formulaColumns,
  plainNumberColumns,
  qualityLevelColumns,
  type FormHeaderGroup,
  type FormTemplate,
  type FormTemplateColumn,
  type FormTemplateFooter,
} from "@/features/mission-form-config/types";

/**
 * Khối nội dung đang mở ở phần thiết kế trường bên dưới.
 *
 * Bảng tiêu chí chung và một trục là hai vai khác nhau ở dữ liệu (một bên gán
 * bằng cờ `forCriteria`, một bên bằng `axisIds`), nhưng cách dựng bộ cột thì y
 * hệt - nên phần thiết kế chỉ nhận đúng một tham số này.
 */
export type DesignerTarget =
  { kind: "criteria" } | { kind: "axis"; axisId: string };

export function targetKey(target: DesignerTarget): string {
  return target.kind === "criteria" ? "criteria" : `axis:${target.axisId}`;
}

export function sameTarget(
  a: DesignerTarget | null,
  b: DesignerTarget | null,
): boolean {
  if (!a || !b) return a === b;
  return targetKey(a) === targetKey(b);
}

/**
 * Bản nháp bộ cột đang sửa trên canvas.
 * `templateId` null nghĩa là khối này chưa có mẫu bảng nào - lưu lần đầu sẽ tạo
 * mẫu mới rồi gán vào đúng trục (hoặc vào bảng tiêu chí).
 */
export type FormDraft = {
  templateId: string | null;
  name: string;
  columns: FormTemplateColumn[];
  headerGroups: FormHeaderGroup[];
  footer: FormTemplateFooter;
};

export function draftFromTemplate(
  template: FormTemplate | null,
  fallbackName: string,
): FormDraft {
  if (!template) {
    return {
      templateId: null,
      name: fallbackName,
      columns: [],
      headerGroups: [],
      footer: EMPTY_FORM_TEMPLATE_FOOTER,
    };
  }
  return {
    templateId: entityId(template),
    name: template.name,
    columns: template.columns ?? [],
    headerGroups: template.headerGroups ?? [],
    footer: template.footer ?? EMPTY_FORM_TEMPLATE_FOOTER,
  };
}

/**
 * Bản nháp đã dọn các tham chiếu treo, dùng lúc dựng payload gửi server.
 *
 * Xoá một trường thì các trường khác vẫn có thể còn trỏ vào nó - cột tự tính
 * trỏ cột phần trăm / cột điểm gốc, công thức trỏ cột mẫu số / tử số. Dọn lúc
 * lưu chứ không sửa thẳng state trong lúc gõ: sửa state ngay sẽ đạp lên đúng
 * cấu hình vừa nạp từ mẫu đang mở, vì lượt chạy đầu cột còn rỗng.
 */
export function sanitizeDraft(draft: FormDraft): FormDraft {
  const qualityKeys = new Set(
    qualityLevelColumns(draft.columns).map((column) => column.key),
  );
  const baseKeys = new Set(
    plainNumberColumns(draft.columns).map((column) => column.key),
  );
  const rangeKeys = new Set(
    draft.columns
      .filter(
        (column) =>
          column.semanticKey === "score_group" ||
          column.semanticKey === "criterion_max_score",
      )
      .map((column) => column.key),
  );

  const columns = draft.columns.map((column) => {
    const next: FormTemplateColumn = {
      ...column,
      title: column.title.trim(),
      width: Number.isFinite(column.width) ? column.width : 160,
    };
    if (
      next.rangeFromColumnKey &&
      (next.dataType !== "number" || !rangeKeys.has(next.rangeFromColumnKey))
    ) {
      next.rangeFromColumnKey = null;
    }
    const auto = next.autoValue;
    if (auto) {
      const usable =
        next.dataType === "number" &&
        qualityKeys.has(auto.percentColumnKey) &&
        baseKeys.has(auto.baseColumnKey) &&
        auto.baseColumnKey !== next.key;
      if (!usable) next.autoValue = null;
    }
    return next;
  });

  const numericKeys = new Set(
    formulaColumns(columns).map((column) => column.key),
  );
  const footer: FormTemplateFooter = {
    enabled: draft.footer.enabled,
    mode: footerMode(draft.footer),
    baseColumnKey:
      draft.footer.baseColumnKey && numericKeys.has(draft.footer.baseColumnKey)
        ? draft.footer.baseColumnKey
        : null,
    ratioColumnKeys: draft.footer.ratioColumnKeys.filter((key) =>
      numericKeys.has(key),
    ),
  };

  return { ...draft, columns, footer };
}

/**
 * Dấu vân tay của bản nháp - so chuỗi này để biết còn thay đổi chưa lưu không.
 *
 * Liệt kê từng trường thay vì stringify cả object: thứ tự khoá trong object do
 * nơi tạo quyết định, mẫu nạp từ server và mẫu vừa sửa trên canvas ra thứ tự
 * khác nhau là báo "chưa lưu" oan.
 */
export function draftFingerprint(draft: FormDraft): string {
  return JSON.stringify({
    name: draft.name.trim(),
    columns: draft.columns.map((column) => [
      column.key,
      column.title.trim(),
      column.headerPath,
      column.width,
      column.visible,
      column.dataType,
      column.semanticKey,
      column.required,
      column.rangeFromColumnKey ?? null,
      column.autoValue
        ? [
            column.autoValue.kind,
            column.autoValue.percentColumnKey,
            column.autoValue.baseColumnKey,
          ]
        : null,
    ]),
    headerGroups: draft.headerGroups,
    footer: [
      draft.footer.enabled,
      footerMode(draft.footer),
      draft.footer.baseColumnKey ?? null,
      draft.footer.ratioColumnKeys,
    ],
  });
}
