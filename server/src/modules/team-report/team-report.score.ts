import {
  FormTemplateColumn,
  FormTemplateFooter,
  formulaValueSource,
} from '@/modules/mission-form-config/schemas/form-template.schema';

/**
 * Điểm theo TRỤC của báo cáo ngày cấp đội.
 *
 * Công thức chép đúng `computeAxisFooter` của bản nghiệp vụ cũ, không nghĩ lại:
 * cùng một bảng KPI mà hai bản ra hai con số thì hỏng hơn là không tính. Đặt
 * trong module này chứ không gọi sang `personal-mission` để hai bản vẫn gỡ rời
 * được - đổi lại là nếu bên kia sửa công thức thì phải sửa cả ở đây.
 */

/** Danh mục cần để đọc số từ ô chọn - do `catalogsForTemplates` trả về. */
export type ScoreCatalogs = {
  score_group?: Array<{ _id: string; maxScore?: number }>;
  quality_level?: Array<{ _id: string; percent?: number }>;
};

/** Một dòng đủ để tính điểm - dùng được cho cả bản chụp lẫn nhiệm vụ sống. */
export type ScorableRow = {
  fieldValues?: Record<string, string | number> | null;
  catalogValues?: Record<string, { id: string; name: string }> | null;
  reviewValues?: Record<string, string | number> | null;
  reviewCatalogValues?: Record<string, { id: string; name: string }> | null;
};

/**
 * Con số một ô đóng góp vào công thức.
 *
 * Không phải cứ cột số mới cộng được: cột Nhóm điểm góp ĐIỂM TỐI ĐA của nhóm
 * được chọn, cột Chất lượng thực hiện góp PHẦN TRĂM của mức được chọn.
 *
 * Số cấp trên chấm lại đè lên số đội tự khai - đó là con số đã chốt.
 */
function cellNumber(
  row: ScorableRow,
  column: FormTemplateColumn,
  catalogs: ScoreCatalogs,
): number | null {
  const source = formulaValueSource(column);
  if (!source) return null;

  if (source === 'score_group_max' || source === 'quality_percent') {
    const id =
      row.reviewCatalogValues?.[column.key]?.id ??
      row.catalogValues?.[column.key]?.id;
    if (!id) return null;

    if (source === 'score_group_max') {
      const group = (catalogs.score_group ?? []).find(
        (item) => item._id === String(id),
      );
      return group?.maxScore ?? null;
    }
    const level = (catalogs.quality_level ?? []).find(
      (item) => item._id === String(id),
    );
    return level?.percent ?? null;
  }

  const reviewed = row.reviewValues?.[column.key];
  const raw =
    reviewed !== undefined && String(reviewed).trim() !== ''
      ? String(reviewed).trim()
      : String(row.fieldValues?.[column.key] ?? '').trim();
  if (!raw) return null;
  // Giá trị nhập lưu dạng chuỗi nên phải nhận cả dấu phẩy thập phân.
  const parsed = Number(raw.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Diễn giải công thức của một trục, để bảng bày đúng ba dòng cuối như mẫu giấy:
 * "Tổng từng cột", "Tổng điểm trục", "Điểm quy đổi".
 *
 * Server trả cả NHÃN VAI (A, B, C...) lẫn con số, client chỉ ghép chuỗi. Để
 * client tự đoán cột nào là mẫu số thì chỉ cần quản trị đổi công thức là bảng
 * bày một đằng, điểm tính một nẻo.
 */
export type AxisFormulaPart = {
  /** A = mẫu số; B, C, D... = các tử số, đúng thứ tự trong công thức. */
  role: string;
  key: string;
  title: string;
  /** Tổng của cột đó; null = chưa ô nào có số. */
  total: number | null;
};

export type AxisFormula = {
  mode: 'ratio' | 'sum';
  /** Chỉ có ở công thức tỉ lệ - cột đem chia. */
  base: AxisFormulaPart | null;
  parts: AxisFormulaPart[];
};

/** B, C, D... theo thứ tự tử số trong công thức. */
function roleLabel(index: number): string {
  return String.fromCharCode(66 + index);
}

export function describeFooter(
  columns: FormTemplateColumn[],
  footer: FormTemplateFooter | undefined,
  columnTotals: Record<string, number>,
): AxisFormula | null {
  if (!footer?.enabled || !footer.ratioColumnKeys?.length) return null;

  const byKey = new Map(columns.map((column) => [column.key, column]));
  const partOf = (key: string, role: string): AxisFormulaPart => ({
    role,
    key,
    title: byKey.get(key)?.title ?? key,
    total: columnTotals[key] ?? null,
  });

  return {
    mode: footer.mode === 'sum' ? 'sum' : 'ratio',
    base:
      footer.mode === 'sum' || !footer.baseColumnKey
        ? null
        : partOf(footer.baseColumnKey, 'A'),
    parts: footer.ratioColumnKeys.map((key, index) =>
      partOf(key, roleLabel(index)),
    ),
  };
}

export type AxisFooterTotals = {
  /** Tổng mỗi cột số, khoá theo `column.key`. Cột chưa ai nhập thì vắng mặt. */
  columnTotals: Record<string, number>;
  /** Tỉ lệ đạt của trục (0-1). null = chưa đủ dữ liệu để chia. */
  axisScore: number | null;
  /** Điểm quy đổi = tỉ lệ × điểm tối đa của trục. */
  convertedScore: number | null;
};

/**
 * Dòng tổng của một trục.
 *
 * Tỉ lệ tính trên TỔNG CỘT chứ không phải trung bình tỉ lệ từng dòng: việc có
 * điểm chuẩn cao phải nặng hơn việc điểm chuẩn thấp. Hai cách cho ra số khác
 * nhau nên chỗ này không được đổi tuỳ tiện.
 */
export function computeAxisFooter(
  rows: ScorableRow[],
  columns: FormTemplateColumn[],
  footer: FormTemplateFooter | undefined,
  axisMaxScore: number,
  catalogs: ScoreCatalogs,
): AxisFooterTotals {
  const columnTotals: Record<string, number> = {};
  for (const column of columns) {
    if (!formulaValueSource(column)) continue;

    /* Điểm chuẩn cộng theo từng dòng như mọi cột khác: mỗi nhiệm vụ mang trần
       điểm của nhóm nó thuộc về, hai việc cùng Nhóm 1 thì mẫu số là 50 + 50. */
    let sum = 0;
    let seen = false;
    for (const row of rows) {
      const value = cellNumber(row, column, catalogs);
      if (value === null) continue;
      sum += value;
      seen = true;
    }
    // Cột chưa ai nhập thì để trống - hiện 0 là nhìn như đã chấm 0 điểm.
    if (seen) columnTotals[column.key] = sum;
  }

  const empty: AxisFooterTotals = {
    columnTotals,
    axisScore: null,
    convertedScore: null,
  };
  if (!footer?.enabled || !footer.ratioColumnKeys?.length) return empty;

  /* Cộng dồn: điểm trục = tổng điểm các mục đã chấm, chặn ở điểm tối đa trục. */
  if (footer.mode === 'sum') {
    const scored = footer.ratioColumnKeys.filter(
      (key) => columnTotals[key] !== undefined,
    );
    if (!scored.length) return empty;

    const total = scored.reduce((sum, key) => sum + columnTotals[key], 0);
    const converted = axisMaxScore > 0 ? Math.min(total, axisMaxScore) : total;
    return {
      columnTotals,
      axisScore: axisMaxScore > 0 ? converted / axisMaxScore : null,
      convertedScore: converted,
    };
  }

  if (!footer.baseColumnKey) return empty;

  const base = columnTotals[footer.baseColumnKey];
  // Mẫu số 0 hoặc trống thì không có tỉ lệ nào để nói, khác hẳn "0 điểm".
  if (!base) return empty;

  const ratios = footer.ratioColumnKeys.map(
    (key) => (columnTotals[key] ?? 0) / base,
  );
  const axisScore =
    ratios.reduce((sum, value) => sum + value, 0) / ratios.length;

  return { columnTotals, axisScore, convertedScore: axisScore * axisMaxScore };
}
