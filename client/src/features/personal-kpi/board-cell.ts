import type { PersonalKpiBoardRow } from "@/features/personal-kpi/api";
import {
  effectiveMaxScore,
  footerMode,
  formulaValueSource,
  type FormTemplateColumn,
  type FormTemplateFooter,
  type QualityLevel,
  type ScoreGroup,
} from "@/features/kpi-form-config/types";

/** Tên hiển thị của một tham chiếu đã populate; chuỗi id thì không có gì để đọc. */
export function refLabel(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return "";
  const ref = value as { name?: string; fullName?: string; username?: string };
  return ref.fullName ?? ref.name ?? ref.username ?? "";
}

/** Một trường chữ của tham chiếu đã populate; chuỗi id thì chưa join, không có gì. */
function refField(value: unknown, field: "description" | "note"): string {
  if (!value || typeof value === "string") return "";
  const ref = value as Partial<Record<typeof field, string>>;
  return ref[field] ?? "";
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
    /*
      Nhiệm vụ / Ghi chú: chữ admin khai ở danh mục, đọc thẳng từ nội dung công
      việc đã populate. Không lưu theo từng nhiệm vụ nên sửa danh mục là mọi
      bảng cũ đổi theo - đúng ý "admin khai một lần".
    */
    case "work_content_task":
      return refField(row.workContentId, "description");
    case "work_content_note":
      return refField(row.workContentId, "note");
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

/** Danh mục cần để quy cột dropdown ra số - tra theo id đã lưu ở catalogValues. */
export type FormulaCatalogs = {
  scoreGroups: Map<string, ScoreGroup>;
  qualityLevels: Map<string, QualityLevel>;
};

export const EMPTY_FORMULA_CATALOGS: FormulaCatalogs = {
  scoreGroups: new Map(),
  qualityLevels: new Map(),
};

/**
 * Số mà một ô đóng góp vào công thức, null khi ô trống hoặc không ra số.
 *
 * Cột Điểm chuẩn là dropdown Nhóm điểm nên không có số nào trong fieldValues -
 * phải tra sang danh mục lấy điểm tối đa của nhóm được chọn. Cột Chất lượng
 * thực hiện cũng vậy, lấy phần trăm của mức được chọn.
 */
export function cellNumber(
  row: PersonalKpiBoardRow,
  column: FormTemplateColumn,
  catalogs: FormulaCatalogs = EMPTY_FORMULA_CATALOGS,
): number | null {
  const source = formulaValueSource(column);
  if (!source) return null;

  /*
    Ô nào chỉ huy đã chấm lại thì lấy số của chỉ huy - đó mới là số chốt.
    Đọc theo TỪNG Ô chứ không phải "đã chấm thì bỏ hết số cũ": chỉ huy có thể
    chỉ sửa cột chất lượng, cột còn lại vẫn phải có số để chia.
    Luật này phải khớp `cellNumber` bên server, lệch là bảng và báo cáo ra hai
    con số khác nhau.
  */
  if (source === "score_group_max" || source === "quality_percent") {
    const id =
      row.reviewCatalogValues?.[column.key]?.id ??
      row.catalogValues?.[column.key]?.id;
    if (!id) return null;
    if (source === "score_group_max") {
      const group = catalogs.scoreGroups.get(id);
      return group ? effectiveMaxScore(group) : null;
    }
    const level = catalogs.qualityLevels.get(id);
    return level ? level.percent : null;
  }

  const reviewed = row.reviewValues?.[column.key];
  const raw =
    reviewed !== undefined && String(reviewed).trim() !== ""
      ? String(reviewed).trim()
      : cellText(row, column).trim();
  if (!raw) return null;
  // Dữ liệu nhập lưu dạng chuỗi nên phải nhận cả dấu phẩy thập phân.
  const parsed = Number(raw.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

export type AxisFooterTotals = {
  /** Tổng mỗi cột số, khoá theo column.key. Cột không có số nào thì không có mặt. */
  columnTotals: Record<string, number>;
  /** Trung bình cộng của (Σ tử số / Σ mẫu số). null = chưa đủ dữ liệu để chia. */
  axisScore: number | null;
  /** axisScore × điểm max của trục. */
  convertedScore: number | null;
};

/**
 * Ba dòng cuối bảng của một trục.
 *
 * Tỉ lệ tính trên TỔNG CỘT chứ không phải trung bình tỉ lệ từng dòng: việc có
 * điểm chuẩn cao phải nặng hơn việc điểm chuẩn thấp. Hai cách cho ra số khác
 * nhau nên chỗ này không được đổi tuỳ tiện.
 */
export function computeAxisFooter(
  rows: PersonalKpiBoardRow[],
  columns: FormTemplateColumn[],
  footer: FormTemplateFooter | undefined,
  axisMaxScore: number,
  catalogs: FormulaCatalogs = EMPTY_FORMULA_CATALOGS,
): AxisFooterTotals {
  const columnTotals: Record<string, number> = {};
  for (const column of columns) {
    if (!formulaValueSource(column)) continue;

    // Điểm chuẩn cộng theo từng dòng như mọi cột khác: mỗi nhiệm vụ mang trần
    // điểm của nhóm nó thuộc về, hai việc cùng Nhóm 1 thì mẫu số là 49 + 49.
    let sum = 0;
    let seen = false;
    for (const row of rows) {
      const value = cellNumber(row, column, catalogs);
      if (value === null) continue;
      sum += value;
      seen = true;
    }
    // Cột chưa ai nhập thì để trống, hiện 0 là nhìn như đã chấm 0 điểm.
    if (seen) columnTotals[column.key] = sum;
  }

  const empty = { columnTotals, axisScore: null, convertedScore: null };
  if (!footer?.enabled || !footer.ratioColumnKeys.length) return empty;

  /*
    Cộng dồn: điểm trục = tổng điểm các mục đã chấm, chặn ở điểm tối đa trục.
    PHẢI khớp từng chữ với `computeAxisScore` bên server - lệch một nhánh là
    bảng hiện một số, báo cáo lưu một số khác.
  */
  if (footerMode(footer) === "sum") {
    const scored = footer.ratioColumnKeys.filter(
      (key) => columnTotals[key] !== undefined,
    );
    if (!scored.length) return empty;

    const total = scored.reduce((sum, key) => sum + columnTotals[key]!, 0);
    const converted = axisMaxScore > 0 ? Math.min(total, axisMaxScore) : total;
    return {
      columnTotals,
      axisScore: axisMaxScore > 0 ? converted / axisMaxScore : null,
      convertedScore: converted,
    };
  }

  if (!footer.baseColumnKey) return empty;

  const base = columnTotals[footer.baseColumnKey];
  // Mẫu số 0 hoặc trống thì không có tỉ lệ nào để nói, không phải là 0 điểm.
  if (!base) return empty;

  const ratios = footer.ratioColumnKeys.map(
    (key) => (columnTotals[key] ?? 0) / base,
  );
  const axisScore = ratios.reduce((sum, value) => sum + value, 0) / ratios.length;

  return { columnTotals, axisScore, convertedScore: axisScore * axisMaxScore };
}

/** Số điểm gọn mắt - bỏ đuôi 0 thừa, không hiện 0.87500000000001. */
export function formatScoreNumber(value: number, maxDigits = 2): string {
  return new Intl.NumberFormat("vi-VN", {
    maximumFractionDigits: maxDigits,
  }).format(value);
}

/** Đơn vị đứng tên một dòng: ưu tiên nơi đã gửi lên, không có thì đơn vị của cán bộ. */
export function rowDepartmentRef(row: PersonalKpiBoardRow): {
  id: string;
  code: string;
  name: string;
} {
  const raw = row.lastSenderDepartmentId || row.ownerDepartmentId;
  // Chuỗi id trơ (chưa populate) thì không có tên để gom nhóm, coi như chưa rõ.
  if (!raw || typeof raw === "string") return { id: "", code: "", name: "" };
  return {
    id: String(raw._id ?? ""),
    code: raw.code ?? "",
    name: raw.name ?? "",
  };
}

/** Khoá gom nhóm theo đơn vị; rỗng = nhiệm vụ chưa gắn đơn vị nào. */
export function rowDepartmentKey(row: PersonalKpiBoardRow): string {
  return rowDepartmentRef(row).id;
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
