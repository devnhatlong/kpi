import {
  cellNumber,
  cellText,
  computeAxisFooter,
  refLabel,
  rowDepartmentRef,
  type FormulaCatalogs,
} from "@/features/personal-mission/board-cell";
import {
  footerMode,
  type FormHeaderGroup,
  type FormTemplateColumn,
  type FormTemplateFooter,
} from "@/features/mission-form-config/types";
import {
  resultColumns,
  scoreColumns,
  trackingColumns,
} from "@/features/personal-mission/task-summary";
import type {
  SummaryAxisBlock,
  SummaryManualItem,
  SummaryRow,
} from "@/features/mission-summary-report/types";

/**
 * Một dòng của báo cáo tổng hợp, đã quy về cùng một hình dạng.
 *
 * Ba cách xem (theo trục / theo đơn vị / danh sách) và cả ô thống kê đều đọc
 * kiểu này, nên phần "đọc dữ liệu từ mẫu bảng" chỉ nằm ở một chỗ - đổi cách
 * tính là cả trang đổi theo, không có màn nào tính lệch.
 */
export type ReportEntry = {
  /** Khoá render, khác nhau giữa việc lấy từ nhiệm vụ và việc tự nhập. */
  key: string;
  kind: "MISSION" | "MANUAL";
  /** id nhiệm vụ, dùng để bỏ khỏi báo cáo. */
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
  /** Điểm của nhóm tiến độ - ô "Điểm tự chấm" quy từ % tiến độ. */
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
  /** chất lượng %. */
  qualityPercent: number | null;
  /** Điểm của nhóm chất lượng - ô "Điểm tự chấm" quy từ % chất lượng. */
  qualityScore: number | null;
  /** Điểm chất lượng cán bộ tự khai. */
  qualitySelfScore: number | null;
  reportDate: string;
  /**
   * Bản ghi gốc và mẫu bảng đã khoá của dòng nhiệm vụ - để mở chi tiết hay sửa
   * nhiệm vụ ngay từ báo cáo mà không phải gọi lại API.
   */
  row?: SummaryRow;
  template?: SummaryAxisBlock["template"];
};

/**
 * Ba dòng cuối bảng của một trục, đúng khuôn công thức của mẫu:
 * "Tổng từng cột" → "Tổng điểm trục" → "Điểm quy đổi".
 *
 * Tính trên CHÍNH những cột đang bày ra bảng, để người đọc cộng tay kiểm lại
 * được. Trục chưa bật công thức (trục chấm theo mục) thì không có ba dòng này.
 */
export type AxisFooter = {
  /**
   * - ratio: [(ΣB/ΣA) + (ΣC/ΣA)] / 2, rồi nhân điểm tối đa của trục.
   * - sum  : cộng thẳng điểm các mục đạt, chặn ở điểm tối đa của trục.
   */
  mode: "ratio" | "sum";
  /** ΣA - tổng cột điểm chuẩn. */
  base: number | null;
  /** ΣB - tổng cột điểm tiến độ. */
  progress: number | null;
  /** ΣC - tổng cột điểm chất lượng. */
  quality: number | null;
  /** Tổng cột "Điểm" của từng dòng. */
  score: number | null;
  /** [(ΣB/ΣA) + (ΣC/ΣA)] / 2 - null khi chưa có mẫu số để chia. */
  ratio: number | null;
  /** ratio × điểm tối đa của trục. */
  converted: number | null;
  /** Từng tỉ lệ thành phần, để hiện "(110/160 + 110/160) / 2". */
  parts: Array<{ label: string; total: number }>;
  /**
   * Mẫu số của công thức - có thể KHÁC cột "Điểm chuẩn" đang bày (công thức
   * chia cho trần nhóm điểm chẳng hạn), nên phải nói rõ tên và số.
   */
  denominator: { label: string; total: number | null } | null;
};

/** Điểm chốt của một trục - số thật sự vào bảng điểm, tính trên tổng cột. */
export type AxisScore = {
  axisId: string;
  axisName: string;
  maxScore: number;
  score: number | null;
  entryCount: number;
  /** null = trục chưa bật công thức, không có dòng tổng nào để bày. */
  footer: AxisFooter | null;
};

export type ReportStats = {
  entryCount: number;
  missionCount: number;
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
 * Mẫu bảng ở mức đủ để đọc công thức - nhận cả mẫu đã khoá theo nhiệm vụ lẫn
 * mẫu đang áp dụng của trục.
 */
export type FormulaTemplate = {
  columns: FormTemplateColumn[];
  /** Cần cho `resultColumns` / `scoreColumns` khi mẫu chưa khai công thức. */
  headerGroups: FormHeaderGroup[];
  footer?: FormTemplateFooter;
} | null;

/**
 * Cột "Điểm tự chấm" tính ra từ một cột phần trăm (ô tự tính: % × điểm chuẩn).
 *
 * Dùng cho hai cột hiển thị "Điểm tiến độ" / "Điểm chất lượng" - chúng là cột
 * của mẫu, bày ra để đọc được vì sao điểm bằng chừng đó, không liên quan tới
 * việc công thức đang khai cột nào làm tử số.
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
function scoringColumns(template: FormulaTemplate): {
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
    /*
      Đọc ĐÚNG những cột công thức khai, không tự đổi sang cột khác cho "đẹp
      số": sửa công thức mà bảng không nhúc nhích thì người cấu hình mù tịt,
      không biết mình vừa đổi cái gì. Khai tử số là cột phần trăm mà mẫu số là
      điểm thì con số ra sẽ vô lý - và phải để nó vô lý thì mới có cái mà sửa.

      Cộng dồn không có mẫu số trong công thức; cột "Điểm chuẩn" của bảng lúc đó
      lấy nhóm điểm admin gán cho từng mục.
    */
    const baseKey =
      footer?.baseColumnKey ??
      (mode === "sum"
        ? columns.find((column) => column.semanticKey === "score_group")?.key
        : undefined);

    return {
      numerators: declared,
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

/**
 * Cột điểm chuẩn của MỘT nhiệm vụ - con số admin đã nhập cho việc đó.
 *
 * Đó là cột mà ô "Điểm tự chấm" lấy để quy đổi (% × điểm chuẩn), không phải
 * cột mẫu số của công thức: công thức có thể chia cho trần của nhóm điểm, còn
 * điểm chuẩn của từng việc vẫn là số đã nhập.
 */
function standardColumnOf(
  columns: FormTemplateColumn[],
  points: Array<FormTemplateColumn | undefined>,
  fallback?: FormTemplateColumn,
): FormTemplateColumn | undefined {
  const key = points.find((column) => column?.autoValue?.baseColumnKey)
    ?.autoValue?.baseColumnKey;
  const found = key ? columns.find((column) => column.key === key) : undefined;
  return found ?? fallback;
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

/** Nhiệm vụ tự nhập quy về cùng một dòng với việc lấy từ nhiệm vụ. */
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
  /**
   * Mẫu ĐANG ÁP DỤNG của từng trục. Nhiệm vụ khoá bộ cột theo phiên bản lúc
   * gửi, nhưng công thức tính điểm thì phải theo cấu hình hiện hành - sửa công
   * thức xong mà báo cáo không nhúc nhích thì không ai biết mình vừa đổi gì.
   * Bỏ trống = đọc công thức trong bản mẫu đã khoá.
   */
  liveTemplates?: Map<string, FormulaTemplate>,
): ReportContent {
  const entries: ReportEntry[] = [];
  const axisScores: AxisScore[] = [];

  /*
    Server trả về MỘT KHỐI CHO MỖI (trục, phiên bản mẫu): nhiệm vụ gửi trước và
    sau khi admin sửa mẫu nằm ở hai khối khác nhau dù cùng một trục. Bảng thì
    gom theo trục, nên dòng tổng cũng phải cộng qua tất cả các khối của trục đó
    - lấy mỗi khối đầu là tổng hụt mất mấy nhiệm vụ.
  */
  const axisBuckets = new Map<
    string,
    {
      axisId: string;
      axisName: string;
      maxScore: number;
      rows: SummaryRow[];
      /** Mẫu của phiên bản mới nhất - dùng để đọc tên cột cho dòng tổng. */
      template: SummaryAxisBlock["template"];
      version: number;
    }
  >();

  for (const axis of axes) {
    const template = axis.template;
    const tracking = trackingColumns(template ?? null);
    const results = resultColumns(template ?? null);
    const rows = axis.groups.flatMap((group) => group.rows);

    const bucket = axisBuckets.get(axis.axisId);
    const version = template?.version ?? 0;
    if (!bucket) {
      axisBuckets.set(axis.axisId, {
        axisId: axis.axisId,
        axisName: axis.axisName || axis.axisCode,
        maxScore: axis.axisMaxScore,
        rows: [...rows],
        template,
        version,
      });
    } else {
      bucket.rows.push(...rows);
      if (version > bucket.version) {
        bucket.template = template;
        bucket.version = version;
      }
    }
    /*
      Mỗi nhóm phần trăm (tiến độ / chất lượng) đi kèm một ô "Điểm tự chấm" quy
      từ chính nó. Bảng bày cả cặp % và điểm để đọc ra được vì sao điểm bằng
      chừng đó, thay vì bắt người xem tự nhân nhẩm với điểm chuẩn.
    */
    const columns = template?.columns ?? [];
    const scoring = scoringColumns(liveTemplates?.get(axis.axisId) ?? template);
    const progressPointColumn = tracking.progressColumn
      ? pointColumnFor(tracking.progressColumn, columns)
      : undefined;
    const qualityPointColumn = tracking.qualityColumn
      ? pointColumnFor(tracking.qualityColumn, columns)
      : undefined;
    const standardColumn = standardColumnOf(
      columns,
      [progressPointColumn, qualityPointColumn],
      scoring.base,
    );

    for (const group of axis.groups) {
      for (const row of group.rows) {
        const department = rowDepartmentRef(row);
        const title = tracking.titleColumn
          ? cellText(row, tracking.titleColumn).trim()
          : "";
        entries.push({
          key: row._id,
          kind: "MISSION",
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
          baseScore: standardColumn
            ? cellNumber(row, standardColumn, catalogs)
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
          row,
          template,
        });
      }
    }
  }

  /*
    Dòng tổng của từng trục, cộng qua mọi khối phiên bản của trục đó. Tính trên
    CHÍNH các cột bảng đang bày, để người đọc cộng tay kiểm lại được; khuôn vẫn
    đúng khuôn của mẫu: tổng cột trước, chia sau.
  */
  for (const bucket of axisBuckets.values()) {
    const template = bucket.template;
    const tracking = trackingColumns(template ?? null);
    /*
      Công thức lấy theo mẫu ĐANG ÁP DỤNG của trục; bộ cột vẫn của bản đã khoá.
      Kể cả câu hỏi "trục này đã bật công thức chưa" cũng phải hỏi bản đang áp
      dụng - admin vừa bật công thức cho trục 2 mà đi soi bản khoá từ lúc gửi
      thì đời nào thấy.
    */
    const formulaTemplate = liveTemplates?.get(bucket.axisId) ?? template;
    const scoring = scoringColumns(formulaTemplate);
    const columns = template?.columns ?? [];
    const progressPointColumn = tracking.progressColumn
      ? pointColumnFor(tracking.progressColumn, columns)
      : undefined;
    const qualityPointColumn = tracking.qualityColumn
      ? pointColumnFor(tracking.qualityColumn, columns)
      : undefined;

    const totalOf = (column?: FormTemplateColumn): number | null => {
      if (!column) return null;
      let sum = 0;
      let seen = false;
      for (const row of bucket.rows) {
        const value = cellNumber(row, column, catalogs);
        if (value === null) continue;
        sum += value;
        seen = true;
      }
      return seen ? sum : null;
    };

    // Cột "Điểm chuẩn" của bảng: số admin đã nhập cho từng việc.
    const standardColumn = standardColumnOf(
      columns,
      [progressPointColumn, qualityPointColumn],
      scoring.base,
    );
    const standardTotal = totalOf(standardColumn);
    // Mẫu số của công thức - có thể là cột khác (trần nhóm điểm chẳng hạn).
    const baseTotal = totalOf(scoring.base);
    const scored = scoring.numerators
      .map((column) => ({ column, total: totalOf(column) }))
      .filter(
        (item): item is { column: FormTemplateColumn; total: number } =>
          item.total !== null,
      );

    // Chỉ trục đã bật công thức mới có dòng tổng; mẫu số 0 hoặc trống thì không
    // có tỉ lệ nào để nói, không phải là 0 điểm.
    let axisFooter: AxisFooter | null = null;
    if (formulaTemplate?.footer?.enabled && scored.length) {
      const scoreTotal = scored.reduce((sum, item) => sum + item.total, 0);
      const parts = scored.map((item) => ({
        label: item.column.title,
        total: item.total,
      }));

      if (scoring.mode === "sum") {
        /*
          Cộng dồn: điểm trục = tổng điểm các mục đã chấm, chặn ở điểm tối đa
          của trục. Mục nào bị đánh "Không đạt" thì điểm của nó đã bằng 0 từ lúc
          chỉ huy chốt, nên cứ cộng thẳng là đúng. Khớp từng chữ với
          `computeAxisFooter` và `computeAxisScore` bên server.
        */
        const converted =
          bucket.maxScore > 0
            ? Math.min(scoreTotal, bucket.maxScore)
            : scoreTotal;
        axisFooter = {
          mode: "sum",
          base: standardTotal,
          progress: null,
          quality: null,
          score: scoreTotal,
          ratio: bucket.maxScore > 0 ? converted / bucket.maxScore : null,
          converted,
          parts,
          denominator: null,
        };
      } else {
        const ratio =
          baseTotal && baseTotal !== 0
            ? scored.reduce((sum, item) => sum + item.total / baseTotal, 0) /
              scored.length
            : null;
        axisFooter = {
          mode: "ratio",
          base: standardTotal,
          progress: totalOf(progressPointColumn),
          quality: totalOf(qualityPointColumn),
          score: bucket.rows.length
            ? bucket.rows.reduce(
                (sum, row) =>
                  sum +
                  (rowScore(row, scoring.numerators, scoring.mode, catalogs) ??
                    0),
                0,
              )
            : null,
          ratio,
          converted: ratio === null ? null : ratio * bucket.maxScore,
          parts,
          denominator: scoring.base
            ? { label: scoring.base.title, total: baseTotal }
            : null,
        };
      }
    }

    // Trục chưa bật công thức (trục chấm theo mục) thì vẫn cần một con số cho
    // tiêu đề nhóm - lấy theo đúng luật của bảng tổng.
    const boardFooter = computeAxisFooter(
      bucket.rows,
      columns,
      formulaTemplate?.footer,
      bucket.maxScore,
      catalogs,
    );

    axisScores.push({
      axisId: bucket.axisId,
      axisName: bucket.axisName,
      maxScore: bucket.maxScore,
      score: axisFooter?.converted ?? boardFooter.convertedScore,
      entryCount: bucket.rows.length,
      footer: axisFooter,
    });
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
      missionCount: entries.length - manualItems.length,
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
  /** Ba dòng cuối bảng; chỉ có khi gom theo trục và trục đã bật công thức. */
  footer: AxisFooter | null;
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
      footer: axis?.footer ?? null,
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
      footer: null,
      entries: [],
    };
    group.entries.push(entry);
    groups.set(key, group);
  }

  return [...groups.values()].sort((left, right) =>
    left.label.localeCompare(right.label, "vi"),
  );
}
