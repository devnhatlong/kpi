import {
  cellNumber,
  cellText,
  computeAxisFooter,
  refLabel,
  rowDepartmentRef,
  type FormulaCatalogs,
} from "@/features/personal-kpi/board-cell";
import {
  footerMode,
  type FormTemplateColumn,
} from "@/features/kpi-form-config/types";
import {
  resultColumns,
  scoreColumns,
  trackingColumns,
} from "@/features/personal-kpi/task-summary";
import type {
  SummaryAxisBlock,
  SummaryManualItem,
  SummaryRow,
} from "@/features/kpi-summary-report/types";

/**
 * Một dòng của báo cáo tổng hợp, đã quy về cùng một hình dạng.
 *
 * Ba cách xem (theo trục / theo đơn vị / danh sách) và cả ô thống kê đều đọc
 * kiểu này, nên phần "đọc dữ liệu từ mẫu bảng" chỉ nằm ở một chỗ - đổi cách
 * tính là cả trang đổi theo, không có màn nào tính lệch.
 */
export type ReportEntry = {
  /** Khoá render, khác nhau giữa việc lấy từ KPI và việc tự nhập. */
  key: string;
  kind: "KPI" | "MANUAL";
  /** id nhiệm vụ KPI, dùng để bỏ khỏi báo cáo. */
  itemId?: string;
  /** id nhiệm vụ tự nhập. */
  manualId?: string;
  title: string;
  subtitle: string;
  ownerName: string;
  departmentKey: string;
  departmentName: string;
  axisId: string;
  axisName: string;
  /** Tiến độ %; null = mẫu không theo dõi % (trục chấm theo mục). */
  progressPercent: number | null;
  tracksProgress: boolean;
  /** Trục chấm theo mục: đã tích "Không đạt". */
  failed: boolean;
  /** Điểm chỉ huy chấm cho dòng này. */
  score: number | null;
  /** Điểm chuẩn của dòng - mẫu số khi tính tỉ lệ. */
  baseScore: number | null;
  /** KPI chất lượng %. */
  qualityPercent: number | null;
  reportDate: string;
};

/** Điểm chốt của một trục - số thật sự vào bảng điểm, tính trên tổng cột. */
export type AxisScore = {
  axisId: string;
  axisName: string;
  maxScore: number;
  score: number | null;
  entryCount: number;
};

export type ReportStats = {
  entryCount: number;
  kpiCount: number;
  manualCount: number;
  /** Tổng điểm chỉ huy: điểm quy đổi của các trục + điểm việc tự nhập. */
  totalScore: number;
  manualScore: number;
  departmentCount: number;
  axisCount: number;
};

export type ReportContent = {
  entries: ReportEntry[];
  axisScores: AxisScore[];
  stats: ReportStats;
};

/**
 * Các cột góp điểm của một trục.
 *
 * Ưu tiên đúng cấu hình công thức của mẫu; mẫu chưa khai công thức thì lùi về
 * cột điểm mà form chấm điểm đang dùng, để dòng nào cũng có số để hiện.
 */
function scoringColumns(template: SummaryAxisBlock["template"]): {
  numerators: FormTemplateColumn[];
  base?: FormTemplateColumn;
  mode: "ratio" | "sum";
} {
  const mode = footerMode(template?.footer);
  const byKey = new Map(
    (template?.columns ?? []).map((column) => [column.key, column]),
  );
  const footer = template?.footer;

  const numerators = footer?.enabled
    ? footer.ratioColumnKeys
        .map((key) => byKey.get(key))
        .filter((column): column is FormTemplateColumn => Boolean(column))
    : [];

  if (numerators.length) {
    return {
      numerators,
      base: footer?.baseColumnKey ? byKey.get(footer.baseColumnKey) : undefined,
      mode,
    };
  }

  const results = resultColumns(template ?? null);
  if (results.scores.length) {
    return { numerators: results.scores, mode: "sum" };
  }

  const entries = scoreColumns(template ?? null);
  return {
    numerators: entries.entries.map((entry) => entry.score),
    base: entries.base,
    mode,
  };
}

/**
 * Điểm của MỘT dòng.
 *
 * Trục cộng dồn thì cộng thẳng các ô điểm. Trục tính theo tỉ lệ thì lấy trung
 * bình các cột tử số - đó là số chỉ huy chấm cho dòng này trên thang điểm
 * chuẩn của nó. Điểm của cả trục vẫn phải tính trên TỔNG CỘT (`computeAxisFooter`),
 * không phải cộng mấy con số dòng này lại.
 */
function rowScore(
  row: SummaryRow,
  columns: FormTemplateColumn[],
  mode: "ratio" | "sum",
  catalogs: FormulaCatalogs,
): number | null {
  const values = columns
    .map((column) => cellNumber(row, column, catalogs))
    .filter((value): value is number => value !== null);
  if (!values.length) return null;
  const total = values.reduce((sum, value) => sum + value, 0);
  return mode === "sum" ? total : total / values.length;
}

/** Nhiệm vụ tự nhập quy về cùng một dòng với việc lấy từ KPI. */
function manualEntry(item: SummaryManualItem): ReportEntry {
  return {
    key: `manual-${item._id}`,
    kind: "MANUAL",
    manualId: item._id,
    title: item.title,
    subtitle: item.note,
    ownerName: item.ownerName,
    departmentKey: item.departmentName ? `manual:${item.departmentName}` : "",
    departmentName: item.departmentName,
    axisId: item.axisId ?? "",
    axisName: item.axisName,
    progressPercent: null,
    tracksProgress: false,
    failed: false,
    score: item.score,
    baseScore: null,
    qualityPercent: null,
    reportDate: "",
  };
}

/**
 * Toàn bộ nội dung một báo cáo: các dòng đã quy chuẩn, điểm từng trục và mấy ô
 * thống kê ở đầu trang.
 */
export function buildReportContent(
  axes: SummaryAxisBlock[],
  manualItems: SummaryManualItem[],
  catalogs: FormulaCatalogs,
): ReportContent {
  const entries: ReportEntry[] = [];
  const axisScores: AxisScore[] = [];

  for (const axis of axes) {
    const template = axis.template;
    const tracking = trackingColumns(template ?? null);
    const results = resultColumns(template ?? null);
    const scoring = scoringColumns(template);
    const rows = axis.groups.flatMap((group) => group.rows);

    const footer = computeAxisFooter(
      rows,
      template?.columns ?? [],
      template?.footer,
      axis.axisMaxScore,
      catalogs,
    );

    axisScores.push({
      axisId: axis.axisId,
      axisName: axis.axisName || axis.axisCode,
      maxScore: axis.axisMaxScore,
      score: footer.convertedScore,
      entryCount: rows.length,
    });

    for (const group of axis.groups) {
      for (const row of group.rows) {
        const department = rowDepartmentRef(row);
        const title = tracking.titleColumn
          ? cellText(row, tracking.titleColumn).trim()
          : "";
        entries.push({
          key: row._id,
          kind: "KPI",
          itemId: row._id,
          // Mẫu nào không có cột tên việc thì lấy tên nội dung công việc - dòng
          // nào cũng phải đọc ra được là việc gì.
          title: title || group.workContentName || group.workContentCode,
          subtitle: title
            ? group.workContentName
            : group.workContentDescription,
          ownerName: refLabel(row.ownerId) || refLabel(row.lastSenderId) || "-",
          departmentKey: department.id,
          departmentName: department.name,
          axisId: axis.axisId,
          axisName: axis.axisName || axis.axisCode,
          progressPercent: tracking.progressColumn
            ? cellNumber(row, tracking.progressColumn, catalogs)
            : null,
          tracksProgress: Boolean(tracking.progressColumn),
          failed: results.flags.some(
            (column) =>
              String(
                row.reviewValues?.[column.key] ??
                  row.fieldValues?.[column.key] ??
                  "",
              ) === "1",
          ),
          score: rowScore(row, scoring.numerators, scoring.mode, catalogs),
          baseScore: scoring.base
            ? cellNumber(row, scoring.base, catalogs)
            : null,
          qualityPercent: tracking.qualityColumn
            ? cellNumber(row, tracking.qualityColumn, catalogs)
            : null,
          reportDate: row.reportDate ?? "",
        });
      }
    }
  }

  for (const item of manualItems) entries.push(manualEntry(item));

  const manualScore = manualItems.reduce(
    (sum, item) => sum + (item.score ?? 0),
    0,
  );
  const axisTotal = axisScores.reduce(
    (sum, axis) => sum + (axis.score ?? 0),
    0,
  );
  const departmentKeys = new Set(
    entries.map((entry) => entry.departmentKey).filter(Boolean),
  );

  return {
    entries,
    axisScores,
    stats: {
      entryCount: entries.length,
      kpiCount: entries.length - manualItems.length,
      manualCount: manualItems.length,
      totalScore: axisTotal + manualScore,
      manualScore,
      departmentCount: departmentKeys.size,
      axisCount: axisScores.length,
    },
  };
}

export type EntryGroup = {
  key: string;
  label: string;
  /** Điểm chốt của nhóm; chỉ nhóm theo trục mới có. */
  score: number | null;
  maxScore: number | null;
  entries: ReportEntry[];
};

/** Gom dòng theo trục - thứ tự trục giữ nguyên như server trả về. */
export function groupByAxis(
  entries: ReportEntry[],
  axisScores: AxisScore[],
): EntryGroup[] {
  const order = new Map(axisScores.map((axis, index) => [axis.axisId, index]));
  const groups = new Map<string, EntryGroup>();

  for (const entry of entries) {
    const key = entry.axisId || "__none__";
    const axis = axisScores.find((item) => item.axisId === entry.axisId);
    const group = groups.get(key) ?? {
      key,
      label: entry.axisName || "Chưa gắn trục",
      score: axis?.score ?? null,
      maxScore: axis?.maxScore ?? null,
      entries: [],
    };
    group.entries.push(entry);
    groups.set(key, group);
  }

  return [...groups.values()].sort(
    (left, right) =>
      (order.get(left.key) ?? 999) - (order.get(right.key) ?? 999),
  );
}

/** Gom dòng theo đơn vị của cán bộ thực hiện. */
export function groupByDepartment(entries: ReportEntry[]): EntryGroup[] {
  const groups = new Map<string, EntryGroup>();

  for (const entry of entries) {
    const key = entry.departmentKey || "__none__";
    const group = groups.get(key) ?? {
      key,
      label: entry.departmentName || "Chưa gắn đơn vị",
      // Điểm là của trục, không phải của đơn vị - gom kiểu này thì không có
      // con số nào cộng lại mà còn đúng nghĩa.
      score: null,
      maxScore: null,
      entries: [],
    };
    group.entries.push(entry);
    groups.set(key, group);
  }

  return [...groups.values()].sort((left, right) =>
    left.label.localeCompare(right.label, "vi"),
  );
}
