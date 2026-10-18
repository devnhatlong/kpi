import ExcelJS from "exceljs";
import { saveAs } from "file-saver";

import {
  setOutlineBorder,
  sheetName,
  slugify,
} from "@/features/team-report/excel";

/*
  Xuất "Bảng tổng hợp nội dung biểu dương, phê bình, chấn chỉnh" ra Excel, bám
  mẫu Word của PV01: phần đầu (tiêu đề, dòng ban hành kèm công văn, đơn vị),
  rồi hai bảng "1. Bảng nội dung biểu dương" / "2. Bảng nội dung phê bình,
  chấn chỉnh".

  Bảng biểu dương gom theo NHÓM NỘI DUNG đúng thứ tự danh mục, kể cả nhóm chưa
  có dòng nào (mẫu giấy liệt kê đủ 5 nhóm); TT và tên nhóm gộp dọc theo nhóm.
*/

export type CommendationExportRow = {
  itemId: string | null;
  itemName: string;
  /** Đơn vị đã nối sẵn ("PC03", "Công an xã A, Công an xã B"). */
  units: string;
  content: string;
  evidence: string;
  note: string;
  /** Đơn vị đề xuất - chỉ có ở bản xuất tổng hợp nhiều đơn vị. */
  source?: string;
};

export type CommendationExportInput = {
  /** "YYYY-MM". */
  periodMonth: string;
  /** Phòng lập bảng. */
  unitName: string;
  statusLabel?: string;
  /** Nhóm nội dung biểu dương theo thứ tự danh mục. */
  criteria: Array<{ id: string; name: string }>;
  praises: CommendationExportRow[];
  criticisms: CommendationExportRow[];
};

const HEAD_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFE2E8F0" },
};

/**
 * Ghi MỘT trang tính theo mẫu. `withSource` = bản tổng hợp nhiều đơn vị: thêm
 * cột cuối "Đơn vị đề xuất" để biết dòng nào của phòng nào.
 */
function writeSheet(
  workbook: ExcelJS.Workbook,
  input: CommendationExportInput,
  withSource: boolean,
) {
  const [y, m] = input.periodMonth.split("-");
  const LAST_COL = withSource ? 7 : 6;
  const sheet = workbook.addWorksheet(sheetName(`Thang ${m}-${y}`, "Bang"), {
    pageSetup: {
      paperSize: 9,
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
  });
  [5, 30, 24, 50, 32, 16, 18].slice(0, LAST_COL).forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });

  const line = (
    row: number,
    text: string,
    font: Partial<ExcelJS.Font> = {},
    align: "center" | "left" = "center",
  ) => {
    sheet.mergeCells(row, 1, row, LAST_COL);
    const cell = sheet.getCell(row, 1);
    cell.value = text;
    cell.font = font;
    cell.alignment = { horizontal: align, vertical: "middle", wrapText: true };
  };
  line(1, "BẢNG TỔNG HỢP", { bold: true, size: 14 });
  line(
    2,
    `Nội dung biểu dương, phê bình, chấn chỉnh Công an các đơn vị, địa phương tháng ${m}/${y}`,
    { bold: true },
  );
  line(
    3,
    `(Ban hành kèm theo Công văn số:         /CAT-PV01-Đ4 ngày        /${m}/${y})`,
    { italic: true },
  );
  line(
    4,
    `Đơn vị: ${input.unitName}${input.statusLabel ? `   ·   ${input.statusLabel}` : ""}`,
    {},
    "left",
  );

  const head = (row: number, titles: Array<[string, number, number]>) => {
    for (const [text, from, to] of titles) {
      if (to > from) sheet.mergeCells(row, from, row, to);
      const cell = sheet.getCell(row, from);
      cell.value = text;
      cell.font = { bold: true };
      cell.fill = HEAD_FILL;
      cell.alignment = {
        horizontal: "center",
        vertical: "middle",
        wrapText: true,
      };
      setOutlineBorder(cell);
    }
    sheet.getRow(row).height = 48;
  };
  const body = (row: number, col: number, value: string | number) => {
    const cell = sheet.getCell(row, col);
    cell.value = value;
    cell.alignment = {
      vertical: "middle",
      wrapText: true,
      horizontal: col === 1 ? "center" : undefined,
    };
    setOutlineBorder(cell);
  };

  // ---------------------------------------------------------- 1. biểu dương
  let cursor = 6;
  sheet.getCell(cursor, 1).value = "1. Bảng nội dung biểu dương";
  sheet.getCell(cursor, 1).font = { bold: true };
  cursor += 1;
  head(cursor, [
    ["TT", 1, 1],
    ["Nhóm nội dung đề xuất biểu dương", 2, 2],
    ["Đơn vị, địa phương được biểu dương", 3, 3],
    [
      "Nội dung, kết quả nổi bật đã có văn bản ghi nhận hoặc đề xuất biểu dương",
      4,
      4,
    ],
    ["Căn cứ, tài liệu kiểm chứng", 5, 5],
    ["Ghi chú", 6, 6],
    ...(withSource
      ? ([["Đơn vị đề xuất", 7, 7]] as Array<[string, number, number]>)
      : []),
  ]);
  cursor += 1;

  // Nhóm theo danh mục, cộng nhóm cũ chỉ còn trong dữ liệu (danh mục đổi sau).
  const groups = input.criteria.map((item) => ({ ...item }));
  for (const row of input.praises) {
    if (row.itemId && !groups.some((group) => group.id === row.itemId)) {
      groups.push({ id: row.itemId, name: row.itemName });
    }
  }
  groups.forEach((group, index) => {
    const rows = input.praises.filter((row) => row.itemId === group.id);
    const count = Math.max(1, rows.length);
    const top = cursor;
    for (let i = 0; i < count; i += 1) {
      const row = rows[i];
      body(top + i, 3, row?.units ?? "");
      body(top + i, 4, row?.content ?? "");
      body(top + i, 5, row?.evidence ?? "");
      body(top + i, 6, row?.note ?? "");
      if (withSource) body(top + i, 7, row?.source ?? "");
    }
    for (const [col, value] of [
      [1, index + 1],
      [2, group.name],
    ] as const) {
      if (count > 1) sheet.mergeCells(top, col, top + count - 1, col);
      body(top, col, value);
    }
    cursor += count;
  });

  // ------------------------------------------------- 2. phê bình, chấn chỉnh
  cursor += 1;
  sheet.getCell(cursor, 1).value = "2. Bảng nội dung phê bình, chấn chỉnh";
  sheet.getCell(cursor, 1).font = { bold: true };
  cursor += 1;
  /* Bảng phê bình ít hơn một cột (không có nhóm nội dung): cột "Nội dung tồn
     tại" gộp hai cột giữa để hai bảng thẳng mép phải với nhau. */
  head(cursor, [
    ["TT", 1, 1],
    ["Đơn vị, địa phương bị đề xuất phê bình, chấn chỉnh", 2, 2],
    [
      "Nội dung tồn tại, hạn chế đã có văn bản thể hiện hoặc cần phê bình, chấn chỉnh",
      3,
      4,
    ],
    ["Căn cứ, tài liệu kiểm chứng", 5, 5],
    ["Ghi chú", 6, 6],
    ...(withSource
      ? ([["Đơn vị đề xuất", 7, 7]] as Array<[string, number, number]>)
      : []),
  ]);
  cursor += 1;
  const criticisms = input.criticisms.length
    ? input.criticisms
    : [null as CommendationExportRow | null];
  criticisms.forEach((row, index) => {
    body(cursor, 1, row ? index + 1 : "");
    body(cursor, 2, row?.units ?? "");
    sheet.mergeCells(cursor, 3, cursor, 4);
    body(cursor, 3, row?.content ?? "");
    body(cursor, 5, row?.evidence ?? "");
    body(cursor, 6, row?.note ?? "");
    if (withSource) body(cursor, 7, row?.source ?? "");
    cursor += 1;
  });
}

function download(buffer: ExcelJS.Buffer, name: string) {
  saveAs(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    `${slugify(name)}.xlsx`,
  );
}

export async function exportCommendationToExcel(
  input: CommendationExportInput,
) {
  const [y, m] = input.periodMonth.split("-");
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();
  writeSheet(workbook, input, false);
  download(
    await workbook.xlsx.writeBuffer(),
    `bieu-duong-phe-binh-${m}-${y}-${input.unitName}`,
  );
}

/**
 * Xuất TỔNG HỢP nhiều bảng (hộp đến): mỗi THÁNG một trang tính, dòng của mọi
 * đơn vị gộp chung theo mẫu - biểu dương vẫn gom theo nhóm nội dung - kèm cột
 * "Đơn vị đề xuất".
 */
export async function exportCommendationsCombined(input: {
  criteria: Array<{ id: string; name: string }>;
  sheets: Array<{
    periodMonth: string;
    departmentName: string;
    praises: CommendationExportRow[];
    criticisms: CommendationExportRow[];
  }>;
  /** Ghi ở dòng "Đơn vị:" - VD "Tất cả đơn vị · Đã duyệt". */
  scopeLabel: string;
}) {
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();
  const months = [...new Set(input.sheets.map((s) => s.periodMonth))].sort(
    (a, b) => b.localeCompare(a),
  );
  for (const month of months) {
    const sheets = input.sheets.filter((s) => s.periodMonth === month);
    const tag = (rows: CommendationExportRow[], source: string) =>
      rows.map((row) => ({ ...row, source }));
    writeSheet(
      workbook,
      {
        periodMonth: month,
        unitName: `${input.scopeLabel} (${sheets.length} đơn vị)`,
        criteria: input.criteria,
        praises: sheets.flatMap((s) => tag(s.praises, s.departmentName)),
        criticisms: sheets.flatMap((s) => tag(s.criticisms, s.departmentName)),
      },
      true,
    );
  }
  const label = months.length === 1 ? months[0]! : "nhieu-thang";
  download(
    await workbook.xlsx.writeBuffer(),
    `bieu-duong-phe-binh-tong-hop-${label}`,
  );
}
