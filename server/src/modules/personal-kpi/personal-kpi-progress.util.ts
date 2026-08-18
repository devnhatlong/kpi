import {
  FormHeaderGroup,
  FormTemplateColumn,
  FormTemplateFooter,
} from '@/modules/kpi-form-config/schemas/form-template.schema';

/**
 * Rút cột theo dõi ra khỏi mẫu bảng: KPI tiến độ, KPI chất lượng, ghi chú.
 *
 * PHẢI khớp từng luật với `task-summary.ts` bên client - client dùng để hiện
 * thanh tiến độ, server dùng để quyết định có cho chốt hoàn thành hay không.
 * Hai bên lệch nhau là người dùng thấy 100% mà bấm vẫn báo lỗi.
 */

/** Khoá cột cố định của mẫu mặc định (createDefaultTemplateDraft bên client). */
const PROGRESS_COLUMN_KEY = 'progress_percent';
const QUALITY_COLUMN_KEY = 'quality_percent';
const NOTE_COLUMN_KEY = 'note';
const PRODUCT_COLUMN_KEY = 'product';

export type TrackingTemplate = {
  columns: FormTemplateColumn[];
  headerGroups: FormHeaderGroup[];
  footer?: FormTemplateFooter;
};

/**
 * Các ô mà chỉ huy chấm lại khi chốt hoàn thành.
 *
 * Lấy đúng theo CẤU HÌNH CÔNG THỨC của mẫu, không tự đoán: `baseColumnKey` là
 * mẫu số (A), `ratioColumnKeys` là các tử số (B, C...). Mỗi tử số kèm ô phần
 * trăm nằm cùng nhóm header với nó - đó là cặp "Thực tế hoàn thành % / Điểm tự
 * chấm" trong bảng KPI.
 */
export type ScoreEntry = {
  /** Nhãn vai trò trong công thức: B, C, D... */
  role: string;
  score: FormTemplateColumn;
  percent?: FormTemplateColumn;
};

export type ScoreColumns = {
  /** Cột mẫu số (A) - chỉ đọc, đây là chuẩn đã giao. */
  base?: FormTemplateColumn;
  entries: ScoreEntry[];
};

/** B, C, D... theo thứ tự tử số trong công thức. */
function roleLabel(index: number): string {
  return String.fromCharCode(66 + index);
}

export function resolveScoreColumns(
  template: TrackingTemplate | null,
): ScoreColumns {
  const footer = template?.footer;
  if (!template || !footer?.enabled || !footer.ratioColumnKeys?.length) {
    return { entries: [] };
  }

  const visible = template.columns.filter((column) => column.visible);
  const byKey = new Map(visible.map((column) => [column.key, column]));
  const percentColumns = visible.filter(isPercentColumn);

  const entries: ScoreEntry[] = [];
  footer.ratioColumnKeys.forEach((key, index) => {
    const score = byKey.get(key);
    if (!score) return;
    // Ô phần trăm đi kèm là ô nằm cùng nhóm header với cột điểm - trừ chính nó,
    // vì mẫu có thể lấy thẳng cột phần trăm làm tử số.
    const path = (score.headerPath ?? []).join('/');
    const percent = percentColumns.find(
      (column) =>
        column.key !== score.key &&
        (column.headerPath ?? []).join('/') === path,
    );
    entries.push({ role: roleLabel(index), score, percent });
  });

  return {
    base: footer.baseColumnKey ? byKey.get(footer.baseColumnKey) : undefined,
    entries,
  };
}

export type TrackingColumns = {
  progress?: FormTemplateColumn;
  quality?: FormTemplateColumn;
  note?: FormTemplateColumn;
  /** Sản phẩm dự kiến - khai khi báo cáo kết quả trong ngày. */
  product?: FormTemplateColumn;
  /** Tài liệu kiểm chứng - cột kiểu tệp đầu tiên của mẫu. */
  evidence?: FormTemplateColumn;
};

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/đ/g, 'd');
}

function collectGroupNames(
  groups: FormHeaderGroup[],
  into: Map<string, string>,
): Map<string, string> {
  for (const group of groups ?? []) {
    into.set(group.id, group.name);
    collectGroupNames(group.children ?? [], into);
  }
  return into;
}

/** Tiêu đề cột kèm tên các nhóm header bọc ngoài nó. */
function columnLabelPath(
  column: FormTemplateColumn,
  groupNameById: Map<string, string>,
): string {
  const groups = (column.headerPath ?? [])
    .map((id) => groupNameById.get(id) ?? '')
    .filter(Boolean);
  return normalize([...groups, column.title].join(' '));
}

/**
 * Cột mang được một con số phần trăm: ô số có "%" trong tiêu đề, hoặc ô chọn
 * "Chất lượng thực hiện" (danh mục vốn là các mức 100% / 75% / 50%).
 */
function isPercentColumn(column: FormTemplateColumn): boolean {
  if (column.semanticKey === 'quality_level') return true;
  return column.dataType === 'number' && column.title.includes('%');
}

export function resolveTrackingColumns(
  template: TrackingTemplate | null,
): TrackingColumns {
  if (!template?.columns?.length) return {};
  const visible = template.columns.filter((column) => column.visible);
  const candidates = visible.filter(isPercentColumn);

  const groupNameById = collectGroupNames(
    template.headerGroups ?? [],
    new Map<string, string>(),
  );
  const byKeyword = (keyword: string) =>
    candidates.find((column) =>
      columnLabelPath(column, groupNameById).includes(keyword),
    );

  let progress =
    candidates.find((column) => column.key === PROGRESS_COLUMN_KEY) ??
    byKeyword('tien do');
  let quality =
    candidates.find((column) => column.key === QUALITY_COLUMN_KEY) ??
    byKeyword('chat luong');

  // Mẫu không nhắc "tiến độ" / "chất lượng" thì lấy theo thứ tự bày trên bảng,
  // vì khuôn KPI luôn xếp nhóm B trước nhóm C.
  const rest = candidates.filter(
    (column) => column !== progress && column !== quality,
  );
  progress = progress ?? rest.shift();
  quality = quality ?? rest.shift();

  return {
    progress,
    quality,
    note: visible.find((column) => column.key === NOTE_COLUMN_KEY),
    product: visible.find(
      (column) =>
        column.key === PRODUCT_COLUMN_KEY && column.dataType !== 'file',
    ),
    evidence: visible.find((column) => column.dataType === 'file'),
  };
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

type ItemValues = {
  fieldValues?: Record<string, string | number> | null;
  catalogValues?: Record<string, { id: string; name: string }> | null;
};

/**
 * Giá trị phần trăm của một ô trên nhiệm vụ.
 * Ô chọn mức thì tra phần trăm trong danh mục, ô số thì lấy con số đã nhập.
 * null = chưa nhập, KHÁC 0 - "chưa làm" không phải "làm được 0%".
 */
export function readItemPercent(
  item: ItemValues,
  column: FormTemplateColumn | undefined,
  percentByQualityLevelId: Map<string, number>,
): number | null {
  if (!column) return null;

  if (column.semanticKey === 'quality_level') {
    const picked = item.catalogValues?.[column.key]?.id;
    if (!picked) return null;
    const percent = percentByQualityLevelId.get(String(picked));
    return percent === undefined ? null : clampPercent(percent);
  }

  const raw = item.fieldValues?.[column.key];
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return null;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? clampPercent(value) : null;
}

/** Đủ tiến độ để cấp trên chốt hoàn thành. */
export function isProgressComplete(percent: number | null): boolean {
  return percent !== null && percent >= 100;
}
