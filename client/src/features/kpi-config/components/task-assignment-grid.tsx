"use client";

import { useMemo, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { entityId } from "@/features/organization/types";
import { getApiErrorMessage } from "@/lib/api-client";
import { updateTaskAssignment } from "../api";
import { buildHeaderPreviewRows } from "../template-header-preview";
import {
  canInlineEditTemplateColumn,
  formatDateDisplay,
  formatDateTimeDisplay,
  getColumnSemanticField,
  getTemplateColumnValue,
  isNumericTemplateColumn,
  normalizeCellInput,
  toDateInputValue,
  toDateTimeInputValue,
  toTimeInputValue,
} from "../template-column-utils";
import type {
  KpiTemplate,
  TaskAssignment,
  TemplateColumn,
  WorkContent,
  WorkGroup,
} from "../types";

type TableRow =
  | { id: string; kind: "group"; label: string }
  | { id: string; kind: "content"; content: WorkContent }
  | {
      id: string;
      kind: "task";
      index: number;
      contentName: string;
      task: TaskAssignment;
    };

type TaskAssignmentGridProps = {
  template: KpiTemplate | null;
  groups: WorkGroup[];
  contents: WorkContent[];
  tasks: TaskAssignment[];
  loading: boolean;
  userRoleCodes: string[];
  onAddTask: (content: WorkContent) => void;
  onEditTask: (task: TaskAssignment) => void;
  onDeleteTask: (task: TaskAssignment) => void;
  onSaved: () => void;
  /** Nút sửa — mặc định "Sửa". Form 1 dùng "Giao". */
  editAriaLabel?: string;
  showDelete?: boolean;
};

function relationId(value: object | string): string {
  return entityId(value as { _id?: string; id?: string } | string);
}

function buildRows(
  groups: WorkGroup[],
  contents: WorkContent[],
  tasks: TaskAssignment[],
): TableRow[] {
  const rows: TableRow[] = [];
  const usedContents = new Set<string>();
  const usedTasks = new Set<string>();
  let index = 0;

  const appendContent = (content: WorkContent) => {
    const contentId = entityId(content);
    usedContents.add(contentId);
    rows.push({ id: `content-${contentId}`, kind: "content", content });
    for (const task of tasks.filter(
      (item) => relationId(item.contentId) === contentId,
    )) {
      index += 1;
      usedTasks.add(entityId(task));
      rows.push({
        id: entityId(task),
        kind: "task",
        index,
        contentName: content.name,
        task,
      });
    }
  };

  for (const group of groups) {
    rows.push({
      id: `group-${entityId(group)}`,
      kind: "group",
      label: group.name,
    });
    contents
      .filter((content) => relationId(content.groupId) === entityId(group))
      .forEach(appendContent);
  }

  const orphanContents = contents.filter(
    (content) => !usedContents.has(entityId(content)),
  );
  if (orphanContents.length) {
    rows.push({
      id: "group-other",
      kind: "group",
      label: "Nội dung chưa xác định nhóm",
    });
    orphanContents.forEach(appendContent);
  }

  for (const task of tasks.filter(
    (item) => !usedTasks.has(entityId(item)),
  )) {
    index += 1;
    const contentLabel =
      typeof task.contentId === "object" && task.contentId && "name" in task.contentId
        ? String((task.contentId as { name?: string }).name ?? "")
        : task.indicatorCode
          ? `${task.indicatorCode}${task.indicatorWeight != null ? ` (${task.indicatorWeight}%)` : ""}`
          : "Chỉ tiêu / nhiệm vụ";
    rows.push({
      id: entityId(task),
      kind: "task",
      index,
      contentName: contentLabel || "Chưa xác định",
      task,
    });
  }
  return rows;
}

function HeaderCell({
  children,
  rowSpan,
  colSpan,
  style,
}: {
  children: React.ReactNode;
  rowSpan?: number;
  colSpan?: number;
  style?: React.CSSProperties;
}) {
  return (
    <th
      rowSpan={rowSpan}
      colSpan={colSpan}
      style={style}
      className="border border-slate-300 bg-slate-100 px-2 py-2 text-center align-middle font-semibold leading-tight text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
    >
      {children}
    </th>
  );
}

function DataCell({
  children,
  className = "",
  title,
}: {
  children?: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <td
      title={title}
      className={`border border-slate-200 px-2 py-1.5 align-middle break-words whitespace-normal dark:border-slate-700 ${className}`}
    >
      {children}
    </td>
  );
}

function TemplateColumnCell({
  column,
  row,
  template,
  userRoleCodes,
  onSave,
}: {
  column: TemplateColumn;
  row: Extract<TableRow, { kind: "task" }>;
  template: KpiTemplate;
  userRoleCodes: string[];
  onSave: (
    task: TaskAssignment,
    column: TemplateColumn,
    rawValue: string,
  ) => Promise<boolean>;
}) {
  const value = getTemplateColumnValue(
    column,
    row.task,
    row.index - 1,
    template,
    row.contentName,
  );
  const editable = canInlineEditTemplateColumn(
    column,
    userRoleCodes,
    template,
  );

  const isNumber = isNumericTemplateColumn(column, template);
  const isDate = column.dataType === "date";
  const isTime = column.dataType === "time";
  const isDateTime = column.dataType === "datetime";
  const alignClass =
    column.dataType === "auto_increment"
      ? "text-center"
      : isNumber
        ? "text-right"
        : isDate || isTime || isDateTime
          ? "text-center"
          : "text-left";
  const displayValue = isDateTime && value
    ? formatDateTimeDisplay(value)
    : isDate && value
      ? formatDateDisplay(value)
      : value;

  if (editable) {
    const inputClassName =
      "h-7 w-full min-w-16 rounded border border-transparent bg-transparent px-1.5 outline-none hover:border-input focus:border-primary focus:bg-background";

    if (isNumber) {
      return (
        <DataCell className={`p-1 ${alignClass}`}>
          <input
            key={`${entityId(row.task)}-${column.key}-${value}`}
            type="number"
            inputMode="decimal"
            defaultValue={value}
            className={`${inputClassName} text-right [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`}
            onBlur={async (event) => {
              if (event.currentTarget.value === value) return;
              const saved = await onSave(
                row.task,
                column,
                event.currentTarget.value,
              );
              if (!saved) event.currentTarget.value = value;
            }}
          />
        </DataCell>
      );
    }

    if (isDate) {
      return (
        <DataCell className={`p-1 ${alignClass}`}>
          <input
            key={`${entityId(row.task)}-${column.key}-${value}`}
            type="date"
            defaultValue={toDateInputValue(value)}
            className={`${inputClassName} text-center`}
            onBlur={async (event) => {
              const next = event.currentTarget.value;
              if (next === toDateInputValue(value)) return;
              const saved = await onSave(row.task, column, next);
              if (!saved) event.currentTarget.value = toDateInputValue(value);
            }}
          />
        </DataCell>
      );
    }

    if (isTime) {
      return (
        <DataCell className={`p-1 ${alignClass}`}>
          <input
            key={`${entityId(row.task)}-${column.key}-${value}`}
            type="time"
            defaultValue={toTimeInputValue(value)}
            className={`${inputClassName} text-center`}
            onBlur={async (event) => {
              const next = event.currentTarget.value;
              if (next === toTimeInputValue(value)) return;
              const saved = await onSave(row.task, column, next);
              if (!saved) event.currentTarget.value = toTimeInputValue(value);
            }}
          />
        </DataCell>
      );
    }

    if (isDateTime) {
      return (
        <DataCell className={`p-1 ${alignClass}`}>
          <input
            key={`${entityId(row.task)}-${column.key}-${value}`}
            type="datetime-local"
            defaultValue={toDateTimeInputValue(value)}
            className={`${inputClassName} text-center`}
            onBlur={async (event) => {
              const next = event.currentTarget.value;
              if (next === toDateTimeInputValue(value)) return;
              const saved = await onSave(row.task, column, next);
              if (!saved)
                event.currentTarget.value = toDateTimeInputValue(value);
            }}
          />
        </DataCell>
      );
    }

    return (
      <DataCell className={`p-1 ${alignClass}`}>
        <textarea
          key={`${entityId(row.task)}-${column.key}-${value}`}
          rows={2}
          defaultValue={value}
          className="min-h-7 w-full min-w-16 resize-y rounded border border-transparent bg-transparent px-1.5 py-1 text-left outline-none hover:border-input focus:border-primary focus:bg-background"
          onBlur={async (event) => {
            if (event.currentTarget.value === value) return;
            const saved = await onSave(
              row.task,
              column,
              event.currentTarget.value,
            );
            if (!saved) event.currentTarget.value = value;
          }}
        />
      </DataCell>
    );
  }

  return (
    <DataCell
      className={`${alignClass} ${displayValue ? "" : "text-muted-foreground"}`}
    >
      {displayValue || "—"}
    </DataCell>
  );
}

export function TaskAssignmentGrid({
  template,
  groups,
  contents,
  tasks,
  loading,
  userRoleCodes,
  onAddTask,
  onEditTask,
  onDeleteTask,
  onSaved,
  editAriaLabel = "Sửa",
  showDelete = true,
}: TaskAssignmentGridProps) {
  const [fontSize, setFontSize] = useState(12);
  const [headerFontSize, setHeaderFontSize] = useState(11);
  const visibleColumns = useMemo(
    () => template?.columns.filter((item) => item.visible) ?? [],
    [template],
  );
  const headerPreview = useMemo(
    () =>
      template
        ? buildHeaderPreviewRows(visibleColumns, template.headerGroups)
        : null,
    [template, visibleColumns],
  );
  const rows = useMemo(
    () => buildRows(groups, contents, tasks),
    [groups, contents, tasks],
  );
  const columnCount = visibleColumns.length + 1;
  const minTableWidth = Math.max(
    960,
    visibleColumns.reduce((sum, item) => sum + item.width, 0) + 96,
  );

  const saveCell = async (
    task: TaskAssignment,
    column: TemplateColumn,
    rawValue: string,
  ): Promise<boolean> => {
    if (
      !canInlineEditTemplateColumn(
        column,
        userRoleCodes,
        template,
      )
    ) {
      toast.error("Bạn không có quyền nhập cột này (ROLE NHẬP).");
      return false;
    }

    const value = normalizeCellInput(column, rawValue, template);
    if (
      isNumericTemplateColumn(column, template) &&
      rawValue.trim() &&
      value === undefined
    ) {
      toast.error("Giá trị số không hợp lệ.");
      return false;
    }
    if (column.dataType === "date" && rawValue.trim() && value === undefined) {
      toast.error("Ngày không hợp lệ.");
      return false;
    }
    if (column.dataType === "time" && rawValue.trim() && value === undefined) {
      toast.error("Giờ không hợp lệ.");
      return false;
    }
    if (
      column.dataType === "datetime" &&
      rawValue.trim() &&
      value === undefined
    ) {
      toast.error("Ngày giờ không hợp lệ.");
      return false;
    }

    try {
      const nextFieldValues: Record<string, string | number> = {
        ...(task.fieldValues ?? {}),
      };
      if (value === undefined) {
        delete nextFieldValues[column.key];
      } else {
        nextFieldValues[column.key] = value;
      }
      const patch: Parameters<typeof updateTaskAssignment>[1] = {
        fieldValues: nextFieldValues,
      };
      const semantic = getColumnSemanticField(column, template);
      if (semantic === "standard_score") {
        patch.standardScore = typeof value === "number" ? value : 0;
      }
      if (semantic === "proposed_adjustment") {
        patch.proposedAdjustment = typeof value === "number" ? value : 0;
      }
      await updateTaskAssignment(entityId(task), patch);
      onSaved();
      return true;
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không cập nhật được ô dữ liệu."));
      return false;
    }
  };

  if (!template) {
    return (
      <div className="rounded-md border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
        Chọn biểu mẫu KPI để bắt đầu cấu hình và giao nhiệm vụ.
      </div>
    );
  }

  if (!visibleColumns.length) {
    return (
      <div className="rounded-md border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
        Biểu mẫu “{template.name}” chưa có cột hiển thị. Hãy cấu hình cột ở tab
        Cấu hình biểu mẫu.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-4 rounded-md border bg-muted/30 px-3 py-2">
        <label className="flex items-center gap-2 text-xs font-medium">
          Cỡ chữ nội dung
          <input
            type="range"
            min={4}
            max={16}
            value={fontSize}
            onChange={(event) => setFontSize(Number(event.target.value))}
          />
          <span className="w-8 tabular-nums">{fontSize}px</span>
        </label>
        <label className="flex items-center gap-2 text-xs font-medium">
          Cỡ chữ tiêu đề
          <input
            type="range"
            min={4}
            max={16}
            value={headerFontSize}
            onChange={(event) => setHeaderFontSize(Number(event.target.value))}
          />
          <span className="w-8 tabular-nums">{headerFontSize}px</span>
        </label>
      </div>

      <div className="max-h-[70vh] overflow-auto rounded-md border">
        <table
          className="border-collapse bg-background"
          style={{ fontSize, minWidth: minTableWidth }}
        >
          {headerPreview ? (
            <colgroup>
              {headerPreview.widths.map((width, index) => (
                <col key={`col-${index}`} style={{ width }} />
              ))}
              <col style={{ width: 96 }} />
            </colgroup>
          ) : null}
          <thead
            className="sticky top-0 z-20"
            style={{ fontSize: headerFontSize }}
          >
            {headerPreview?.rows.map((headerRow, rowIndex) => (
              <tr key={`header-row-${rowIndex}`}>
                {headerRow.map((cell) => (
                  <HeaderCell
                    key={cell.key}
                    rowSpan={cell.rowSpan}
                    colSpan={cell.colSpan}
                    style={cell.minWidth ? { minWidth: cell.minWidth } : undefined}
                  >
                    {cell.label}
                  </HeaderCell>
                ))}
                {rowIndex === 0 ? (
                  <HeaderCell rowSpan={headerPreview.rows.length}>
                    Thao tác
                  </HeaderCell>
                ) : null}
              </tr>
            ))}
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={columnCount}
                  className="h-28 border text-center text-muted-foreground"
                >
                  Đang tải dữ liệu...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columnCount}
                  className="h-28 border text-center text-muted-foreground"
                >
                  Chưa có dữ liệu trong phạm vi biểu mẫu này.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                if (row.kind === "group") {
                  return (
                    <tr key={row.id}>
                      <td
                        colSpan={columnCount}
                        className="border border-slate-700 bg-slate-800 px-3 py-2 text-center font-bold uppercase text-white dark:bg-slate-950"
                      >
                        {row.label}
                      </td>
                    </tr>
                  );
                }
                if (row.kind === "content") {
                  const contentId = entityId(row.content);
                  const taskCount = tasks.filter(
                    (item) => relationId(item.contentId) === contentId,
                  ).length;
                  const canAddMore =
                    row.content.allowMultipleTasks !== false || taskCount === 0;
                  return (
                    <tr key={row.id}>
                      <td
                        colSpan={columnCount}
                        className="border border-slate-300 bg-slate-100 px-3 py-1.5 font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                      >
                        <div className="flex items-center gap-3">
                          {canAddMore ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 shrink-0 px-2 text-xs"
                              onClick={() => onAddTask(row.content)}
                            >
                              <Plus className="h-3.5 w-3.5" />
                              Thêm nhiệm vụ
                            </Button>
                          ) : (
                            <span
                              className="h-7 shrink-0 px-2 text-xs font-normal text-muted-foreground"
                              title="Nội dung này chỉ cho phép một nhiệm vụ"
                            >
                              Đã đủ 1 nhiệm vụ
                            </span>
                          )}
                          <span className="min-w-0 flex-1 text-center break-words whitespace-normal">
                            {row.content.name}
                          </span>
                          <span className="w-[7.5rem] shrink-0" aria-hidden />
                        </div>
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr
                    key={row.id}
                    className="even:bg-slate-50/70 hover:bg-blue-50/60 dark:even:bg-slate-900/30 dark:hover:bg-blue-950/30"
                  >
                    {visibleColumns.map((column) => (
                      <TemplateColumnCell
                        key={`${row.id}-${column.id}`}
                        column={column}
                        row={row}
                        template={template}
                        userRoleCodes={userRoleCodes}
                        onSave={saveCell}
                      />
                    ))}
                    <DataCell className="sticky right-0 bg-background p-1 text-center">
                      <div className="inline-flex gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => onEditTask(row.task)}
                          aria-label={editAriaLabel}
                          title={editAriaLabel}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        {showDelete ? (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => onDeleteTask(row.task)}
                            aria-label="Xoá"
                          >
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        ) : null}
                      </div>
                    </DataCell>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Biểu mẫu: {template.name} ({template.code}) · chỉ sửa được cột đúng
        ROLE NHẬP của bạn · nhấp ô và rời để lưu.
      </p>
    </div>
  );
}
