"use client";

import { useMemo } from "react";

import { TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { buildHeaderRows } from "@/features/kpi-form-config/form-template-utils";
import type {
  FormHeaderGroup,
  FormTemplateColumn,
} from "@/features/kpi-form-config/types";
import { cn } from "@/lib/utils";

type TaskTableHeaderProps = {
  columns: FormTemplateColumn[];
  headerGroups: FormHeaderGroup[];
  /** Nhãn cột thao tác bám phải (mặc định để trống). */
  actionLabel?: string;
  /**
   * Cột hệ thống chèn trước cột của mẫu - ví dụ ô tích và "Người gửi" ở màn
   * duyệt. Không đưa vào mẫu vì mẫu do super admin cấu hình, không nên chứa
   * cột của riêng một màn hình.
   */
  leadingColumns?: Array<{ key: string; label: string; width?: number }>;
};

/**
 * Header bảng nhiệm vụ dựng theo mẫu gán cho trục (gộp ô nhiều tầng).
 * Cột thao tác bám phải, luôn có bất kể mẫu nào.
 */
export function TaskTableHeader({
  columns,
  headerGroups,
  actionLabel,
  leadingColumns,
}: TaskTableHeaderProps) {
  const preview = useMemo(
    () => buildHeaderRows(columns, headerGroups),
    [columns, headerGroups],
  );

  if (!preview) return null;
  const totalRows = preview.rows.length;

  return (
    <TableHeader>
      {preview.rows.map((row, rowIdx) => (
        <TableRow key={`header-row-${rowIdx}`}>
          {rowIdx === 0
            ? (leadingColumns ?? []).map((column) => (
                <TableHead
                  key={column.key}
                  rowSpan={totalRows}
                  style={{ minWidth: column.width }}
                  className="align-middle bg-muted/50 text-sm font-medium"
                >
                  {column.label}
                </TableHead>
              ))
            : null}
          {row.map((cell, cellIdx) => (
            <TableHead
              key={cell.key}
              colSpan={cell.colSpan}
              rowSpan={cell.rowSpan}
              style={{ minWidth: cell.minWidth }}
              className={cn(
                "align-middle text-sm font-medium",
                cell.colSpan > 1 && "text-center",
                // Ô STT ở cột đầu bám trái cùng với ô dữ liệu; có cột hệ thống
                // chèn trước thì nó không còn là cột đầu nữa.
                rowIdx === 0 &&
                  cellIdx === 0 &&
                  !leadingColumns?.length &&
                  "sticky left-0 z-20 bg-muted/50",
              )}
            >
              {cell.label}
            </TableHead>
          ))}
          {rowIdx === 0 ? (
            <TableHead
              rowSpan={totalRows}
              className={cn(
                "sticky right-0 z-20 bg-muted/50",
                actionLabel
                  ? "w-[110px] text-center align-middle text-sm font-medium"
                  : "w-14",
              )}
            >
              {actionLabel}
            </TableHead>
          ) : null}
        </TableRow>
      ))}
    </TableHeader>
  );
}
