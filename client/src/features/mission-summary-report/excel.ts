import ExcelJS from "exceljs";
import { saveAs } from "file-saver";

import { buildHeaderRows } from "@/features/mission-form-config/form-template-utils";
import type {
  FormHeaderGroup,
  FormTemplateColumn,
} from "@/features/mission-form-config/types";
import { cellText, isTickedCell } from "@/features/personal-mission/board-cell";
import type {
  SummaryAxisBlock,
  SummaryReport,
} from "@/features/mission-summary-report/types";
import { periodLabel } from "@/features/mission-summary-report/types";

/*
  File xuất ra bám đúng mẫu giấy: CHỈ có các cột của mẫu bảng nhiệm vụ, không chèn
  thêm cột hệ thống nào. Bảng trên màn hình có thêm TT / Cán bộ / Đơn vị / Ngày
  báo cáo để người dùng tra cứu, nhưng bản in nộp lên thì mẫu quy định sao in
  đúng vậy.
*/

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

/** Một dòng của bảng khối A khi xuất file. */
export type CriteriaExportRow = {
  criterionId: string;
  criterionName: string;
  criterionNote: string;
  maxScore: number;
  fieldValues: Record<string, string | number | boolean>;
  catalogValues: Record<string, { id: string; name: string }>;
};

/**
 * Giá trị một ô của bảng khối A, đọc theo đúng luật của `CriteriaTable`.
 *
 * Bốn ô ánh xạ tiêu chí lấy từ chính dòng chứ không từ `fieldValues`: chúng là
 * phần admin khai sẵn ở danh mục, người chấm không gõ lại nên không có gì lưu
 * trong hai túi giá trị.
 */
function criteriaCellText(
  row: CriteriaExportRow,
  column: FormTemplateColumn,
  index: number,
): string | number {
  switch (column.semanticKey) {
    case "stt":
      return index + 1;
    case "criterion":
      return row.criterionName;
    case "criterion_note":
      return row.criterionNote;
    case "criterion_max_score":
      return row.maxScore;
    default:
      break;
  }
  const picked = row.catalogValues[column.key];
  if (picked?.id) return picked.name ?? "";
  const raw = row.fieldValues[column.key];
  if (column.dataType === "boolean") return raw === true ? "x" : "";
  if (raw === undefined || raw === null || String(raw).trim() === "") return "";
  /*
    Cột điểm ghi xuống dưới dạng SỐ chứ không phải chuỗi: ghi chuỗi thì Excel
    căn trái, không cộng được, và người nhận không dùng lại được ô đó trong
    công thức nào.
  */
  if (column.dataType === "number") {
    const value = Number(String(raw).replace(",", "."));
    if (Number.isFinite(value)) return value;
  }
  return String(raw);
}

/** Tổng của một cột số ở dòng "Tổng điểm" - khớp tfoot của `CriteriaTable`. */
function criteriaColumnTotal(
  rows: CriteriaExportRow[],
  column: FormTemplateColumn,
): number | null {
  if (column.dataType !== "number") return null;
  if (column.semanticKey === "criterion_max_score") {
    return rows.reduce((sum, row) => sum + row.maxScore, 0);
  }
  return rows.reduce((sum, row) => {
    const text = String(row.fieldValues[column.key] ?? "").trim();
    const value = Number(text.replace(",", "."));
    return sum + (text && Number.isFinite(value) ? value : 0);
  }, 0);
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

/**
 * Gộp các khối cùng một trục thành MỘT bảng, dùng mẫu của phiên bản mới nhất.
 *
 * Server phát một khối cho mỗi cặp (trục, phiên bản mẫu lúc gửi), nên trục nào
 * có nhiệm vụ gửi rải qua vài lần sửa mẫu sẽ ra ba bốn khối cùng tên - đọc báo
 * cáo mà thấy "Trục 1" ba lần thì không ai hiểu. Bảng trên màn hình đã gộp theo
 * đúng luật này rồi (xem `axisBuckets` trong report-entries.ts), file xuất phải
 * khớp với thứ người dùng đang nhìn.
 *
 * Dòng của phiên bản cũ vẫn hiện đủ: ô nào có cột tương ứng trong mẫu mới thì
 * ra giá trị, cột mới thêm sau thì để trống - đúng như trên màn hình.
 */
function mergeAxisBlocks(axes: SummaryAxisBlock[]): SummaryAxisBlock[] {
  const order: string[] = [];
  const buckets = new Map<
    string,
    {
      axis: SummaryAxisBlock;
      version: number;
      groups: Map<string, SummaryAxisBlock["groups"][number]>;
    }
  >();

  for (const axis of axes) {
    const version = axis.template?.version ?? 0;
    let bucket = buckets.get(axis.axisId);

    if (!bucket) {
      bucket = { axis: { ...axis, groups: [] }, version, groups: new Map() };
      buckets.set(axis.axisId, bucket);
      order.push(axis.axisId);
    } else if (version > bucket.version) {
      // Mẫu mới nhất quyết định bộ cột của cả trục.
      bucket.axis = { ...bucket.axis, template: axis.template };
      bucket.version = version;
    }

    for (const group of axis.groups) {
      const key = group.workContentId || group.workContentCode;
      const existing = bucket.groups.get(key);
      if (existing) existing.rows = [...existing.rows, ...group.rows];
      else bucket.groups.set(key, { ...group, rows: [...group.rows] });
    }
  }

  return order.map((axisId) => {
    const bucket = buckets.get(axisId)!;
    return {
      ...bucket.axis,
      groups: [...bucket.groups.values()].map((group) => ({
        ...group,
        // Gộp từ nhiều khối nên thứ tự vỡ - xếp lại theo ngày báo cáo, mới trước.
        rows: [...group.rows].sort((left, right) =>
          (right.reportDate ?? "").localeCompare(left.reportDate ?? ""),
        ),
      })),
    };
  });
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
 * Xuất báo cáo tổng ra Excel: MỘT SHEET DUY NHẤT, mỗi trục một bảng, nối tiếp
 * nhau từ trên xuống.
 *
 * Mỗi trục dùng một mẫu bảng riêng nên bộ cột khác nhau - không ép chung một
 * hàng tiêu đề được. Cách làm: mỗi trục là một khối có dải tên trục, hàng tiêu
 * đề của riêng nó rồi tới dữ liệu; hết khối chừa một dòng trống rồi sang trục
 * kế. Đọc một mạch từ trên xuống, in ra cũng liền một mạch.
 *
 * `blocks` là dữ liệu thô của server, có thể có nhiều khối cùng một trục -
 * `mergeAxisBlocks` gom lại thành một bảng theo mẫu mới nhất.
 */
export async function exportSummaryReportToExcel(
  report: SummaryReport,
  blocks: SummaryAxisBlock[],
  /**
   * Khối A - in TRƯỚC các trục, đúng thứ tự của mẫu giấy (A rồi mới tới B).
   * Bỏ trống thì file không có khối A, dùng cho mẫu báo cáo không bật khối này.
   */
  criteria?: {
    template: {
      columns: FormTemplateColumn[];
      headerGroups: FormHeaderGroup[];
    } | null;
    rows: CriteriaExportRow[];
  },
) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = report.ownerName || "Mission Manager";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(
    sheetName(report.title, "Bao cao tong hop"),
  );

  // Mỗi trục đúng một bảng, theo mẫu mới nhất - xem `mergeAxisBlocks`.
  const axes = mergeAxisBlocks(blocks);

  const visibleOf = (axis: SummaryAxisBlock) =>
    (axis.template?.columns ?? []).filter((column) => column.visible);

  const criteriaColumns = (criteria?.template?.columns ?? []).filter(
    (column) => column.visible,
  );
  const hasCriteria =
    Boolean(criteria?.rows.length) && criteriaColumns.length > 0;

  /*
    Các trục dài ngắn khác nhau nên phần tiêu đề gộp theo trục rộng nhất, nếu
    không thì tiêu đề hụt so với bảng bên dưới. Khối A cũng tính vào - nó là một
    bảng trong cùng sheet, bỏ qua thì tiêu đề hụt đúng bằng phần nó rộng hơn.
  */
  const widestCol = axes.reduce(
    (max, axis) => Math.max(max, visibleOf(axis).length),
    Math.max(1, hasCriteria ? criteriaColumns.length : 1),
  );

  /*
    Cột dùng chung cho mọi trục nên bề rộng phải lấy theo trục cần rộng nhất,
    chứ trục sau ghi đè trục trước là bảng trên bị bóp lại.
  */
  const widenColumn = (col: number, width: number) => {
    const current = sheet.getColumn(col).width ?? 0;
    if (width > current) sheet.getColumn(col).width = width;
  };

  /**
   * Gộp dọc một cột từ dòng `top` tới dòng `bottom`, chữ nằm ở ô trên cùng.
   * Excel giữ giá trị của ô trên cùng và bỏ phần còn lại, nên chỉ gọi khi cả
   * vùng đó đúng là một nội dung.
   */
  const mergeDown = (col: number, top: number, bottom: number) => {
    if (bottom <= top) return;
    sheet.mergeCells(top, col, bottom, col);
    const cell = sheet.getCell(top, col);
    cell.alignment = { ...cell.alignment, vertical: "middle" };
  };

  // -------------------------------------------------------------- tiêu đề
  sheet.mergeCells(1, 1, 1, widestCol);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = report.title;
  titleCell.font = { bold: true, size: 14 };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };

  sheet.mergeCells(2, 1, 2, widestCol);
  const metaCell = sheet.getCell(2, 1);
  metaCell.value = `Kỳ báo cáo: ${periodLabel(report.fromDate, report.toDate)}   ·   Người lập: ${report.ownerName || "-"}   ·   Số nhiệm vụ: ${report.itemCount}`;
  metaCell.alignment = { horizontal: "center", vertical: "middle" };

  let cursor = 3;
  if (report.note?.trim()) {
    sheet.mergeCells(cursor, 1, cursor, widestCol);
    const noteCell = sheet.getCell(cursor, 1);
    noteCell.value = `Ghi chú: ${report.note.trim()}`;
    noteCell.alignment = { wrapText: true, vertical: "top" };
    cursor += 1;
  }
  cursor += 1;

  /*
    ------------------------------------------------------------- khối A

    Đứng trước mọi trục, đúng thứ tự mẫu giấy: "A. DANH MỤC ĐIỂM TIÊU CHÍ CHUNG"
    rồi mới tới "B. NHIỆM VỤ CÔNG TÁC". In bộ điểm của ĐƠN VỊ - đó là điểm của
    báo cáo; bảng của từng cán bộ là đánh giá cá nhân, mẫu giấy không có.

    Tiêu chí chưa chấm vẫn in ra kèm điểm tối đa: bản in phải liệt kê đủ danh
    mục và tổng trần điểm, giống hệt tờ mẫu chưa điền.
  */
  if (hasCriteria) {
    const rows = criteria!.rows;
    const lastCol = Math.max(1, criteriaColumns.length);

    sheet.mergeCells(cursor, 1, cursor, lastCol);
    const bandCell = sheet.getCell(cursor, 1);
    bandCell.value = "A · DANH MỤC ĐIỂM TIÊU CHÍ CHUNG";
    bandCell.font = { bold: true, size: 12 };
    bandCell.alignment = { vertical: "middle" };
    bandCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE2E8F0" },
    };
    setOutlineBorder(bandCell);
    cursor += 1;

    const placed = placeHeaderCells(
      criteria!.template!.columns,
      criteria!.template!.headerGroups,
      0,
    );
    const headerTop = cursor;
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
      criteriaColumns.forEach((column, index) => {
        widenColumn(index + 1, Math.max(10, Math.round(column.width / 7)));
      });
      cursor = headerTop + placed.rowCount;
    }

    rows.forEach((row, rowIndex) => {
      criteriaColumns.forEach((column, index) => {
        const cell = sheet.getCell(cursor, index + 1);
        cell.value = criteriaCellText(row, column, rowIndex);
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

    // Dòng "Tổng điểm" cuối bảng - có ở mẫu giấy, và là chỗ đọc ra 24/30.
    if (criteriaColumns.some((column) => column.dataType === "number")) {
      criteriaColumns.forEach((column, index) => {
        const cell = sheet.getCell(cursor, index + 1);
        const total = criteriaColumnTotal(rows, column);
        cell.value =
          index === 0 && total === null ? "Tổng điểm" : (total ?? "");
        cell.font = { bold: true };
        cell.alignment = { horizontal: "center", vertical: "middle" };
        setOutlineBorder(cell);
      });
      cursor += 1;
    }

    cursor += 1;
  }

  for (const axis of axes) {
    const template = axis.template;
    const visible = visibleOf(axis);
    const axisLabel = axis.axisName || axis.axisCode;
    const lastCol = Math.max(1, visible.length);

    // ------------------------------------------------------- dải tên trục
    sheet.mergeCells(cursor, 1, cursor, lastCol);
    const axisCell = sheet.getCell(cursor, 1);
    axisCell.value = `TRỤC: ${axisLabel}`;
    axisCell.font = { bold: true, size: 12 };
    axisCell.alignment = { vertical: "middle" };
    axisCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE2E8F0" },
    };
    setOutlineBorder(axisCell);
    cursor += 1;

    // ------------------------------------------------------------- header
    const placed = template
      ? placeHeaderCells(template.columns, template.headerGroups, 0)
      : null;
    const headerRows = placed?.rowCount ?? 1;
    const headerTop = cursor;

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
        widenColumn(index + 1, Math.max(10, Math.round(column.width / 7)));
      });
    } else {
      const cell = sheet.getCell(headerTop, 1);
      cell.value = "Trục chưa gán mẫu bảng";
      cell.font = { bold: true };
      setOutlineBorder(cell);
    }

    cursor = headerTop + headerRows;

    /*
      Mẫu giấy không lặp lại chữ giống nhau ở từng dòng: một nội dung công việc
      là MỘT ô gộp dọc, trải hết các nhiệm vụ thuộc nó, và STT đánh theo nội
      dung chứ không theo nhiệm vụ. Bám đúng mẫu thì cột nội dung mới là chỗ ghi
      tên nhóm - chỉ mẫu nào không có cột đó mới cần dải tên nhóm như trước, nếu
      không người đọc mất luôn thông tin nhiệm vụ này thuộc nội dung nào.
    */
    const sttIndex = visible.findIndex(
      (column) => column.semanticKey === "stt",
    );
    const hasContentColumn = visible.some(
      (column) => column.semanticKey === "work_content",
    );
    let groupOrdinal = 0;

    // --------------------------------------------------------- dòng dữ liệu
    for (const group of axis.groups) {
      if (!hasContentColumn) {
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
      }

      groupOrdinal += 1;
      const firstRow = cursor;

      for (const row of group.rows) {
        visible.forEach((column, index) => {
          const cell = sheet.getCell(cursor, index + 1);
          cell.value = exportCellText(row, column);
          cell.alignment = { vertical: "top", wrapText: true };
          setOutlineBorder(cell);
        });
        cursor += 1;
      }

      const lastRow = cursor - 1;
      if (lastRow > firstRow) {
        /*
          Cột của mẫu thì gộp theo ngữ nghĩa chứ không so chữ: nội dung công
          việc và ghi chú của nó vốn là một bản ghi dùng chung cho cả cụm. Các
          cột số liệu KHÔNG gộp dù trùng giá trị - hai nhiệm vụ cùng đạt 40 điểm
          vẫn là hai sự việc, gộp lại là đọc thành một.
        */
        visible.forEach((column, index) => {
          if (
            column.semanticKey === "stt" ||
            column.semanticKey === "work_content" ||
            column.semanticKey === "work_content_note"
          ) {
            mergeDown(index + 1, firstRow, lastRow);
          }
        });
      }

      // STT đánh theo nội dung công việc, khớp cách đánh số của mẫu giấy.
      if (sttIndex >= 0) {
        const cell = sheet.getCell(firstRow, sttIndex + 1);
        cell.value = groupOrdinal;
        cell.alignment = { horizontal: "center", vertical: "middle" };
      }
    }

    if (!axis.groups.length) {
      const cell = sheet.getCell(cursor, 1);
      cell.value = "Trục này chưa có nhiệm vụ nào trong báo cáo.";
      cell.font = { italic: true };
      cursor += 1;
    }

    // Một dòng trống ngăn khối này với trục kế, khỏi dính vào nhau khi in.
    cursor += 1;
  }

  if (!axes.length && !hasCriteria) {
    sheet.getCell(cursor, 1).value = "Báo cáo chưa có nhiệm vụ nào.";
  }

  const buffer = await workbook.xlsx.writeBuffer();
  saveAs(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    `${slugify(report.title)}.xlsx`,
  );
}
