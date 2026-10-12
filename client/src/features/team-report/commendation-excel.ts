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

const LAST_COL = 6;

export async function exportCommendationToExcel(
  input: CommendationExportInput,
) {
  const [y, m] = input.periodMonth.split("-");
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(sheetName(`Thang ${m}-${y}`, "Bang"), {
    pageSetup: {
      paperSize: 9,
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
  });
  [5, 30, 24, 50, 32, 16].forEach((width, index) => {
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
      vertical: "top",
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
    cursor += 1;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  saveAs(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    `${slugify(`bieu-duong-phe-binh-${m}-${y}-${input.unitName}`)}.xlsx`,
  );
}
