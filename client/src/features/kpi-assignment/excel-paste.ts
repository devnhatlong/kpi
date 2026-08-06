import type {
  Axis,
  ScoreGroup,
  WorkContent,
} from "@/features/kpi-form-config/types";
import { entityId } from "@/features/kpi-form-config/types";

export type PastedRow = {
  axisId: string;
  workContentId: string;
  title: string;
  product: string;
  scoreGroupId: string;
  deadline: string;
};

export type PasteCatalog = {
  axes: Axis[];
  workContents: WorkContent[];
  scoreGroups: ScoreGroup[];
};

export type PasteResult = {
  rows: PastedRow[];
  errors: string[];
};

/** Thứ tự cột khi dán từ Excel. */
export const PASTE_COLUMNS = [
  "Trục",
  "Nội dung công việc",
  "Tên nhiệm vụ",
  "Sản phẩm dự kiến",
  "Nhóm điểm",
  "Thời hạn",
] as const;

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function contentAxisId(item: WorkContent) {
  if (!item.axisId) return "";
  return typeof item.axisId === "string" ? item.axisId : item.axisId._id;
}

/** Khớp theo mã trước, rồi tới tên - cả hai đều bỏ qua hoa thường và khoảng trắng thừa. */
function matchByCodeOrName<T extends { code: string; name: string }>(
  items: T[],
  raw: string,
): T | undefined {
  const key = normalize(raw);
  if (!key) return undefined;
  return (
    items.find((item) => normalize(item.code) === key) ??
    items.find((item) => normalize(item.name) === key)
  );
}

/** Nhận dd/mm/yyyy, yyyy-mm-dd hoặc số serial ngày của Excel. */
export function parsePastedDate(raw: string): string {
  const value = raw.trim();
  if (!value) return "";

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  const slash = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (slash) {
    const [, day, month, year] = slash;
    return `${year}-${month!.padStart(2, "0")}-${day!.padStart(2, "0")}`;
  }

  // Excel đếm ngày từ 30/12/1899.
  if (/^\d{5}$/.test(value)) {
    const serial = Number(value);
    const base = Date.UTC(1899, 11, 30);
    const date = new Date(base + serial * 86_400_000);
    return date.toISOString().slice(0, 10);
  }

  return "";
}

/**
 * Tách dữ liệu dán từ Excel (TSV) thành các dòng nhiệm vụ.
 * Dòng đầu nếu trùng tên cột thì bỏ qua. Dòng nào sai thì báo lỗi kèm số dòng
 * và không đưa vào kết quả.
 */
export function parsePastedRows(
  text: string,
  catalog: PasteCatalog,
): PasteResult {
  const rows: PastedRow[] = [];
  const errors: string[] = [];

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);

  if (!lines.length) return { rows, errors: ["Chưa có dữ liệu để dán."] };

  const firstCells = lines[0]!.split("\t").map(normalize);
  const isHeader = firstCells[0] === normalize(PASTE_COLUMNS[0]);
  const dataLines = isHeader ? lines.slice(1) : lines;

  dataLines.forEach((line, index) => {
    const at = `Dòng ${index + 1}`;
    const cells = line.split("\t").map((cell) => cell.trim());
    const [rawAxis = "", rawContent = "", title = "", product = "", rawScore = "", rawDeadline = ""] =
      cells;

    const axis = matchByCodeOrName(catalog.axes, rawAxis);
    if (!axis) {
      errors.push(`${at}: không tìm thấy trục "${rawAxis}".`);
      return;
    }

    const axisId = entityId(axis);
    const contentsOfAxis = catalog.workContents.filter(
      (item) => contentAxisId(item) === axisId,
    );
    const content = matchByCodeOrName(contentsOfAxis, rawContent);
    if (!content) {
      errors.push(
        `${at}: nội dung "${rawContent}" không có trong trục "${axis.name}".`,
      );
      return;
    }

    if (!title.trim()) {
      errors.push(`${at}: thiếu tên nhiệm vụ.`);
      return;
    }

    const scoreGroup = matchByCodeOrName(catalog.scoreGroups, rawScore);
    if (!scoreGroup) {
      errors.push(`${at}: không tìm thấy nhóm điểm "${rawScore}".`);
      return;
    }

    const deadline = parsePastedDate(rawDeadline);
    if (rawDeadline.trim() && !deadline) {
      errors.push(`${at}: thời hạn "${rawDeadline}" không đọc được.`);
      return;
    }

    rows.push({
      axisId,
      workContentId: entityId(content),
      title: title.trim(),
      product: product.trim(),
      scoreGroupId: entityId(scoreGroup),
      deadline,
    });
  });

  return { rows, errors };
}
