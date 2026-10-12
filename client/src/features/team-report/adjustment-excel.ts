import ExcelJS from "exceljs";
import { saveAs } from "file-saver";

import { LEFT_SEMANTICS } from "@/features/team-report/components/team-report-adjustment-table";
import {
  setOutlineBorder,
  sheetName,
  slugify,
} from "@/features/team-report/excel";
import {
  catalogOfColumn,
  formatScore,
  type TeamReportAdjustmentEntry,
  type TeamReportAdjustmentItem,
  type TeamReportAdjustmentSection,
  type TeamReportCatalogs,
  type TeamReportColumn,
  type TeamReportTemplate,
} from "@/features/team-report/types";

/*
  Xuất "Bảng đề xuất điểm cộng, điểm trừ và điều chỉnh, khống chế mức xếp
  loại" ra Excel - đúng khuôn bảng trên màn (và mẫu giấy): mỗi phần một bảng,
  hai tầng tiêu đề "Nội dung để soi chiếu | Nội dung theo dõi, thẩm định", nửa
  trái gộp dọc theo mục, nửa phải mỗi dòng kết quả một hàng.

  Bộ cột lấy từ MẪU của từng phần như màn hình - quản trị đổi mẫu thì file in
  ra đổi theo, không có cột cứng nào ở đây.
*/

const SECTIONS: Array<{
  key: TeamReportAdjustmentSection;
  numeral: string;
  title: string;
}> = [
  { key: "BONUS", numeral: "I", title: "ĐIỂM CỘNG" },
  { key: "PENALTY", numeral: "II", title: "ĐIỂM TRỪ" },
  {
    key: "RANKING",
    numeral: "III",
    title: "ĐỀ XUẤT ĐIỀU CHỈNH, KHỐNG CHẾ MỨC XẾP LOẠI",
  },
];

const HEAD_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFE2E8F0" },
};
const TOTAL_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFF1F5F9" },
};

export type AdjustmentExportInput = {
  /** "YYYY-MM". */
  periodMonth: string;
  /** Đơn vị lập bảng - có thì ghi dưới tiêu đề và vào tên tệp. */
  unitName?: string;
  statusLabel?: string;
  catalog: TeamReportAdjustmentItem[];
  entries: TeamReportAdjustmentEntry[];
  templates: Partial<
    Record<TeamReportAdjustmentSection, TeamReportTemplate | null>
  >;
  totals: { bonus: number; penalty: number; net: number };
  /** Danh mục cho ô kiểu chọn (đơn vị) - để in TÊN thay cho id. */
  catalogs?: TeamReportCatalogs;
};

/** Giá trị một ô nửa phải - số ghi dạng số, ô chọn in tên, ô tích in "x". */
function cellValue(
  column: TeamReportColumn,
  raw: string | number | undefined,
  catalogs: TeamReportCatalogs,
): string | number {
  if (raw === undefined || raw === null || String(raw).trim() === "") return "";
  const catalog = catalogOfColumn(column);
  if (catalog) {
    const options = catalogs[catalog] ?? [];
    return String(raw)
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
      .map((id) => options.find((item) => item._id === id)?.name ?? id)
      .join("; ");
  }
  if (column.dataType === "boolean") {
    const text = String(raw).trim().toLowerCase();
    return text === "true" || text === "1" || text === "x" ? "x" : "";
  }
  if (column.dataType === "number") {
    const value = Number(String(raw).replace(",", "."));
    if (Number.isFinite(value)) return value;
  }
  return String(raw);
}

/** Ô nửa trái của một mục - chép từ danh mục. */
function leftValue(
  column: TeamReportColumn,
  item: TeamReportAdjustmentItem,
  ordinal: number,
): string | number {
  switch (column.semanticKey) {
    case "stt":
      return ordinal;
    case "adjustment_name":
      return item.name;
    case "adjustment_rule":
      return item.rule;
    case "adjustment_max_score":
      return item.maxScore === null
        ? "-"
        : `Tối đa ${formatScore(item.maxScore)}`;
    default:
      return "";
  }
}

/** Bề rộng cột (ký tự). Cột điều kiện vừa đủ đọc, để chỗ cho nửa phải. */
function widthOf(column: TeamReportColumn) {
  if (column.semanticKey === "stt") return 5;
  if (column.semanticKey === "adjustment_rule") return 38;
  if (column.semanticKey === "adjustment_name") return 26;
  if (column.semanticKey === "adjustment_max_score") return 10;
  if (column.dataType === "number" || column.dataType === "boolean") return 12;
  return Math.min(50, Math.max(14, Math.round(column.width / 7)));
}

export async function exportAdjustmentToExcel(input: AdjustmentExportInput) {
  const catalogs = input.catalogs ?? {};
  const [y, m] = input.periodMonth.split("-");
  const month = `${m}/${y}`;

  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(sheetName(`Thang ${month}`, "Bang"), {
    pageSetup: {
      paperSize: 9,
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
  });

  const sections = SECTIONS.map((section) => {
    const template = input.templates[section.key] ?? null;
    const columns = (template?.columns ?? []).filter((c) => c.visible);
    return {
      ...section,
      template,
      left: columns.filter((c) => LEFT_SEMANTICS.has(c.semanticKey)),
      right: columns.filter((c) => !LEFT_SEMANTICS.has(c.semanticKey)),
      items: input.catalog.filter((item) => item.section === section.key),
    };
  }).filter((section) => section.items.length);

  const widest = Math.max(
    6,
    ...sections.map((s) => s.left.length + s.right.length),
  );
  const widen = (col: number, width: number) => {
    const current = sheet.getColumn(col).width ?? 0;
    if (width > current) sheet.getColumn(col).width = width;
  };

  const banner = (row: number, text: string, bold = false, size = 11) => {
    sheet.mergeCells(row, 1, row, widest);
    const cell = sheet.getCell(row, 1);
    cell.value = text;
    cell.font = { bold, size };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  };
  banner(
    1,
    "BẢNG ĐỀ XUẤT ĐIỂM CỘNG, ĐIỂM TRỪ VÀ ĐIỀU CHỈNH, KHỐNG CHẾ MỨC XẾP LOẠI",
    true,
    14,
  );
  banner(
    2,
    [`Tháng ${month}`, input.unitName ?? "", input.statusLabel ?? ""]
      .filter(Boolean)
      .join("   ·   "),
  );

  const byItem = new Map<string, TeamReportAdjustmentEntry[]>();
  for (const entry of input.entries) {
    byItem.set(entry.itemId, [...(byItem.get(entry.itemId) ?? []), entry]);
  }

  const head = (
    row: number,
    col: number,
    text: string,
    toCol = col,
    fill = true,
  ) => {
    if (toCol > col) sheet.mergeCells(row, col, row, toCol);
    const cell = sheet.getCell(row, col);
    cell.value = text;
    cell.font = { bold: true };
    if (fill) cell.fill = HEAD_FILL;
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    setOutlineBorder(cell);
  };

  let cursor = 4;
  for (const section of sections) {
    // Dải tên phần.
    sheet.mergeCells(cursor, 1, cursor, widest);
    const band = sheet.getCell(cursor, 1);
    band.value = `${section.numeral}. ${section.title}`;
    band.font = { bold: true, size: 12 };
    cursor += 1;

    if (!section.template) {
      sheet.mergeCells(cursor, 1, cursor, widest);
      sheet.getCell(cursor, 1).value =
        "Phần này chưa được gán mẫu bảng nên không có bộ cột để in.";
      cursor += 2;
      continue;
    }

    const leftCount = Math.max(1, section.left.length);
    const columns = [...section.left, ...section.right];
    const lastCol = columns.length;

    // Hai tầng tiêu đề như mẫu giấy.
    head(cursor, 1, "Nội dung để soi chiếu", leftCount);
    if (section.right.length) {
      head(cursor, leftCount + 1, "Nội dung theo dõi, thẩm định", lastCol);
    }
    cursor += 1;
    columns.forEach((column, index) => {
      head(cursor, index + 1, column.title);
      widen(index + 1, widthOf(column));
    });
    cursor += 1;

    section.items.forEach((item, index) => {
      const lines = byItem.get(item._id) ?? [];
      const rows = Math.max(1, lines.length);
      const top = cursor;

      section.left.forEach((column, colIndex) => {
        const col = colIndex + 1;
        if (rows > 1) sheet.mergeCells(top, col, top + rows - 1, col);
        const cell = sheet.getCell(top, col);
        cell.value = leftValue(column, item, index + 1);
        cell.alignment = {
          vertical: "top",
          wrapText: true,
          horizontal:
            column.semanticKey === "stt" ||
            column.semanticKey === "adjustment_max_score"
              ? "center"
              : undefined,
        };
        if (column.semanticKey === "adjustment_name") {
          cell.font = { bold: true };
        }
        setOutlineBorder(cell);
      });

      for (let i = 0; i < rows; i += 1) {
        const line = lines[i];
        section.right.forEach((column, colIndex) => {
          const cell = sheet.getCell(top + i, section.left.length + colIndex + 1);
          cell.value = line
            ? cellValue(column, line.fieldValues?.[column.key], catalogs)
            : "";
          cell.alignment = {
            vertical: "top",
            wrapText: true,
            horizontal:
              column.dataType === "number" || column.dataType === "boolean"
                ? "center"
                : undefined,
          };
          setOutlineBorder(cell);
        });
      }
      cursor += rows;
    });

    // Dòng tổng của phần cộng / trừ.
    if (section.key !== "RANKING") {
      const bonus = section.key === "BONUS";
      if (lastCol - 1 > 1) sheet.mergeCells(cursor, 1, cursor, lastCol - 1);
      const label = sheet.getCell(cursor, 1);
      label.value = bonus ? "TỔNG ĐIỂM CỘNG" : "TỔNG ĐIỂM TRỪ";
      label.font = { bold: true };
      label.fill = TOTAL_FILL;
      setOutlineBorder(label);
      const value = sheet.getCell(cursor, lastCol);
      value.value = bonus ? input.totals.bonus : input.totals.penalty;
      value.font = { bold: true };
      value.fill = TOTAL_FILL;
      value.alignment = { horizontal: "center" };
      setOutlineBorder(value);
      cursor += 1;
    }
    cursor += 1;
  }

  // Kết quả chung của bảng: cộng, trừ, chênh lệch - đúng ba ô trên màn.
  for (const [label, value] of [
    ["Tổng điểm cộng", input.totals.bonus],
    ["Tổng điểm trừ", input.totals.penalty],
    ["Chênh lệch (cộng − trừ)", input.totals.net],
  ] as const) {
    sheet.mergeCells(cursor, 1, cursor, 2);
    const labelCell = sheet.getCell(cursor, 1);
    labelCell.value = label;
    labelCell.font = { bold: true };
    setOutlineBorder(labelCell);
    const valueCell = sheet.getCell(cursor, 3);
    valueCell.value = value;
    valueCell.font = { bold: true };
    valueCell.alignment = { horizontal: "center" };
    setOutlineBorder(valueCell);
    cursor += 1;
  }

  const buffer = await workbook.xlsx.writeBuffer();
  saveAs(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    `${slugify(`de-xuat-cong-tru-${month}-${input.unitName ?? ""}`)}.xlsx`,
  );
}
