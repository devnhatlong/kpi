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

/* ===================================================== xuất nâng cao */

/** Một đơn vị theo thứ tự cây đơn vị, kèm khối chứa nó (server trả). */
export type CommendationUnitOrder = {
  id: string;
  /** Mã với phòng, tên với cấp xã - in ở cột đơn vị. */
  label: string;
  blockId: string;
  blockName: string;
};

/** Một dòng nội dung đã TÁCH theo từng đơn vị được nêu tên. */
export type CommendationAdvancedRow = {
  departmentId: string;
  /** Tên dự phòng khi đơn vị không còn trong cây (đã tắt / đổi cấp). */
  departmentLabel: string;
  content: string;
  evidence: string;
  note: string;
  source: string;
};

/**
 * Xuất NÂNG CAO - một loại mỗi file (biểu dương HOẶC phê bình), theo yêu cầu
 * PV01 (user chốt 2026-10-19):
 * - Bỏ cột nhóm nội dung; mỗi ĐƠN VỊ một dòng riêng (dòng nêu nhiều đơn vị
 *   được tách ra), một đơn vị nhiều nội dung thì TT + tên đơn vị gộp dọc.
 * - Hai nhóm: đơn vị CÓ nội dung trước, KHÔNG có nội dung sau (mỗi đơn vị
 *   một dòng trống riêng, không gộp); mỗi nhóm theo thứ tự cây đơn vị (ngầm
 *   theo khối, không in dòng tên khối), PV01 luôn đứng đầu nhóm.
 * Mỗi tháng một trang tính.
 */
export async function exportCommendationsAdvanced(input: {
  kind: "PRAISE" | "CRITICISM";
  units: CommendationUnitOrder[];
  sheets: Array<{ periodMonth: string; rows: CommendationAdvancedRow[] }>;
  scopeLabel: string;
}) {
  const praise = input.kind === "PRAISE";
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();
  const months = [...new Set(input.sheets.map((s) => s.periodMonth))].sort(
    (a, b) => b.localeCompare(a),
  );

  for (const month of months) {
    const [y, m] = month.split("-");
    const rows = input.sheets
      .filter((s) => s.periodMonth === month)
      .flatMap((s) => s.rows);
    const sheet = workbook.addWorksheet(sheetName(`Thang ${m}-${y}`, "Bang"), {
      pageSetup: {
        paperSize: 9,
        orientation: "landscape",
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
      },
    });
    const LAST = 6;
    [6, 28, 52, 34, 18, 22].forEach((width, index) => {
      sheet.getColumn(index + 1).width = width;
    });

    const line = (
      row: number,
      text: string,
      font: Partial<ExcelJS.Font> = {},
      align: "center" | "left" = "center",
    ) => {
      sheet.mergeCells(row, 1, row, LAST);
      const cell = sheet.getCell(row, 1);
      cell.value = text;
      cell.font = font;
      cell.alignment = { horizontal: align, vertical: "middle", wrapText: true };
    };
    line(1, "BẢNG TỔNG HỢP", { bold: true, size: 14 });
    line(
      2,
      praise
        ? `Nội dung biểu dương Công an các đơn vị, địa phương tháng ${m}/${y}`
        : `Nội dung phê bình, chấn chỉnh Công an các đơn vị, địa phương tháng ${m}/${y}`,
      { bold: true },
    );
    line(
      3,
      `(Ban hành kèm theo Công văn số:         /CAT-PV01-Đ4 ngày        /${m}/${y})`,
      { italic: true },
    );
    line(4, `Đơn vị: ${input.scopeLabel}`, {}, "left");

    // ------------------------------------------------------- tiêu đề cột
    const headRow = 6;
    const titles = [
      "TT",
      praise
        ? "Đơn vị, địa phương được biểu dương"
        : "Đơn vị, địa phương bị đề xuất phê bình, chấn chỉnh",
      praise
        ? "Nội dung, kết quả nổi bật đã có văn bản ghi nhận hoặc đề xuất biểu dương"
        : "Nội dung tồn tại, hạn chế đã có văn bản thể hiện hoặc cần phê bình, chấn chỉnh",
      "Căn cứ, tài liệu kiểm chứng",
      "Ghi chú",
      "Đơn vị đề xuất",
    ];
    titles.forEach((text, index) => {
      const cell = sheet.getCell(headRow, index + 1);
      cell.value = text;
      cell.font = { bold: true };
      cell.fill = HEAD_FILL;
      cell.alignment = {
        horizontal: "center",
        vertical: "middle",
        wrapText: true,
      };
      setOutlineBorder(cell);
    });
    sheet.getRow(headRow).height = 48;
    sheet.pageSetup.printTitlesRow = `${headRow}:${headRow}`;
    sheet.views = [{ state: "frozen", ySplit: headRow }];

    const body = (
      row: number,
      col: number,
      value: string | number,
      center = false,
    ) => {
      const cell = sheet.getCell(row, col);
      cell.value = value;
      cell.alignment = {
        vertical: "middle",
        wrapText: true,
        horizontal: center ? "center" : undefined,
      };
      setOutlineBorder(cell);
    };

    // ------------------------------------------- gom nội dung theo đơn vị
    const byUnit = new Map<string, CommendationAdvancedRow[]>();
    for (const row of rows) {
      byUnit.set(row.departmentId, [
        ...(byUnit.get(row.departmentId) ?? []),
        row,
      ]);
    }
    /* Thứ tự (user chốt 2026-10-19): KHÔNG có dòng tên khối - thứ tự cây đơn
       vị đã ngầm xếp theo khối. Hai nhóm liền nhau, TT đánh liên tục:
       1) đơn vị CÓ nội dung, 2) đơn vị KHÔNG có nội dung (mỗi đơn vị một dòng
       trống, không gộp). Trong mỗi nhóm giữ thứ tự cây, riêng PV01 luôn đứng
       đầu nhóm. Đơn vị có nội dung mà không còn trong cây (đã tắt / đổi cấp)
       xếp cuối nhóm 1. */
    const known = new Set(input.units.map((unit) => unit.id));
    const tree = [
      ...input.units.filter((unit) => unit.label === "PV01"),
      ...input.units.filter((unit) => unit.label !== "PV01"),
    ].map((unit) => ({ id: unit.id, label: unit.label }));
    const strays = [...byUnit.keys()]
      .filter((id) => !known.has(id))
      .map((id) => ({ id, label: byUnit.get(id)![0]!.departmentLabel }));
    const ordered = [
      ...tree.filter((unit) => byUnit.has(unit.id)),
      ...strays,
      ...tree.filter((unit) => !byUnit.has(unit.id)),
    ];

    let cursor = headRow + 1;
    ordered.forEach((unit, index) => {
      const items = byUnit.get(unit.id) ?? [];
      const lines = Math.max(1, items.length);
      for (let i = 0; i < lines; i += 1) {
        const item = items[i];
        body(cursor + i, 3, item?.content ?? "");
        body(cursor + i, 4, item?.evidence ?? "");
        body(cursor + i, 5, item?.note ?? "");
        body(cursor + i, 6, item?.source ?? "");
      }
      // TT + đơn vị gộp dọc khi một đơn vị có nhiều nội dung.
      for (const [col, value] of [
        [1, index + 1],
        [2, unit.label],
      ] as const) {
        if (lines > 1) sheet.mergeCells(cursor, col, cursor + lines - 1, col);
        body(cursor, col, value, col === 1);
      }
      cursor += lines;
    });
  }

  const label = months.length === 1 ? months[0]! : "nhieu-thang";
  download(
    await workbook.xlsx.writeBuffer(),
    `${praise ? "bieu-duong" : "phe-binh"}-tong-hop-${label}`,
  );
}
