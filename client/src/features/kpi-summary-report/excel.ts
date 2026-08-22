import ExcelJS from "exceljs";
import { saveAs } from "file-saver";

import { buildHeaderRows } from "@/features/kpi-form-config/form-template-utils";
import type {
  FormHeaderGroup,
  FormTemplateColumn,
} from "@/features/kpi-form-config/types";
import {
  cellText,
  isTickedCell,
  rowSenderLabel,
} from "@/features/personal-kpi/board-cell";
import type {
  SummaryAxisBlock,
  SummaryReport,
} from "@/features/kpi-summary-report/types";
import { periodLabel } from "@/features/kpi-summary-report/types";

/** Cột hệ thống chèn trước cột của mẫu, giống hệt bảng trên màn hình. */
const LEADING = [
  { label: "TT", width: 6 },
  { label: "Cán bộ", width: 24 },
  { label: "Đơn vị", width: 24 },
  { label: "Ngày báo cáo", width: 14 },
] as const;

type PlacedCell = {
  label: string;
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
};

/**
 * Vị trí thật của từng ô header.
 * `buildHeaderRows` chỉ trả thứ tự ô trong dòng chứ không trả toạ độ, mà Excel
 * cần chỉ số cột để gộp ô - nên phát lại đúng thuật toán xếp chỗ của nó: duyệt
 * từng dòng, đặt ô vào cột trống đầu tiên rồi đánh dấu vùng đã chiếm.
 */
function placeHeaderCells(
  columns: FormTemplateColumn[],
  groups: FormHeaderGroup[],
  colOffset: number,
): { cells: PlacedCell[]; rowCount: number } | null {
  const preview = buildHeaderRows(columns, groups);
  if (!preview) return null;

  const rowCount = preview.rows.length;
  const colCount = preview.widths.length;
  const occupied = Array.from({ length: rowCount }, () =>
    Array.from({ length: colCount }, () => false),
  );

  const cells: PlacedCell[] = [];
  for (let rowIdx = 0; rowIdx < rowCount; rowIdx += 1) {
    let cursor = 0;
    for (const cell of preview.rows[rowIdx]!) {
      while (cursor < colCount && occupied[rowIdx]![cursor]) cursor += 1;
      if (cursor >= colCount) break;

      cells.push({
        label: cell.label,
        row: rowIdx,
        col: cursor + colOffset,
        rowSpan: cell.rowSpan,
        colSpan: cell.colSpan,
      });

      for (
        let r = rowIdx;
        r < Math.min(rowCount, rowIdx + cell.rowSpan);
        r += 1
      ) {
        for (
          let c = cursor;
          c < Math.min(colCount, cursor + cell.colSpan);
          c += 1
        ) {
          occupied[r]![c] = true;
        }
      }
      cursor += cell.colSpan;
    }
  }

  return { cells, rowCount };
}

/** Giá trị một ô dữ liệu dưới dạng chữ, khớp với thứ đang hiện trên bảng. */
function exportCellText(
  row: SummaryAxisBlock["groups"][number]["rows"][number],
  column: FormTemplateColumn,
): string {
  if (column.dataType === "file") {
    return (row.attachments?.[column.key] ?? [])
      .map((file) => file.name)
      .join(", ");
  }
  if (column.dataType === "boolean")
    return isTickedCell(row, column) ? "x" : "";
  return cellText(row, column);
}

/** Tên sheet Excel: bỏ ký tự cấm và cắt còn 31 ký tự. */
function sheetName(raw: string, fallback: string): string {
  const cleaned = raw.replace(/[[\]:*?/\\]/g, " ").trim();
  return (cleaned || fallback).slice(0, 31);
}

/** Bỏ dấu tiếng Việt để đặt tên file an toàn trên mọi máy. */
function slugify(raw: string): string {
  return (
    raw
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "bao-cao-tong"
  );
}

function setOutlineBorder(cell: ExcelJS.Cell) {
  cell.border = {
    top: { style: "thin" },
    left: { style: "thin" },
    bottom: { style: "thin" },
    right: { style: "thin" },
  };
}

/**
 * Xuất báo cáo tổng ra Excel: MỖI TRỤC MỘT SHEET.
 * Các trục dùng mẫu bảng khác nhau nên bộ cột khác nhau - nhồi chung một sheet
 * sẽ phải rút gọn về mẫu số chung và mất đúng phần đặc thù của từng trục.
 */
export async function exportSummaryReportToExcel(
  report: SummaryReport,
  axes: SummaryAxisBlock[],
) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = report.ownerName || "KPI Manager";
  workbook.created = new Date();

  let ordinal = 0;

  axes.forEach((axis, axisIndex) => {
    const template = axis.template;
    const visible = (template?.columns ?? []).filter(
      (column) => column.visible,
    );
    const sheet = workbook.addWorksheet(
      sheetName(axis.axisName || axis.axisCode, `Truc ${axisIndex + 1}`),
    );

    const totalCols = LEADING.length + Math.max(1, visible.length);
    const lastCol = totalCols;

    // ------------------------------------------------------------- tiêu đề
    sheet.mergeCells(1, 1, 1, lastCol);
    const titleCell = sheet.getCell(1, 1);
    titleCell.value = report.title;
    titleCell.font = { bold: true, size: 14 };
    titleCell.alignment = { horizontal: "center", vertical: "middle" };

    sheet.mergeCells(2, 1, 2, lastCol);
    const metaCell = sheet.getCell(2, 1);
    metaCell.value = `Kỳ báo cáo: ${periodLabel(report.fromDate, report.toDate)}   ·   Người lập: ${report.ownerName || "-"}   ·   Số nhiệm vụ: ${report.itemCount}`;
    metaCell.alignment = { horizontal: "center", vertical: "middle" };

    sheet.mergeCells(3, 1, 3, lastCol);
    const axisCell = sheet.getCell(3, 1);
    axisCell.value = `Trục: ${axis.axisName || axis.axisCode}`;
    axisCell.font = { bold: true };

    if (report.note?.trim()) {
      sheet.mergeCells(4, 1, 4, lastCol);
      const noteCell = sheet.getCell(4, 1);
      noteCell.value = `Ghi chú: ${report.note.trim()}`;
      noteCell.alignment = { wrapText: true, vertical: "top" };
    }

    const headerTop = 6;

    // -------------------------------------------------------------- header
    const placed = template
      ? placeHeaderCells(
          template.columns,
          template.headerGroups,
          LEADING.length,
        )
      : null;
    const headerRows = placed?.rowCount ?? 1;

    LEADING.forEach((column, index) => {
      const col = index + 1;
      sheet.mergeCells(headerTop, col, headerTop + headerRows - 1, col);
      const cell = sheet.getCell(headerTop, col);
      cell.value = column.label;
      cell.font = { bold: true };
      cell.alignment = {
        horizontal: "center",
        vertical: "middle",
        wrapText: true,
      };
      setOutlineBorder(cell);
      sheet.getColumn(col).width = column.width;
    });

    if (placed) {
      for (const cell of placed.cells) {
        const top = headerTop + cell.row;
        const bottom = top + cell.rowSpan - 1;
        const left = cell.col + 1;
        const right = left + cell.colSpan - 1;
        if (bottom > top || right > left) {
          sheet.mergeCells(top, left, bottom, right);
        }
        const target = sheet.getCell(top, left);
        target.value = cell.label;
        target.font = { bold: true };
        target.alignment = {
          horizontal: "center",
          vertical: "middle",
          wrapText: true,
        };
        setOutlineBorder(target);
      }
      visible.forEach((column, index) => {
        // Bề rộng cột trong mẫu tính bằng pixel, Excel tính bằng ký tự.
        sheet.getColumn(LEADING.length + index + 1).width = Math.max(
          10,
          Math.round(column.width / 7),
        );
      });
    } else {
      const cell = sheet.getCell(headerTop, LEADING.length + 1);
      cell.value = "Trục chưa gán mẫu bảng";
      cell.font = { bold: true };
      setOutlineBorder(cell);
    }

    // ---------------------------------------------------------- dòng dữ liệu
    let cursor = headerTop + headerRows;

    for (const group of axis.groups) {
      sheet.mergeCells(cursor, 1, cursor, lastCol);
      const groupCell = sheet.getCell(cursor, 1);
      groupCell.value = `${group.workContentName || group.workContentCode} (${group.rows.length} nhiệm vụ)`;
      groupCell.font = { bold: true, italic: true };
      groupCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFF1F5F9" },
      };
      setOutlineBorder(groupCell);
      cursor += 1;

      for (const row of group.rows) {
        ordinal += 1;
        const sender = rowSenderLabel(row);
        const values: (string | number)[] = [
          ordinal,
          sender.name,
          sender.department,
          row.reportDate ?? "",
          ...visible.map((column) => exportCellText(row, column)),
        ];

        values.forEach((value, index) => {
          const cell = sheet.getCell(cursor, index + 1);
          cell.value = value;
          cell.alignment = { vertical: "top", wrapText: true };
          setOutlineBorder(cell);
        });
        cursor += 1;
      }
    }

    if (!axis.groups.length) {
      const cell = sheet.getCell(cursor, 1);
      cell.value = "Trục này chưa có nhiệm vụ nào trong báo cáo.";
      cell.font = { italic: true };
    }
  });

  if (!axes.length) {
    const sheet = workbook.addWorksheet("BaoCaoTong");
    sheet.getCell(1, 1).value = report.title;
    sheet.getCell(2, 1).value = "Báo cáo chưa có nhiệm vụ nào.";
  }

  const buffer = await workbook.xlsx.writeBuffer();
  saveAs(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    `${slugify(report.title)}.xlsx`,
  );
}
