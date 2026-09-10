import ExcelJS from "exceljs";
import { saveAs } from "file-saver";

import { buildHeaderRows } from "@/features/mission-form-config/form-template-utils";
import type {
  FormHeaderGroup,
  FormTemplateColumn,
} from "@/features/mission-form-config/types";
import {
  catalogOfColumn,
  formatScore,
  refId,
  type TeamReportAxisScore,
  type TeamReportDayRow,
  type TeamReportFormula,
  type TeamReportTemplate,
} from "@/features/team-report/types";

/*
  Xuất một bản báo cáo (ngày hoặc tổng hợp) ra Excel, bám mẫu giấy.

  Viết riêng cho bản nghiệp vụ mới, KHÔNG dùng lại `features/mission-summary-report/
  excel.ts`: bộ xuất bên đó đọc dòng bằng kiểu của bản cũ (`personal-mission`),
  mà hai bản phải gỡ rời được. Chỉ dùng chung `mission-form-config` - đó là cấu
  hình mẫu bảng dùng chung cho cả hệ, chính là thứ quyết định bộ cột in ra.

  In ĐÚNG các cột của mẫu, không chèn cột hệ thống - trừ cột "Đội" khi bản gộp
  việc của nhiều đội: bản của phòng mà không nói dòng nào của ai thì đọc xong
  không dùng được vào việc gì.
*/

type PlacedCell = {
  label: string;
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
};

/**
 * Toạ độ thật của từng ô tiêu đề.
 *
 * `buildHeaderRows` chỉ trả thứ tự ô trong dòng, mà Excel cần chỉ số cột để gộp
 * ô - nên phát lại đúng thuật toán xếp chỗ của nó: duyệt từng dòng, đặt ô vào
 * cột trống đầu tiên rồi đánh dấu vùng đã chiếm.
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

/** Cột nào của mẫu đang giữ ba ô khai ở giai đoạn 1. */
type EntryKeys = { title?: string; product?: string; deadline?: string };

/**
 * Dò ba cột đó theo ĐÚNG luật của `entryColumnKeys` bên `types.ts`.
 *
 * Không gọi thẳng hàm kia vì nó chỉ trả một tập khoá, mà ở đây cần biết khoá
 * nào là tên việc, khoá nào là sản phẩm để điền bù cho đúng ô.
 */
function entryKeysOf(template: TeamReportTemplate | null): EntryKeys {
  const visible = (template?.columns ?? []).filter(
    (column) =>
      column.visible && column.semanticKey !== "stt" && !column.autoValue,
  );
  const product = visible.find(
    (column) => column.key === "product" && column.dataType === "text",
  );
  const title = visible.find(
    (column) =>
      column.semanticKey === "custom" &&
      column.dataType === "text" &&
      column.key !== "note" &&
      column.key !== product?.key,
  );
  const deadline = visible.find(
    (column) => column.key === "deadline" && column.dataType === "date",
  );
  return { title: title?.key, product: product?.key, deadline: deadline?.key };
}

/**
 * Giá trị một ô, đọc từ bản CHỤP chứ không tra lại danh mục.
 *
 * Bản chụp giữ đúng chữ tại lúc trình; danh mục đổi tên về sau thì báo cáo cũ
 * vẫn phải in ra chữ cũ - đó là thứ cấp trên đã duyệt.
 *
 * Ô số ghi xuống dưới dạng SỐ: ghi chuỗi thì Excel căn trái, không cộng được, và
 * người nhận không dùng lại được ô đó trong công thức nào.
 */
function cellValue(
  row: TeamReportDayRow,
  column: FormTemplateColumn,
  ordinal: number,
  entry: EntryKeys,
): string | number {
  if (column.semanticKey === "stt") return ordinal;
  if (column.semanticKey === "work_content") {
    return row.workContentName || row.catalogValues?.[column.key]?.name || "";
  }
  if (catalogOfColumn(column)) {
    const picked = row.catalogValues?.[column.key]?.name ?? "";
    /*
      Cột "Nhiệm vụ" của mẫu Trục 2 là ô CHỌN từ danh mục nhiệm vụ mẫu, không
      phải ô gõ. Đội không chọn mục nào thì ô trống, mà tên việc họ tự gõ lại
      không có cột nào chứa - in ra là mất hẳn thứ đang được báo cáo. Điền bù
      tên việc vào đúng chỗ đó.
    */
    if (!picked && column.semanticKey === "work_task") return row.name ?? "";
    return picked;
  }

  const raw = row.fieldValues?.[column.key];
  /* Ba ô của giai đoạn 1 vốn được đồng bộ hai chiều với cột mẫu, nhưng dòng
     chụp từ trước khi có đồng bộ thì chỉ còn giá trị ở trường riêng - đọc bù
     để bản in không thủng. */
  if (raw === undefined || String(raw).trim() === "") {
    if (column.key === entry.title) return row.name ?? "";
    if (column.key === entry.product) return row.product ?? "";
    if (column.key === entry.deadline) return row.deadline ?? "";
  }
  if (raw === undefined || raw === null || String(raw).trim() === "") return "";
  /* Ô tick lưu dạng chuỗi "true"/"1" tuỳ chỗ ghi - mẫu giấy chỉ cần dấu x. */
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

/** Công thức điểm trục viết bằng ký hiệu và bằng số thật - khớp bảng trên màn. */
function formulaText(
  formula: TeamReportFormula,
  ratio: number | null,
  maxScore: number,
  converted?: number | null,
): string {
  const isConverted = converted !== undefined;
  const num = (value: number | null) =>
    value === null ? "?" : formatScore(value);

  if (formula.mode === "sum") {
    const symbols = formula.parts.map((part) => part.role).join(" + ");
    const numbers = formula.parts.map((part) => num(part.total)).join(" + ");
    const result = isConverted
      ? num(converted ?? null)
      : num(ratio === null ? null : ratio * maxScore);
    return isConverted
      ? `min(${symbols}; ${maxScore}) = min(${numbers}; ${maxScore}) = ${result}`
      : `${symbols} = ${numbers} = ${result}`;
  }

  const base = formula.base;
  const inner = formula.parts
    .map((part) => `(${part.role}/${base?.role ?? "A"})`)
    .join("+");
  const innerNumbers = formula.parts
    .map((part) => `(${num(part.total)}/${num(base?.total ?? null)})`)
    .join("+");
  const divisor = formula.parts.length;
  const symbols = `[${inner}] / ${divisor}`;
  const numbers = `[${innerNumbers}] / ${divisor}`;

  return isConverted
    ? `(${symbols}) × ${maxScore} = (${numbers}) × ${maxScore} = ${num(converted ?? null)}`
    : `${symbols} = ${numbers} = ${num(ratio)}`;
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
      .slice(0, 80) || "bao-cao"
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

const BAND_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFE2E8F0" },
};

const FOOTER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFF1F5F9" },
};

export type TeamReportExportInput = {
  /** Tên bản - dòng đầu trong file. */
  title: string;
  /**
   * Tên dùng để đặt TÊN TỆP, mặc định lấy theo `title`.
   *
   * Tách khỏi tiêu đề vì tên tệp cần thêm đơn vị: cấp trên tải về hàng chục
   * bản cùng kỳ, trùng tên hết thì phải mở từng cái ra mới biết của ai.
   */
  fileTitle?: string;
  /** Dòng thông tin dưới tiêu đề: đơn vị, kỳ, người trình, trạng thái... */
  meta: string;
  note?: string;
  rows: TeamReportDayRow[];
  /** Tra bằng "<id mẫu>:<phiên bản>" - mỗi dòng đóng dấu phiên bản riêng. */
  templates: Record<string, TeamReportTemplate>;
  axisScores: TeamReportAxisScore[];
};

/**
 * Xuất một bản báo cáo ra Excel: MỘT SHEET, mỗi trục một bảng nối tiếp nhau.
 *
 * Mỗi trục dùng một mẫu riêng nên bộ cột khác nhau - không ép chung một hàng
 * tiêu đề được. Mỗi khối gồm dải tên trục, tiêu đề của riêng nó, dòng dữ liệu,
 * rồi ba dòng cuối đúng như mẫu giấy: tổng từng cột, công thức điểm trục, điểm
 * quy đổi. Cuối file là bảng điểm tổng.
 *
 * Gom theo TRỤC chứ không theo mẫu: Trục 1, 3, 4 dùng chung một mẫu, gom theo
 * mẫu là ba trục dồn vào một bảng mang nhãn "Trục 1". Bộ cột của mỗi trục lấy
 * theo phiên bản mẫu MỚI NHẤT trong nhóm - đúng cách server chọn để tính dòng
 * tổng, không thì tiêu đề một đằng số một nẻo.
 */
export async function exportTeamReportToExcel(input: TeamReportExportInput) {
  const { rows, templates, axisScores } = input;

  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(sheetName(input.title, "Bao cao"));

  /* Bản của phòng gộp việc nhiều đội thì phải nói rõ dòng nào của ai. Suy từ
     chính dữ liệu, không từ màn gọi ra. */
  const multiUnit =
    new Set(rows.map((row) => String(row.departmentId ?? "")).filter(Boolean))
      .size > 1;

  const groups = (() => {
    const byAxis = new Map<string, TeamReportDayRow[]>();
    for (const row of rows) {
      const key = refId(row.axisId) || "";
      byAxis.set(key, [...(byAxis.get(key) ?? []), row]);
    }
    return [...byAxis.entries()].map(([axisId, axisRows]) => {
      const score = axisScores.find((item) => item.axisId === axisId) ?? null;
      const templateKey =
        score?.templateKey ||
        axisRows
          .filter((row) => row.formTemplateId)
          .map((row) => `${row.formTemplateId}:${row.formTemplateVersion ?? 1}`)
          .sort()
          .pop() ||
        "";
      return {
        axisName: axisRows[0]?.axisName || "Chưa gắn trục",
        rows: axisRows,
        score,
        template: templates[templateKey] ?? null,
      };
    });
  })();

  const visibleOf = (template: TeamReportTemplate | null) =>
    (template?.columns ?? []).filter((column) => column.visible);

  /** Số cột thật của một khối, kể cả cột "Đội" chèn thêm. */
  const unitOffset = multiUnit ? 1 : 0;
  const widest = groups.reduce(
    (max, group) =>
      Math.max(max, visibleOf(group.template).length + unitOffset),
    4,
  );

  const widenColumn = (col: number, width: number) => {
    const current = sheet.getColumn(col).width ?? 0;
    if (width > current) sheet.getColumn(col).width = width;
  };

  // ---------------------------------------------------------------- tiêu đề
  sheet.mergeCells(1, 1, 1, widest);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = input.title;
  titleCell.font = { bold: true, size: 14 };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };

  sheet.mergeCells(2, 1, 2, widest);
  const metaCell = sheet.getCell(2, 1);
  metaCell.value = input.meta;
  metaCell.alignment = { horizontal: "center", vertical: "middle" };

  let cursor = 3;
  if (input.note?.trim()) {
    sheet.mergeCells(cursor, 1, cursor, widest);
    const noteCell = sheet.getCell(cursor, 1);
    noteCell.value = `Ghi chú: ${input.note.trim()}`;
    noteCell.alignment = { wrapText: true, vertical: "top" };
    cursor += 1;
  }
  cursor += 1;

  // ------------------------------------------------------------- từng trục
  for (const group of groups) {
    const visible = visibleOf(group.template);
    const lastCol = Math.max(1, visible.length + unitOffset);

    sheet.mergeCells(cursor, 1, cursor, lastCol);
    const bandCell = sheet.getCell(cursor, 1);
    bandCell.value = `TRỤC: ${group.axisName}   ·   ${group.rows.length} nhiệm vụ`;
    bandCell.font = { bold: true, size: 12 };
    bandCell.alignment = { vertical: "middle" };
    bandCell.fill = BAND_FILL;
    setOutlineBorder(bandCell);
    cursor += 1;

    const placed = group.template
      ? placeHeaderCells(
          group.template.columns,
          group.template.headerGroups ?? [],
          unitOffset,
        )
      : null;
    const headerTop = cursor;
    const headerRows = placed?.rowCount ?? 1;

    if (placed) {
      if (multiUnit) {
        // Cột "Đội" cao bằng cả khối tiêu đề của mẫu, khỏi lệch dòng.
        if (headerRows > 1) {
          sheet.mergeCells(headerTop, 1, headerTop + headerRows - 1, 1);
        }
        const unitHead = sheet.getCell(headerTop, 1);
        unitHead.value = "Đội";
        unitHead.font = { bold: true };
        unitHead.alignment = {
          horizontal: "center",
          vertical: "middle",
          wrapText: true,
        };
        setOutlineBorder(unitHead);
        widenColumn(1, 24);
      }

      for (const cell of placed.cells) {
        const top = headerTop + cell.row;
        const bottom = top + cell.rowSpan - 1;
        const left = cell.col + 1;
        const right = left + cell.colSpan - 1;
        if (bottom > top || right > left)
          sheet.mergeCells(top, left, bottom, right);
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
        widenColumn(
          index + 1 + unitOffset,
          Math.max(10, Math.round(column.width / 7)),
        );
      });
    } else {
      const cell = sheet.getCell(headerTop, 1);
      cell.value = "Trục này chưa gắn mẫu bảng nên không có bộ cột để in.";
      cell.font = { bold: true };
      setOutlineBorder(cell);
    }
    cursor = headerTop + headerRows;

    const entry = entryKeysOf(group.template);
    group.rows.forEach((row, index) => {
      if (multiUnit) {
        const unitCell = sheet.getCell(cursor, 1);
        unitCell.value = row.departmentName ?? "";
        unitCell.alignment = { vertical: "top", wrapText: true };
        setOutlineBorder(unitCell);
      }
      visible.forEach((column, colIndex) => {
        const cell = sheet.getCell(cursor, colIndex + 1 + unitOffset);
        cell.value = cellValue(row, column, index + 1, entry);
        cell.alignment = {
          vertical: "top",
          wrapText: true,
          horizontal:
            column.dataType === "number" || column.semanticKey === "stt"
              ? "center"
              : undefined,
        };
        setOutlineBorder(cell);
      });
      cursor += 1;
    });

    /*
      Ba dòng cuối đúng như mẫu giấy và như bảng trên màn: tổng từng cột, công
      thức tính điểm trục, rồi điểm quy đổi.

      Tổng lấy từ SERVER chứ không tự cộng lại ở đây: công thức phải có đúng một
      chỗ định nghĩa, không thì file xuất ra một số mà bản đã trình lưu số khác.
    */
    const score = group.score;
    if (score && Object.keys(score.columnTotals).length) {
      const totalRow = cursor;
      const label = sheet.getCell(totalRow, 1);
      label.value = "Tổng từng cột";
      label.font = { bold: true };
      label.fill = FOOTER_FILL;
      setOutlineBorder(label);

      visible.forEach((column, colIndex) => {
        const col = colIndex + 1 + unitOffset;
        if (col === 1) return;
        const cell = sheet.getCell(totalRow, col);
        const total = score.columnTotals[column.key];
        cell.value = total === undefined ? "" : total;
        cell.font = { bold: true };
        cell.alignment = { horizontal: "center", vertical: "middle" };
        cell.fill = FOOTER_FILL;
        setOutlineBorder(cell);
      });
      cursor += 1;

      if (score.formula) {
        for (const line of [
          {
            label: `Tổng điểm ${group.axisName.toLowerCase()}`,
            text: formulaText(score.formula, score.axisScore, score.maxScore),
          },
          {
            label: "Điểm quy đổi",
            text: formulaText(
              score.formula,
              score.axisScore,
              score.maxScore,
              score.convertedScore,
            ),
          },
        ]) {
          const labelCell = sheet.getCell(cursor, 1);
          labelCell.value = line.label;
          labelCell.font = { bold: true };
          labelCell.fill = FOOTER_FILL;
          setOutlineBorder(labelCell);

          if (lastCol > 1) sheet.mergeCells(cursor, 2, cursor, lastCol);
          const textCell = sheet.getCell(cursor, Math.min(2, lastCol));
          textCell.value = line.text;
          textCell.alignment = { horizontal: "center", vertical: "middle" };
          textCell.fill = FOOTER_FILL;
          setOutlineBorder(textCell);
          cursor += 1;
        }
      }
    }

    if (!group.rows.length) {
      sheet.getCell(cursor, 1).value = "Trục này chưa có nhiệm vụ nào.";
      cursor += 1;
    }

    // Một dòng trống ngăn khối này với trục kế, khỏi dính nhau khi in.
    cursor += 1;
  }

  // -------------------------------------------------------- bảng điểm tổng
  if (axisScores.length) {
    sheet.mergeCells(cursor, 1, cursor, Math.max(4, Math.min(widest, 6)));
    const bandCell = sheet.getCell(cursor, 1);
    bandCell.value = "BẢNG ĐIỂM";
    bandCell.font = { bold: true, size: 12 };
    bandCell.fill = BAND_FILL;
    setOutlineBorder(bandCell);
    cursor += 1;

    const heads = ["Trục", "Số nhiệm vụ", "Tỉ lệ đạt", "Điểm", "Điểm tối đa"];
    heads.forEach((text, index) => {
      const cell = sheet.getCell(cursor, index + 1);
      cell.value = text;
      cell.font = { bold: true };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      setOutlineBorder(cell);
      widenColumn(index + 1, index === 0 ? 28 : 14);
    });
    cursor += 1;

    for (const axis of axisScores) {
      const cells: Array<string | number> = [
        axis.axisName,
        axis.taskCount,
        axis.axisScore === null ? "chưa chấm được" : axis.axisScore,
        axis.convertedScore === null ? "" : axis.convertedScore,
        axis.maxScore,
      ];
      cells.forEach((value, index) => {
        const cell = sheet.getCell(cursor, index + 1);
        cell.value = value;
        if (index === 2 && typeof value === "number") cell.numFmt = "0.00%";
        cell.alignment = {
          vertical: "middle",
          horizontal: index === 0 ? undefined : "center",
        };
        setOutlineBorder(cell);
      });
      cursor += 1;
    }

    const scored = axisScores.some((axis) => axis.convertedScore !== null);
    const total = axisScores.reduce(
      (sum, axis) => sum + (axis.convertedScore ?? 0),
      0,
    );
    const max = axisScores.reduce((sum, axis) => sum + axis.maxScore, 0);
    const totals: Array<string | number> = [
      "TỔNG ĐIỂM",
      axisScores.reduce((sum, axis) => sum + axis.taskCount, 0),
      // Chưa trục nào chấm được thì để trống, KHÔNG ghi 0 - hai chuyện khác hẳn.
      scored && max > 0 ? total / max : "",
      scored ? total : "",
      max,
    ];
    totals.forEach((value, index) => {
      const cell = sheet.getCell(cursor, index + 1);
      cell.value = value;
      if (index === 2 && typeof value === "number") cell.numFmt = "0.00%";
      cell.font = { bold: true };
      cell.alignment = {
        vertical: "middle",
        horizontal: index === 0 ? undefined : "center",
      };
      cell.fill = FOOTER_FILL;
      setOutlineBorder(cell);
    });
  }

  if (!rows.length) {
    sheet.getCell(cursor, 1).value = "Báo cáo chưa có nhiệm vụ nào.";
  }

  const buffer = await workbook.xlsx.writeBuffer();
  saveAs(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    `${slugify(input.fileTitle || input.title)}.xlsx`,
  );
}
