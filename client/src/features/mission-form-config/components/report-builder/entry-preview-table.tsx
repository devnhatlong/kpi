"use client";

import { useMemo } from "react";
import { TableProperties } from "lucide-react";

import { buildHeaderRows } from "@/features/mission-form-config/form-template-utils";
import {
  catalogOfSemantic,
  kindOfSemantic,
  type FormHeaderGroup,
  type FormTemplateColumn,
} from "@/features/mission-form-config/types";

/** Chữ mờ trong ô - nói đúng việc người nhập sẽ làm với ô đó. */
function placeholderOf(column: FormTemplateColumn): string {
  const kind = kindOfSemantic(column.semanticKey);
  if (kind === "auto") return "Tự điền";
  if (kind === "content") return "Admin khai sẵn";
  if (catalogOfSemantic(column.semanticKey)) {
    return `Chọn ${column.title.toLowerCase()}`;
  }
  if (column.dataType === "file") return "Đính kèm tệp";
  if (column.dataType === "boolean") return "Tích chọn";
  return `Nhập ${column.title.toLowerCase()}`;
}

type EntryPreviewTableProps = {
  columns: FormTemplateColumn[];
  headerGroups: FormHeaderGroup[];
};

/**
 * Bảng nhập liệu như cán bộ sẽ thấy - dựng từ đúng bộ cột đang kéo thả ở trên,
 * kể cả header gộp. Chỉ là hình, không nhập được gì.
 */
export function EntryPreviewTable({
  columns,
  headerGroups,
}: EntryPreviewTableProps) {
  const preview = useMemo(
    () => buildHeaderRows(columns, headerGroups),
    [columns, headerGroups],
  );
  const visible = useMemo(
    () => columns.filter((column) => column.visible),
    [columns],
  );

  if (!preview || visible.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
        <TableProperties className="size-7 opacity-40" />
        <span>Chưa có trường nào đang hiển thị để xem trước.</span>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full border-collapse text-sm">
        <thead>
          {preview.rows.map((row, rowIdx) => (
            <tr key={`head-${rowIdx}`}>
              {rowIdx === 0 ? (
                <th
                  rowSpan={preview.rows.length}
                  className="w-14 border-b border-r bg-muted/60 px-3 py-2 text-center align-middle text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  STT
                </th>
              ) : null}
              {row.map((cell) => (
                <th
                  key={cell.key}
                  colSpan={cell.colSpan}
                  rowSpan={cell.rowSpan}
                  style={{ minWidth: cell.minWidth }}
                  className="border-b border-r bg-muted/60 px-3 py-2 text-left align-middle text-xs font-semibold text-foreground last:border-r-0"
                >
                  {cell.label}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {[1, 2].map((rowNumber) => (
            <tr key={rowNumber} className="border-b last:border-b-0">
              <td className="border-r px-3 py-2.5 text-center text-muted-foreground tabular-nums">
                {rowNumber}
              </td>
              {visible.map((column) => (
                <td
                  key={column.id}
                  className="border-r px-3 py-2.5 text-muted-foreground/70 last:border-r-0"
                >
                  {placeholderOf(column)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
