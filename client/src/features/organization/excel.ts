import ExcelJS from "exceljs";
import { saveAs } from "file-saver";

import type { ImportDepartmentRow } from "@/features/organization/types";

const HEADERS = ["code", "name", "levelCode", "parentCode", "sortOrder", "isActive"] as const;

function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value).trim();
  }
  if (typeof value === "object" && "text" in value && typeof value.text === "string") {
    return value.text.trim();
  }
  if (typeof value === "object" && "result" in value) {
    return cellText(value.result as ExcelJS.CellValue);
  }
  return String(value).trim();
}

function parseBool(raw: string): boolean | undefined {
  if (!raw) return undefined;
  const v = raw.toLowerCase();
  if (["1", "true", "yes", "y", "có", "co", "hiển thị", "hien thi"].includes(v)) return true;
  if (["0", "false", "no", "n", "không", "khong", "ẩn", "an"].includes(v)) return false;
  return undefined;
}

export async function downloadUnitsImportTemplate() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("DonVi");

  ws.addRow([...HEADERS]);
  ws.getRow(1).font = { bold: true };
  ws.addRow(["CAT", "Công an tỉnh Lâm Đồng", "", "TINH", 0, true]);
  ws.addRow(["PV01", "Phòng Tham mưu", "CAT", "PHONG", 1, true]);
  ws.addRow(["TMTH", "Đội Tham mưu Tổng hợp", "PV01", "DOI", 1, true]);

  ws.columns = [
    { width: 14 },
    { width: 36 },
    { width: 14 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
  ];

  const buffer = await wb.xlsx.writeBuffer();
  saveAs(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    "mau-import-don-vi.xlsx",
  );
}

export async function parseUnitsExcel(file: File): Promise<ImportDepartmentRow[]> {
  const wb = new ExcelJS.Workbook();
  const buffer = await file.arrayBuffer();
  await wb.xlsx.load(buffer);

  const ws = wb.worksheets[0];
  if (!ws) throw new Error("File Excel không có sheet nào.");

  const headerRow = ws.getRow(1);
  const headerMap = new Map<string, number>();
  headerRow.eachCell((cell, col) => {
    const key = cellText(cell.value).toLowerCase();
    if (key) headerMap.set(key, col);
  });

  const col = (name: string) => headerMap.get(name.toLowerCase());

  if (!col("code") || !col("name")) {
    throw new Error('File cần có cột "code" và "name" ở dòng đầu.');
  }

  const rows: ImportDepartmentRow[] = [];

  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;

    const code = cellText(row.getCell(col("code")!).value);
    const name = cellText(row.getCell(col("name")!).value);
    if (!code && !name) return;

    const parentCode = col("parentcode")
      ? cellText(row.getCell(col("parentcode")!).value) || undefined
      : undefined;
    const levelCode = col("levelcode")
      ? cellText(row.getCell(col("levelcode")!).value) || undefined
      : undefined;
    const sortRaw = col("sortorder")
      ? cellText(row.getCell(col("sortorder")!).value)
      : "";
    const activeRaw = col("isactive")
      ? cellText(row.getCell(col("isactive")!).value)
      : "";

    rows.push({
      code,
      name,
      parentCode,
      levelCode,
      sortOrder: sortRaw ? Number(sortRaw) || 0 : undefined,
      isActive: parseBool(activeRaw),
    });
  });

  if (!rows.length) throw new Error("Không có dòng dữ liệu hợp lệ trong file.");
  return rows;
}
