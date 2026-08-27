"use client";

import { type ReactNode } from "react";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { TableCell, TableRow } from "@/components/ui/table";
import { AttachmentCell } from "@/features/personal-mission/components/attachment-cell";
import { CatalogSelectCell } from "@/features/personal-mission/components/catalog-select-cell";
import { useQualityLevelMap } from "@/features/mission-form-config/use-quality-levels";
import { useScoreGroupMap } from "@/features/mission-form-config/use-score-groups";
import {
  catalogOfSemantic,
  computeAutoValue,
  formatScoreRange,
  isScoreInGroupRange,
  type FormTemplateColumn,
} from "@/features/mission-form-config/types";
import { formatScoreNumber } from "@/features/personal-mission/board-cell";
import { cn } from "@/lib/utils";
import {
  cellInputProps,
  isCheckboxColumn,
  readCellValue,
  readCheckboxValue,
  writeCellValue,
  writeCheckboxValue,
} from "@/features/personal-mission/task-column-utils";
import type { PersonalTaskDraft } from "@/features/personal-mission/types";

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
  /**
   * Nhóm điểm gắn với nội dung công việc của dòng - cán bộ không tự chọn nữa.
   * Bỏ trống thì rơi về giá trị đã lưu trên nhiệm vụ (dữ liệu cũ, màn chỉ xem).
   */
  autoScoreGroupId?: string;
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
  autoScoreGroupId,
  readOnly = false,
  actions,
  rowClassName,
}: PersonalTaskFormProps) {
  // Chỉ gọi danh mục khi mẫu thật sự có cột điểm bị giới hạn.
  const scoreGroupById = useScoreGroupMap(
    columns.some(
      (column) =>
        column.rangeFromColumnKey || column.semanticKey === "score_group",
    ),
  );
  const qualityLevelById = useQualityLevelMap(
    columns.some((column) => column.autoValue),
  );

  /**
   * Nhóm điểm của dòng: theo nội dung công việc, không theo ô người dùng chọn.
   * Mọi cột Nhóm điểm trong một mẫu đều lấy chung nhóm này, nên cột "Điểm" trỏ
   * vào cột nào cũng ra cùng một dải.
   */
  const rowScoreGroupId = (columnKey: string) =>
    autoScoreGroupId || task.catalogValues?.[columnKey] || "";

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

        // Nhóm điểm nay do nội dung công việc quyết định - hiện ra để đối chiếu
        // chứ không cho chọn. Ô này không ghi gì vào task; server tự điền lúc lưu.
        if (column.semanticKey === "score_group") {
          const group = scoreGroupById.get(rowScoreGroupId(column.key));
          return (
            <TableCell
              key={column.id}
              className="align-middle text-sm"
              style={{ minWidth }}
            >
              {group ? (
                <span
                  title={`Theo nội dung công việc · ${formatScoreRange(group)}`}
                >
                  {group.name}
                </span>
              ) : (
                <span className="text-xs text-amber-600 dark:text-amber-500">
                  Nội dung chưa gán nhóm điểm
                </span>
              )}
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

        // Ô tự tính: hiện số cho người nhập thấy ngay, nhưng con số lưu lại là
        // do server tính - hai bên dùng chung computeAutoValue nên không lệch.
        if (column.autoValue) {
          const auto = column.autoValue;
          const level = qualityLevelById.get(
            task.catalogValues?.[auto.percentColumnKey] ?? "",
          );
          const rawBase = task.fieldValues?.[auto.baseColumnKey] ?? "";
          const base = rawBase.trim() === "" ? null : Number(rawBase);
          const computed = computeAutoValue(
            auto.kind,
            level ? level.percent : null,
            base !== null && Number.isFinite(base) ? base : null,
          );
          return (
            <TableCell
              key={column.id}
              className="align-middle text-sm"
              style={{ minWidth }}
            >
              {computed === null ? (
                <span className="text-xs text-muted-foreground">
                  Chờ chọn chất lượng và nhập điểm
                </span>
              ) : (
                <span className="font-medium" title="Hệ thống tự tính">
                  {formatScoreNumber(computed)}
                </span>
              )}
            </TableCell>
          );
        }

        const inputProps = cellInputProps(column.dataType);
        // Cột điểm bị giới hạn thì ô nhập ăn theo nhóm điểm đang chọn ở dòng này.
        const boundGroup = column.rangeFromColumnKey
          ? scoreGroupById.get(rowScoreGroupId(column.rangeFromColumnKey))
          : undefined;
        const value = readCellValue(task, column.semanticKey, column.key);
        const outOfRange =
          Boolean(boundGroup) &&
          value.trim() !== "" &&
          Number.isFinite(Number(value)) &&
          !isScoreInGroupRange(Number(value), boundGroup!);

        return (
          <TableCell key={column.id} style={{ minWidth }}>
            <Input
              className={cn(
                cellInputClass,
                outOfRange &&
                  "border-rose-500 focus-visible:ring-rose-500 dark:border-rose-500",
              )}
              type={inputProps.type}
              min={boundGroup?.minScore}
              max={boundGroup?.maxScore}
              value={value}
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
              placeholder={
                column.rangeFromColumnKey
                  ? boundGroup
                    ? formatScoreRange(boundGroup)
                    : "Nội dung chưa gán nhóm điểm"
                  : column.title
              }
              disabled={readOnly}
              aria-invalid={outOfRange}
              title={
                outOfRange
                  ? `Ngoài dải ${formatScoreRange(boundGroup!)} của ${boundGroup!.name}`
                  : undefined
              }
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
