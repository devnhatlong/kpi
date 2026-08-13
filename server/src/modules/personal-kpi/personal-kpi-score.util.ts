import {
  FormTemplateColumn,
  FormTemplateFooter,
  formulaValueSource,
} from '@/modules/kpi-form-config/schemas/form-template.schema';
import { scoreGroupFormulaScore } from '@/modules/kpi-form-config/score-group.constants';

/**
 * Tính điểm trục từ các dòng nhiệm vụ - bản server của công thức đang chạy ở
 * cuối bảng duyệt.
 *
 *   tổng điểm trục = trung bình cộng của (Σ tử số i / Σ mẫu số)
 *   điểm quy đổi   = tổng điểm trục × điểm tối đa của trục
 *
 * Tỉ lệ tính trên TỔNG CỘT chứ không phải trung bình tỉ lệ từng dòng: việc có
 * điểm chuẩn cao phải nặng hơn việc điểm chuẩn thấp. Hai cách cho ra số khác
 * nhau nên chỗ này phải khớp đúng bản client, đừng sửa một bên.
 */

/** Nhóm điểm / mức chất lượng đã nạp sẵn, tra theo id lưu ở catalogValues. */
export type ScoreCatalogs = {
  scoreGroups: Map<
    string,
    { maxScore: number; maxInclusive: boolean; formulaScore?: number | null }
  >;
  qualityLevels: Map<string, { percent: number }>;
};

/** Chỉ cần đúng phần dữ liệu để tính, không buộc phải là document đầy đủ. */
export type ScorableRow = {
  fieldValues?: Record<string, string | number>;
  catalogValues?: Record<string, { id: string; name: string }>;
};

export type AxisScore = {
  /** Tổng mỗi cột tính được, khoá theo column.key. */
  columnTotals: Record<string, number>;
  /** Trung bình cộng của (Σ tử số / Σ mẫu số). null = chưa đủ dữ liệu để chia. */
  axisScore: number | null;
  /** axisScore × điểm tối đa của trục. */
  convertedScore: number | null;
};

/** Số mà một ô đóng góp vào công thức, null khi trống hoặc không ra số. */
export function cellNumber(
  row: ScorableRow,
  column: FormTemplateColumn,
  catalogs: ScoreCatalogs,
): number | null {
  const source = formulaValueSource(column);
  if (!source) return null;

  if (source === 'score_group_max') {
    const id = row.catalogValues?.[column.key]?.id;
    const group = id ? catalogs.scoreGroups.get(id) : undefined;
    return group ? scoreGroupFormulaScore(group) : null;
  }

  if (source === 'quality_percent') {
    const id = row.catalogValues?.[column.key]?.id;
    const level = id ? catalogs.qualityLevels.get(id) : undefined;
    return level ? level.percent : null;
  }

  const raw = row.fieldValues?.[column.key];
  if (raw === undefined || raw === null) return null;
  const text = String(raw).trim();
  if (!text) return null;
  // Dữ liệu nhập lưu dạng chuỗi nên phải nhận cả dấu phẩy thập phân.
  const parsed = Number(text.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

export function computeAxisScore(
  rows: ScorableRow[],
  columns: FormTemplateColumn[],
  footer: FormTemplateFooter | undefined,
  axisMaxScore: number,
  catalogs: ScoreCatalogs,
): AxisScore {
  const columnTotals: Record<string, number> = {};
  for (const column of columns) {
    if (!formulaValueSource(column)) continue;
    let sum = 0;
    let seen = false;
    for (const row of rows) {
      const value = cellNumber(row, column, catalogs);
      if (value === null) continue;
      sum += value;
      seen = true;
    }
    // Cột chưa ai nhập thì để trống, ghi 0 là nhìn như đã chấm 0 điểm.
    if (seen) columnTotals[column.key] = sum;
  }

  const empty: AxisScore = {
    columnTotals,
    axisScore: null,
    convertedScore: null,
  };
  if (
    !footer?.enabled ||
    !footer.baseColumnKey ||
    !footer.ratioColumnKeys?.length
  ) {
    return empty;
  }

  const base = columnTotals[footer.baseColumnKey];
  // Mẫu số 0 hoặc trống thì không có tỉ lệ nào để nói, không phải là 0 điểm.
  if (!base) return empty;

  const ratios = footer.ratioColumnKeys.map(
    (key) => (columnTotals[key] ?? 0) / base,
  );
  const axisScore =
    ratios.reduce((sum, value) => sum + value, 0) / ratios.length;

  return { columnTotals, axisScore, convertedScore: axisScore * axisMaxScore };
}
