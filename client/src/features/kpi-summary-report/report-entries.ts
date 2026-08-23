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
  /** Điểm của nhóm KPI tiến độ - ô "Điểm tự chấm" quy từ % tiến độ. */
  progressScore: number | null;
  /** Điểm tiến độ cán bộ tự khai, để biết chỉ huy có sửa hay không. */
  progressSelfScore: number | null;
  tracksProgress: boolean;
  /** Trục chấm theo mục: đã tích "Không đạt". */
  failed: boolean;
  /** Điểm chốt của dòng: chỉ huy chấm lại thì lấy của chỉ huy. */
  score: number | null;
  /** Điểm cán bộ tự chấm - để nói rõ chỉ huy đã sửa bao nhiêu. */
  selfScore: number | null;
  /** Điểm chuẩn của dòng - mẫu số khi tính tỉ lệ. */
  baseScore: number | null;
  /** KPI chất lượng %. */
  qualityPercent: number | null;
  /** Điểm của nhóm KPI chất lượng - ô "Điểm tự chấm" quy từ % chất lượng. */
  qualityScore: number | null;
  /** Điểm chất lượng cán bộ tự khai. */
  qualitySelfScore: number | null;
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
  /** Tổng điểm đã chốt: điểm quy đổi của các trục + điểm việc tự nhập. */
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
 * Cột "Điểm tự chấm" tính ra từ một cột phần trăm.
 *
 * Mẫu khai cột này là ô tự tính: điểm = phần trăm × điểm chuẩn. Công thức của
 * mẫu có thể lấy thẳng cột phần trăm làm tử số, nhưng thứ đọc được cho MỘT dòng
 * phải là ĐIỂM - hiện 50 (%) cạnh điểm chuẩn 49 thì không ra nghĩa gì.
 */
function pointColumnFor(
  column: FormTemplateColumn,
  columns: FormTemplateColumn[],
): FormTemplateColumn | undefined {
  return columns.find(
    (candidate) =>
      candidate.autoValue?.kind === "percent_of" &&
      candidate.autoValue.percentColumnKey === column.key,
  );
}

/**
 * Các cột góp điểm của một trục.
 *
 * Bám cấu hình công thức của mẫu, nhưng cột phần trăm nào có cột "Điểm tự chấm"
 * tính từ nó thì đọc sang cột điểm đó. Mẫu chưa khai công thức thì lùi về cột
 * điểm mà form chấm điểm đang dùng, để dòng nào cũng có số để hiện.
 */
function scoringColumns(template: SummaryAxisBlock["template"]): {
  numerators: FormTemplateColumn[];
  base?: FormTemplateColumn;
  mode: "ratio" | "sum";
} {
  const mode = footerMode(template?.footer);
  const columns = template?.columns ?? [];
  const byKey = new Map(columns.map((column) => [column.key, column]));
  const footer = template?.footer;

  const declared = footer?.enabled
    ? footer.ratioColumnKeys
        .map((key) => byKey.get(key))
        .filter((column): column is FormTemplateColumn => Boolean(column))
    : [];

  if (declared.length) {
    const numerators = declared.map(
      (column) => pointColumnFor(column, columns) ?? column,
    );
    /*
      Đã đổi sang cột điểm thì mẫu số cũng phải là điểm chuẩn mà cột đó dùng để
      quy đổi, không phải mẫu số khai trong công thức - hai bên lệch nhau là
      con số "được X trên Y" lại sai đơn vị lần nữa.
    */
    const derivedBaseKey = numerators.find(
      (column) => column.autoValue?.baseColumnKey,
    )?.autoValue?.baseColumnKey;
    const baseKey = derivedBaseKey ?? footer?.baseColumnKey;

    return {
      numerators,
      base: baseKey ? byKey.get(baseKey) : undefined,
      mode,
    };
  }

  const results = resultColumns(template ?? null);
  if (results.scores.length) {
    return {
      numerators: results.scores,
      // Trục chấm theo mục: điểm chuẩn là trần điểm của nhóm điểm admin gán
      // cho mục đó - cột "Điểm chuẩn" của bảng đọc từ đây.
      base: columns.find((column) => column.semanticKey === "score_group"),
      mode: "sum",
    };
  }

  const entries = scoreColumns(template ?? null);
  return {
    numerators: entries.entries.map((entry) => entry.score),
    base: entries.base,
    mode,
  };
}

/** Gộp các ô điểm của một dòng thành một con số. */
function combine(values: number[], mode: "ratio" | "sum"): number | null {
  if (!values.length) return null;
  const total = values.reduce((sum, value) => sum + value, 0);
  return mode === "sum" ? total : total / values.length;
}

/**
 * Điểm chốt của MỘT dòng.
 *
 * `cellNumber` đọc ô nào chỉ huy đã chấm lại thì lấy số của chỉ huy, ô nào chưa
 * đụng tới thì giữ số cán bộ tự chấm - đúng luật của bảng tổng và của server.
 * Trục cộng dồn thì cộng thẳng các ô điểm; trục tính theo tỉ lệ thì lấy trung
 * bình các cột tử số (mẫu mặc định có hai cột "Điểm tự chấm": tiến độ và chất
 * lượng). Điểm của cả trục vẫn phải tính trên TỔNG CỘT (`computeAxisFooter`),
 * không phải cộng mấy con số dòng này lại.
 */
function rowScore(
  row: SummaryRow,
  columns: FormTemplateColumn[],
  mode: "ratio" | "sum",
  catalogs: FormulaCatalogs,
): number | null {
  return combine(
    columns
      .map((column) => cellNumber(row, column, catalogs))
      .filter((value): value is number => value !== null),
    mode,
  );
}

/** Số cán bộ tự khai, đọc thẳng ô của cán bộ chứ không đụng tới ô chỉ huy chấm. */
function rowSelfScore(
  row: SummaryRow,
  columns: FormTemplateColumn[],
  mode: "ratio" | "sum",
): number | null {
  const values: number[] = [];
  for (const column of columns) {
    const raw = row.fieldValues?.[column.key];
    if (raw === undefined || raw === null || String(raw).trim() === "")
      continue;
    const parsed = Number(String(raw).replace(",", "."));
    if (Number.isFinite(parsed)) values.push(parsed);
  }
  return combine(values, mode);
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
    progressScore: null,
    progressSelfScore: null,
    tracksProgress: false,
    failed: false,
    score: item.score,
    selfScore: null,
    baseScore: null,
    qualityPercent: null,
    qualityScore: null,
    qualitySelfScore: null,
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
    /*
      Mỗi nhóm phần trăm (tiến độ / chất lượng) đi kèm một ô "Điểm tự chấm" quy
      từ chính nó. Bảng bày cả cặp % và điểm để đọc ra được vì sao điểm bằng
      chừng đó, thay vì bắt người xem tự nhân nhẩm với điểm chuẩn.
    */
    const columns = template?.columns ?? [];
    const progressPointColumn = tracking.progressColumn
      ? pointColumnFor(tracking.progressColumn, columns)
      : undefined;
    const qualityPointColumn = tracking.qualityColumn
      ? pointColumnFor(tracking.qualityColumn, columns)
      : undefined;

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
          progressScore: progressPointColumn
            ? cellNumber(row, progressPointColumn, catalogs)
            : null,
          progressSelfScore: progressPointColumn
            ? rowSelfScore(row, [progressPointColumn], "sum")
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
          selfScore: rowSelfScore(row, scoring.numerators, scoring.mode),
          baseScore: scoring.base
            ? cellNumber(row, scoring.base, catalogs)
            : null,
          qualityPercent: tracking.qualityColumn
            ? cellNumber(row, tracking.qualityColumn, catalogs)
            : null,
          qualityScore: qualityPointColumn
            ? cellNumber(row, qualityPointColumn, catalogs)
            : null,
          qualitySelfScore: qualityPointColumn
            ? rowSelfScore(row, [qualityPointColumn], "sum")
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
