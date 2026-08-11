"use client";

import { type ReactNode } from "react";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { TableCell, TableRow } from "@/components/ui/table";
import { AttachmentCell } from "@/features/personal-kpi/components/attachment-cell";
import { CatalogSelectCell } from "@/features/personal-kpi/components/catalog-select-cell";
import {
  catalogOfSemantic,
  type FormTemplateColumn,
} from "@/features/kpi-form-config/types";
import { cn } from "@/lib/utils";
import {
  cellInputProps,
  isCheckboxColumn,
  readCellValue,
  readCheckboxValue,
  writeCellValue,
  writeCheckboxValue,
} from "@/features/personal-kpi/task-column-utils";
import type { PersonalTaskDraft } from "@/features/personal-kpi/types";

type PersonalTaskFormProps = {
  index: number;
  /** Số thứ tự nhiệm vụ trong nội dung - dùng cho placeholder */
  taskNumber?: number;
  task: PersonalTaskDraft;
  /** Cột đang hiển thị của mẫu bảng gán cho trục. */
  columns: FormTemplateColumn[];
  onChange: (patch: Partial<PersonalTaskDraft>) => void;
  onRemove: () => void;
  canRemove?: boolean;
  /** Hiện ô STT (rowspan) ở dòng đầu của nội dung */
  showSttCell?: boolean;
  /** Hiện ô Nội dung công việc (rowspan) ở dòng đầu */
  showWorkContentCell?: boolean;
  workContentLabel?: string;
  workContentRowSpan?: number;
  /** Chỉ xem (drawer chi tiết / gửi báo cáo) */
  readOnly?: boolean;
  /** Ô thao tác bên phải (ví dụ Duyệt / Từ chối) */
  actions?: ReactNode;
  /** Tô nền cả dòng - dùng để làm nổi nhiệm vụ bị trả lại. */
  rowClassName?: string;
};

const cellInputClass = "h-8";

export function PersonalTaskForm({
  index,
  taskNumber,
  task,
  columns,
  onChange,
  onRemove,
  canRemove = true,
  showSttCell = false,
  showWorkContentCell = false,
  workContentLabel = "",
  workContentRowSpan = 1,
  readOnly = false,
  actions,
  rowClassName,
}: PersonalTaskFormProps) {
  return (
    <TableRow className={rowClassName}>
      {columns.map((column) => {
        const minWidth = `${column.width}px`;

        // STT và Nội dung công việc gộp ô theo nhóm nhiệm vụ - chỉ vẽ ở dòng đầu.
        if (column.semanticKey === "stt") {
          if (!showSttCell) return null;
          return (
            <TableCell
              key={column.id}
              rowSpan={workContentRowSpan}
              className="sticky left-0 z-10 bg-background text-center align-middle text-muted-foreground"
              style={{ minWidth }}
            >
              {index}
            </TableCell>
          );
        }

        if (column.semanticKey === "work_content") {
          if (!showWorkContentCell) return null;
          return (
            <TableCell
              key={column.id}
              rowSpan={workContentRowSpan}
              className="max-w-[280px] whitespace-normal border-r bg-muted/20 align-middle text-sm font-medium"
              style={{ minWidth }}
            >
              {workContentLabel}
            </TableCell>
          );
        }

        // Cột gắn danh mục -> dropdown lấy đúng danh mục đã cấu hình, người
        // nhập không gõ được giá trị ngoài danh sách.
        const catalog = catalogOfSemantic(column.semanticKey);
        if (catalog) {
          return (
            <TableCell key={column.id} style={{ minWidth }}>
              <CatalogSelectCell
                catalog={catalog}
                value={readCellValue(task, column.semanticKey, column.key)}
                onValueChange={(next) =>
                  onChange(
                    writeCellValue(task, column.semanticKey, column.key, next),
                  )
                }
                disabled={readOnly}
              />
            </TableCell>
          );
        }

        if (column.dataType === "file") {
          return (
            <TableCell key={column.id} style={{ minWidth }}>
              <AttachmentCell
                files={task.attachments?.[column.key] ?? []}
                onChange={(next) =>
                  onChange({
                    attachments: {
                      ...(task.attachments ?? {}),
                      [column.key]: next,
                    },
                  })
                }
                readOnly={readOnly}
                label={column.title}
              />
            </TableCell>
          );
        }

        if (isCheckboxColumn(column.dataType)) {
          return (
            <TableCell
              key={column.id}
              className="text-center align-middle"
              style={{ minWidth }}
            >
              <Checkbox
                checked={readCheckboxValue(task, column.key)}
                onCheckedChange={(checked) =>
                  onChange(
                    writeCheckboxValue(task, column.key, checked === true),
                  )
                }
                disabled={readOnly}
                aria-label={column.title}
              />
            </TableCell>
          );
        }

        const inputProps = cellInputProps(column.dataType);

        return (
          <TableCell key={column.id} style={{ minWidth }}>
            <Input
              className={cellInputClass}
              type={inputProps.type}
              value={readCellValue(task, column.semanticKey, column.key)}
              onChange={(e) =>
                onChange(
                  writeCellValue(
                    task,
                    column.semanticKey,
                    column.key,
                    e.target.value,
                  ),
                )
              }
              placeholder={column.title}
              disabled={readOnly}
            />
          </TableCell>
        );
      })}

      {/* Dòng có tô màu thì ô sticky phải ăn theo, không sẽ hở một mảng nền khác màu. */}
      <TableCell
        className={cn(
          "sticky right-0 z-10 min-w-[200px] text-right align-middle",
          rowClassName ? "bg-inherit" : "bg-background",
        )}
      >
        {actions ? (
          actions
        ) : !readOnly ? (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={onRemove}
            disabled={!canRemove}
            aria-label="Xoá nhiệm vụ"
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        ) : null}
      </TableCell>
    </TableRow>
  );
}
