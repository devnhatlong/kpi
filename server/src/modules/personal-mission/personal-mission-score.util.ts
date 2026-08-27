import {
  FormTemplateColumn,
  FormTemplateFooter,
  formulaValueSource,
} from '@/modules/mission-form-config/schemas/form-template.schema';
import { scoreGroupFormulaScore } from '@/modules/mission-form-config/score-group.constants';

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
  /** Điểm chỉ huy chấm lại - có thì lấy, đây mới là số chốt. */
  reviewValues?: Record<string, string | number>;
  reviewCatalogValues?: Record<string, { id: string; name: string }>;
};

/**
 * Ô nào chỉ huy đã chấm thì lấy số của chỉ huy, còn lại giữ số cán bộ tự chấm.
 *
 * Đọc theo TỪNG Ô chứ không phải "có chấm thì bỏ hết số cũ": chỉ huy có thể chỉ
 * sửa cột chất lượng, cột tiến độ giữ nguyên - lúc đó cột tiến độ vẫn phải có
 * số để chia, không thì cả trục mất mẫu số.
 */
function pickRaw(row: ScorableRow, key: string): string | number | undefined {
  const reviewed = row.reviewValues?.[key];
  if (reviewed !== undefined && String(reviewed).trim() !== '') return reviewed;
  return row.fieldValues?.[key];
}

function pickCatalogId(row: ScorableRow, key: string): string | undefined {
  return row.reviewCatalogValues?.[key]?.id ?? row.catalogValues?.[key]?.id;
}

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
    const id = pickCatalogId(row, column.key);
    const group = id ? catalogs.scoreGroups.get(id) : undefined;
    return group ? scoreGroupFormulaScore(group) : null;
  }

  if (source === 'quality_percent') {
    const id = pickCatalogId(row, column.key);
    const level = id ? catalogs.qualityLevels.get(id) : undefined;
    return level ? level.percent : null;
  }

  const raw = pickRaw(row, column.key);
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
  if (!footer?.enabled || !footer.ratioColumnKeys?.length) return empty;

  /*
    Cộng dồn: điểm trục = tổng điểm các mục đã chấm, chặn ở điểm tối đa trục.
    Trục kiểu này (Đạt / Không đạt, mỗi mục một điểm chuẩn riêng) không có mẫu
    số để chia - đem chia thì hai mục cùng đạt lại ra tỉ lệ 1 rồi × trần trục,
    thành ra mục nào cũng thành điểm tối đa.
  */
  if (footer.mode === 'sum') {
    const scored = footer.ratioColumnKeys.filter(
      (key) => columnTotals[key] !== undefined,
    );
    // Chưa cột nào có số = chưa chấm, khác hẳn "chấm 0 điểm".
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
  const axisScore =
    ratios.reduce((sum, value) => sum + value, 0) / ratios.length;

  return { columnTotals, axisScore, convertedScore: axisScore * axisMaxScore };
}
