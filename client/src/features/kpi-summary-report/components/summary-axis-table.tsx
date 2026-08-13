"use client";

import { Fragment, useMemo, type ReactNode } from "react";
import { Check, TriangleAlert } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import {
  cellText,
  isTickedCell,
  rowSenderLabel,
} from "@/features/personal-kpi/board-cell";
import { AttachmentCell } from "@/features/personal-kpi/components/attachment-cell";
import { TaskTableHeader } from "@/features/personal-kpi/components/task-table-header";
import type {
  SummaryAxisBlock,
  SummaryRow,
} from "@/features/kpi-summary-report/types";
import { cn } from "@/lib/utils";

type SummaryAxisTableProps = {
  axis: SummaryAxisBlock;
  /** Có ô tích chọn ở đầu dòng hay không. */
  selectable?: boolean;
  selected?: Set<string>;
  onToggleRow?: (id: string) => void;
  onToggleGroup?: (rows: SummaryRow[]) => void;
  /** Nút thao tác bám phải từng dòng, ví dụ "Bỏ khỏi báo cáo". */
  renderRowAction?: (row: SummaryRow) => ReactNode;
  actionLabel?: string;
  /** Số thứ tự chạy liên tục cả báo cáo, không reset theo từng trục. */
  startIndex?: number;
};

/**
 * Một khối trục: bảng dựng theo đúng bộ cột của mẫu đã khoá lúc gửi, gom theo
 * Nội dung công việc. Dùng chung cho màn nhặt nhiệm vụ và màn xem báo cáo -
 * hai màn hình khác nhau ở chỗ có ô tích và có nút gì, không khác ở cách đọc dữ
 * liệu.
 */
export function SummaryAxisTable({
  axis,
  selectable = false,
  selected,
  onToggleRow,
  onToggleGroup,
  renderRowAction,
  actionLabel,
  startIndex = 0,
}: SummaryAxisTableProps) {
  /**
   * Số thứ tự của từng dòng, tính sẵn một lượt.
   * Không đếm dồn trong lúc render vì React có thể render lại nửa chừng, biến
   * đếm sẽ nhảy số.
   */
  const ordinals = useMemo(() => {
    const map = new Map<string, number>();
    let running = startIndex;
    for (const group of axis.groups) {
      for (const row of group.rows) {
        running += 1;
        map.set(row._id, running);
      }
    }
    return map;
  }, [axis, startIndex]);

  const template = axis.template;
  const axisTitle = (
    <p className="text-sm font-semibold">
      {axis.axisName || axis.axisCode}
      {axis.axisDescription ? (
        <span className="font-normal text-muted-foreground">
          {" – "}
          {axis.axisDescription}
        </span>
      ) : null}
    </p>
  );

  if (!template?.columns?.length) {
    const count = axis.groups.reduce((sum, group) => sum + group.rows.length, 0);
    return (
      <Card>
        <CardContent className="space-y-2 pt-6">
          {axisTitle}
          <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-amber-500/40 bg-amber-500/5 p-6 text-center">
            <TriangleAlert className="size-6 text-amber-600 dark:text-amber-500" />
            <p className="text-sm font-medium">Trục này chưa gán mẫu bảng</p>
            <p className="max-w-md text-xs text-muted-foreground">
              {count} nhiệm vụ không dựng được bảng. Gán mẫu tại Cấu hình form
              KPI › Mẫu bảng KPI rồi mở lại trang này.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const visible = template.columns.filter((column) => column.visible);
  const leading = [
    ...(selectable ? [{ key: "pick", label: "", width: 44 }] : []),
    { key: "stt", label: "TT", width: 56 },
    { key: "sender", label: "Cán bộ / đơn vị", width: 190 },
  ];
  const totalCols = visible.length + leading.length + 1;
  const minWidth = visible.reduce((sum, column) => sum + column.width, 0) + 380;

  return (
    <Card>
      <CardContent className="space-y-2 pt-6">
        {axisTitle}

        <div className="overflow-auto rounded-md border bg-card">
          <Table style={{ minWidth }}>
            <TaskTableHeader
              columns={template.columns}
              headerGroups={template.headerGroups}
              leadingColumns={leading}
              actionLabel={actionLabel}
            />
            <TableBody>
              {axis.groups.map((group) => {
                const ids = group.rows.map((row) => row._id);
                const allOn =
                  ids.length > 0 && ids.every((id) => selected?.has(id));
                return (
                  // Fragment đầy đủ vì một group trả về nhiều <tr>; fragment
                  // rút gọn <> không nhận key.
                  <Fragment key={`${group.workContentId}-${axis.axisId}`}>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableCell colSpan={totalCols} className="py-2">
                        <label
                          className={cn(
                            "flex items-center gap-2 text-sm font-semibold",
                            selectable ? "cursor-pointer" : "cursor-default",
                          )}
                        >
                          {selectable ? (
                            <Checkbox
                              checked={allOn}
                              onCheckedChange={() => onToggleGroup?.(group.rows)}
                            />
                          ) : null}
                          {group.workContentName || group.workContentCode}
                          {group.workContentDescription ? (
                            <span className="font-normal text-muted-foreground">
                              {" – "}
                              {group.workContentDescription}
                            </span>
                          ) : null}
                          <span className="font-normal text-muted-foreground">
                            · {group.rows.length} nhiệm vụ
                          </span>
                        </label>
                      </TableCell>
                    </TableRow>

                    {group.rows.map((row) => {
                      const sender = rowSenderLabel(row);
                      const ordinal = ordinals.get(row._id) ?? 0;
                      return (
                        <TableRow key={row._id}>
                          {selectable ? (
                            <TableCell className="align-middle">
                              <Checkbox
                                checked={selected?.has(row._id) ?? false}
                                onCheckedChange={() => onToggleRow?.(row._id)}
                                aria-label="Chọn nhiệm vụ"
                              />
                            </TableCell>
                          ) : null}
                          <TableCell className="align-middle text-sm text-muted-foreground">
                            {ordinal}
                          </TableCell>
                          <TableCell className="align-middle text-sm">
                            <div className="font-medium">{sender.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {sender.department}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {row.reportDate ?? ""}
                            </div>
                          </TableCell>

                          {visible.map((column) => {
                            if (column.dataType === "file") {
                              return (
                                <TableCell
                                  key={column.id}
                                  className="align-middle"
                                  style={{ minWidth: column.width }}
                                >
                                  <AttachmentCell
                                    files={row.attachments?.[column.key] ?? []}
                                    onChange={() => {}}
                                    readOnly
                                    label={column.title}
                                  />
                                </TableCell>
                              );
                            }
                            if (column.dataType === "boolean") {
                              return (
                                <TableCell
                                  key={column.id}
                                  className="text-center align-middle"
                                >
                                  {isTickedCell(row, column) ? (
                                    <Check className="mx-auto size-4 text-emerald-600" />
                                  ) : (
                                    <span className="text-muted-foreground">
                                      -
                                    </span>
                                  )}
                                </TableCell>
                              );
                            }
                            return (
                              <TableCell
                                key={column.id}
                                className="align-middle text-sm"
                                style={{ minWidth: column.width }}
                              >
                                {cellText(row, column) || (
                                  <span className="text-muted-foreground">
                                    -
                                  </span>
                                )}
                              </TableCell>
                            );
                          })}

                          {/* Bám phải cho khớp ô header cũng sticky, nếu không
                              cuộn ngang là hai bên lệch và chữ đè lên nhau. */}
                          <TableCell className="sticky right-0 z-10 bg-background text-center align-middle">
                            {renderRowAction?.(row)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
