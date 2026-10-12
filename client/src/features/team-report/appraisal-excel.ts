import ExcelJS from "exceljs";
import { saveAs } from "file-saver";

import {
  appraisalTotals,
  type AppraisalCriterion,
  type AppraisalUnit,
} from "@/features/team-report/appraisal";
import {
  setOutlineBorder,
  sheetName,
  slugify,
} from "@/features/team-report/excel";
import { formatScore } from "@/features/team-report/types";

/*
  Xuất "Phụ lục theo dõi, thẩm định tháng" ra Excel, bám mẫu giấy.

  Mỗi đơn vị là MỘT KHỐI DÒNG LỚN: TT, đơn vị, tự chấm, sau thẩm định và xếp
  loại gộp dọc suốt khối; bên trong mỗi tiêu chí một nhóm dòng, cộng và trừ
  đứng song song như phụ lục. Cuối khối là dòng tổng cộng / trừ của RIÊNG đơn
  vị đó - không có dòng tổng của cả bảng: điểm các đơn vị không cộng gộp với
  nhau, một con số tổng chỉ làm người đọc tưởng có ý nghĩa.

  Số ghi xuống dạng SỐ để Excel căn phải và dùng lại được trong công thức.
*/

const COLUMNS = [
  { title: "TT", width: 5 },
  { title: "Đơn vị", width: 18 },
  { title: "Tổng điểm tự chấm", width: 11 },
  { title: "Tiêu chí cộng điểm", width: 32 },
  { title: "Cụ thể nội dung minh chứng", width: 40 },
  { title: "Điểm cộng", width: 9 },
  { title: "Cụ thể nội dung trừ điểm", width: 36 },
  { title: "Điểm trừ", width: 9 },
  { title: "Tổng điểm sau thẩm định", width: 12 },
  { title: "Đề xuất mức xếp loại", width: 28 },
] as const;
const LAST_COL = COLUMNS.length;

/** Cột gộp dọc suốt khối của một đơn vị. */
const SPAN_COLS = [1, 2, 3, 9, 10];

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

export type AppraisalExportInput = {
  /** "YYYY-MM". */
  periodMonth: string;
  /** Đội lập bảng thẩm định. */
  teamName: string;
  /** Danh mục tiêu chí - giữ đúng thứ tự phụ lục; bỏ trống thì suy từ dữ liệu. */
  criteria?: AppraisalCriterion[];
  units: AppraisalUnit[];
  leaderName: string;
  commanderName: string;
  /** "Nháp", "Đã duyệt"... - ghi cạnh tiêu đề, bản nháp in ra không bị nhầm. */
  statusLabel?: string;
};

type Group = { id: string; name: string; maxScore: number | null };

/** Tiêu chí của một đơn vị: theo danh mục, cộng tiêu chí cũ chỉ còn trong dữ liệu. */
function groupsOf(unit: AppraisalUnit, criteria: AppraisalCriterion[]) {
  const list: Group[] = criteria.map((item) => ({
    id: item.id,
    name: item.name,
    maxScore: item.maxScore,
  }));
  for (const bonus of unit.bonuses) {
    if (bonus.itemId && !list.some((item) => item.id === bonus.itemId)) {
      list.push({
        id: bonus.itemId,
        name: bonus.itemName,
        maxScore: bonus.maxScore,
      });
    }
  }
  for (const penalty of unit.penalties) {
    if (penalty.itemId && !list.some((item) => item.id === penalty.itemId)) {
      list.push({ id: penalty.itemId, name: penalty.itemName, maxScore: null });
    }
  }
  return list;
}

const scoreCell = (value: number | null | undefined) =>
  value === null || value === undefined ? "" : value;

function monthLabel(periodMonth: string) {
  const [y, m] = periodMonth.split("-");
  return `${m}/${y}`;
}

/**
 * Ô xếp loại: CHỈ mức đề xuất. Lý do / ghi chú xếp loại là để xem trên phần
 * mềm, không đưa lên bản in.
 */
function ratingText(unit: AppraisalUnit) {
  return unit.proposedRating;
}

function styleBody(
  cell: ExcelJS.Cell,
  align: "left" | "center" | "right" = "left",
) {
  cell.alignment = { vertical: "top", horizontal: align, wrapText: true };
  setOutlineBorder(cell);
}

/** Ghi khối dòng của một đơn vị bắt đầu ở `top`; trả dòng kế tiếp. */
function writeUnit(
  sheet: ExcelJS.Worksheet,
  top: number,
  ordinal: number,
  unit: AppraisalUnit,
  criteria: AppraisalCriterion[],
) {
  const totals = appraisalTotals(unit);
  let cursor = top;

  const groups: Array<{
    label: string;
    bonuses: AppraisalUnit["bonuses"];
    penalties: AppraisalUnit["penalties"];
  }> = groupsOf(unit, criteria).map((group) => ({
    label:
      group.maxScore !== null
        ? `${group.name} (tối đa ${formatScore(group.maxScore)} điểm)`
        : group.name,
    // Dòng trống bày sẵn trên màn (chưa điểm, chưa minh chứng) thì không in.
    bonuses: unit.bonuses.filter(
      (bonus) =>
        bonus.itemId === group.id &&
        (bonus.score !== null || bonus.evidence.trim()),
    ),
    penalties: unit.penalties.filter(
      (penalty) =>
        penalty.itemId === group.id &&
        (penalty.score !== null || penalty.content.trim()),
    ),
  }));
  // Dòng trừ cũ chưa gắn tiêu chí - vẫn in, kẻo mất điểm trừ khỏi bản giấy.
  const loose = unit.penalties.filter(
    (penalty) =>
      !penalty.itemId && (penalty.score !== null || penalty.content.trim()),
  );
  if (loose.length) {
    groups.push({ label: "Trừ điểm khác", bonuses: [], penalties: loose });
  }

  for (const group of groups) {
    const lines = Math.max(1, group.bonuses.length, group.penalties.length);
    if (lines > 1) sheet.mergeCells(cursor, 4, cursor + lines - 1, 4);
    const criterion = sheet.getCell(cursor, 4);
    criterion.value = group.label;
    styleBody(criterion);

    for (let i = 0; i < lines; i += 1) {
      const row = cursor + i;
      const bonus = group.bonuses[i];
      const penalty = group.penalties[i];
      const values: Array<[number, string | number, "left" | "center"]> = [
        [5, bonus?.evidence ?? "", "left"],
        [6, scoreCell(bonus?.score), "center"],
        [7, penalty?.content ?? "", "left"],
        [8, scoreCell(penalty?.score), "center"],
      ];
      for (const [col, value, align] of values) {
        const cell = sheet.getCell(row, col);
        cell.value = value;
        styleBody(cell, align);
      }
      if (i > 0) setOutlineBorder(sheet.getCell(row, 4));
    }
    cursor += lines;
  }

  // Dòng tổng của RIÊNG đơn vị này.
  const totalCells: Array<[number, string | number]> = [
    [4, "Tổng điểm cộng / trừ"],
    [5, ""],
    [6, totals.bonusTotal],
    [7, ""],
    [8, totals.penaltyTotal],
  ];
  for (const [col, value] of totalCells) {
    const cell = sheet.getCell(cursor, col);
    cell.value = value;
    cell.font = { bold: true };
    cell.fill = TOTAL_FILL;
    styleBody(cell, col === 4 ? "left" : "center");
  }
  const bottom = cursor;

  // Cột gộp dọc suốt khối.
  const spanned: Record<number, string | number> = {
    1: ordinal,
    2: unit.shortName || unit.departmentName,
    3: scoreCell(unit.selfScore),
    9: scoreCell(totals.finalScore),
    10: ratingText(unit),
  };
  for (const col of SPAN_COLS) {
    if (bottom > top) sheet.mergeCells(top, col, bottom, col);
    const cell = sheet.getCell(top, col);
    cell.value = spanned[col] ?? "";
    cell.alignment = {
      vertical: "middle",
      horizontal: "center",
      wrapText: true,
    };
    if (col === 2 || col === 9) cell.font = { bold: true };
    setOutlineBorder(cell);
  }

  return bottom + 1;
}

/**
 * Xuất bảng thẩm định. Truyền MỘT đơn vị là bản riêng của đơn vị đó; truyền cả
 * danh sách là bản tổng hợp - cùng một khuôn, chỉ khác số khối.
 */
export async function exportAppraisalToExcel(
  input: AppraisalExportInput,
  options: { single?: boolean } = {},
) {
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();
  const month = monthLabel(input.periodMonth);
  const single = options.single && input.units.length === 1;
  const only = single ? input.units[0]! : null;
  const sheet = workbook.addWorksheet(
    sheetName(only ? only.shortName || only.departmentName : `Thang ${month}`, "Tham dinh"),
    {
      pageSetup: {
        paperSize: 9,
        orientation: "landscape",
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
      },
    },
  );
  COLUMNS.forEach((column, index) => {
    sheet.getColumn(index + 1).width = column.width;
  });

  // ----------------------------------------------------------- tiêu đề
  const banner = (row: number, text: string, bold = false, size = 11) => {
    sheet.mergeCells(row, 1, row, LAST_COL);
    const cell = sheet.getCell(row, 1);
    cell.value = text;
    cell.font = { bold, size };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  };
  banner(1, `PHỤ LỤC THEO DÕI, THẨM ĐỊNH THÁNG ${month}`, true, 14);
  banner(
    2,
    [
      input.teamName ? `Đơn vị thẩm định: ${input.teamName}` : "",
      only ? `Đơn vị được thẩm định: ${only.departmentName}` : "",
      input.statusLabel ?? "",
    ]
      .filter(Boolean)
      .join("   ·   "),
  );

  // ---------------------------------------------------- tiêu đề cột (2 dòng)
  const headTop = 4;
  const head = (row: number, col: number, text: string) => {
    const cell = sheet.getCell(row, col);
    cell.value = text;
    cell.font = { bold: true };
    cell.fill = HEAD_FILL;
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    setOutlineBorder(cell);
  };
  for (const col of [1, 2, 3, 4, 9, 10]) {
    sheet.mergeCells(headTop, col, headTop + 1, col);
    head(headTop, col, COLUMNS[col - 1]!.title);
  }
  sheet.mergeCells(headTop, 5, headTop, 6);
  head(headTop, 5, "Cộng điểm");
  sheet.mergeCells(headTop, 7, headTop, 8);
  head(headTop, 7, "Trừ điểm");
  for (const col of [5, 6, 7, 8]) head(headTop + 1, col, COLUMNS[col - 1]!.title);
  sheet.getRow(headTop + 1).height = 30;
  // In nhiều trang thì trang nào cũng có tiêu đề cột.
  sheet.pageSetup.printTitlesRow = `${headTop}:${headTop + 1}`;
  sheet.views = [{ state: "frozen", ySplit: headTop + 1 }];

  // ------------------------------------------------------------ các khối
  let cursor = headTop + 2;
  const criteria = input.criteria ?? [];
  input.units.forEach((unit, index) => {
    cursor = writeUnit(sheet, cursor, index + 1, unit, criteria);
  });
  if (!input.units.length) {
    sheet.mergeCells(cursor, 1, cursor, LAST_COL);
    sheet.getCell(cursor, 1).value = "Chưa có đơn vị nào trong bảng thẩm định.";
    cursor += 1;
  }

  // ---------------------------------------------------------------- ký
  cursor += 2;
  const sign = (from: number, to: number, lines: string[]) => {
    lines.forEach((text, index) => {
      sheet.mergeCells(cursor + index, from, cursor + index, to);
      const cell = sheet.getCell(cursor + index, from);
      cell.value = text;
      cell.alignment = { horizontal: "center" };
      if (index === 0 || index === lines.length - 1) cell.font = { bold: true };
    });
  };
  sign(1, 4, ["LÃNH ĐẠO PHỤ TRÁCH", "", "", "", input.leaderName]);
  sign(7, 10, ["CHỈ HUY ĐỘI", "", "", "", input.commanderName]);

  const buffer = await workbook.xlsx.writeBuffer();
  const name = only
    ? `tham-dinh-${month}-${only.shortName || only.departmentName}`
    : `tham-dinh-${month}-${input.teamName}`;
  saveAs(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    `${slugify(name)}.xlsx`,
  );
}
