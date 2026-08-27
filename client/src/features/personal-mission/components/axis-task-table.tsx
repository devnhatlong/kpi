"use client";

import type { ReactNode } from "react";
import { TriangleAlert } from "lucide-react";

import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import type { FormTemplateColumn } from "@/features/mission-form-config/types";
import { TaskTableHeader } from "@/features/personal-mission/components/task-table-header";
import { useAxisTemplate } from "@/features/personal-mission/use-axis-template";

type AxisTaskTableProps = {
  axisId: string;
  /** Dòng tiêu đề gộp phía trên các nhiệm vụ (Trục - Nội dung). */
  caption?: ReactNode;
  /** Các dòng nhiệm vụ - nhận đúng bộ cột của mẫu gán cho trục. */
  children: (columns: FormTemplateColumn[]) => ReactNode;
  /** Dòng cuối bảng (ví dụ nút Thêm nhiệm vụ). */
  footer?: (totalCols: number) => ReactNode;
  /** Nhãn cột thao tác bám phải. */
  actionLabel?: string;
};

/**
 * Khung bảng nhiệm vụ theo trục: header lấy từ mẫu bảng gán cho trục đó.
 * Trục chưa gán mẫu thì không dựng bảng - không có bảng mặc định thay thế.
 */
export function AxisTaskTable({
  axisId,
  caption,
  children,
  footer,
  actionLabel,
}: AxisTaskTableProps) {
  const template = useAxisTemplate(axisId);

  if (template.isLoading) {
    return (
      <div className="rounded-md border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
        Đang tải mẫu bảng...
      </div>
    );
  }

  if (!template.hasTemplate) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-amber-500/40 bg-amber-500/5 p-6 text-center">
        <TriangleAlert className="size-6 text-amber-600 dark:text-amber-500" />
        <p className="text-sm font-medium">Trục này chưa gán mẫu bảng</p>
        <p className="max-w-md text-xs text-muted-foreground">
          Chưa có mẫu bảng nào áp dụng cho trục này nên chưa nhập được nhiệm vụ.
          Liên hệ quản trị để cấu hình tại Cấu hình form nhiệm vụ › Mẫu bảng
          nhiệm vụ.
        </p>
      </div>
    );
  }

  const totalCols = template.columns.length + 1;
  const minWidth = template.columns.reduce(
    (sum, column) => sum + column.width,
    140,
  );

  return (
    <div className="space-y-1.5">
      <div className="overflow-auto rounded-md border bg-card">
        <Table style={{ minWidth }}>
          <TaskTableHeader
            columns={template.columns}
            headerGroups={template.headerGroups}
            actionLabel={actionLabel}
          />
          <TableBody>
            {caption ? (
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableCell
                  colSpan={totalCols}
                  className="py-2 text-sm font-semibold"
                >
                  {caption}
                </TableCell>
              </TableRow>
            ) : null}
            {children(template.columns)}
            {footer ? footer(totalCols) : null}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
