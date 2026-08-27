"use client";

import { useMemo, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { entityId } from "@/features/organization/types";
import { buildHeaderPreviewRows } from "../template-header-preview";
import {
  formatDateDisplay,
  formatDateTimeDisplay,
  getColumnSemanticField,
  getTemplateColumnValue,
  isNumericTemplateColumn,
} from "../template-column-utils";
import type {
  MissionTemplate,
  TaskAssignment,
  TemplateColumn,
  WorkContent,
  WorkGroup,
} from "../types";
import { isAutoIncrementColumn } from "../types";

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
  template: MissionTemplate | null;
  groups: WorkGroup[];
  contents: WorkContent[];
  tasks: TaskAssignment[];
  loading: boolean;
  onAddTask: (content: WorkContent) => void;
  onEditTask: (task: TaskAssignment) => void;
  onDeleteTask: (task: TaskAssignment) => void;
  /** Nút sửa - mặc định "Sửa". Form 1 dùng "Giao". */
  editAriaLabel?: string;
  showDelete?: boolean;
  /** Ẩn / hiện nút + Thêm nhiệm vụ dưới dòng nội dung. */
  allowAddTask?: boolean | ((content: WorkContent) => boolean);
};

function relationId(value: object | string): string {
  return entityId(value as { _id?: string; id?: string } | string);
}

function assigneeLabel(task: TaskAssignment): string {
  if (typeof task.assigneeId === "object" && task.assigneeId) {
    return task.assigneeId.fullName?.trim() || task.assigneeId.username || "";
  }
  return "";
}

const ASSIGNEE_COL_WIDTH = 140;

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

  for (const task of tasks.filter((item) => !usedTasks.has(entityId(item)))) {
    index += 1;
    const contentLabel =
      typeof task.contentId === "object" &&
      task.contentId &&
      "name" in task.contentId
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
  rowSpan,
}: {
  children?: React.ReactNode;
  className?: string;
  title?: string;
  rowSpan?: number;
}) {
  return (
    <td
      title={title}
      rowSpan={rowSpan}
      className={`border border-slate-200 px-2 py-1.5 align-middle break-words whitespace-normal dark:border-slate-700 ${className}`}
    >
      {children}
    </td>
  );
}

/** Gộp cột nội dung công việc theo từng cụm task cùng contentId. */
function buildContentNameMerge(
  rows: TableRow[],
): Map<string, { rowSpan: number; skip: boolean }> {
  const map = new Map<string, { rowSpan: number; skip: boolean }>();
  let i = 0;
  while (i < rows.length) {
    const row = rows[i];
    if (!row || row.kind !== "task") {
      i += 1;
      continue;
    }
    const contentId = relationId(row.task.contentId);
    let j = i + 1;
    while (j < rows.length) {
      const next = rows[j];
      if (
        !next ||
        next.kind !== "task" ||
        relationId(next.task.contentId) !== contentId
      ) {
        break;
      }
      j += 1;
    }
    const span = j - i;
    for (let k = i; k < j; k++) {
      const taskRow = rows[k];
      if (!taskRow || taskRow.kind !== "task") continue;
      map.set(taskRow.id, {
        rowSpan: k === i ? span : 0,
        skip: k !== i,
      });
    }
    i = j;
  }
  return map;
}

function TemplateColumnCell({
  column,
  row,
  template,
}: {
  column: TemplateColumn;
  row: Extract<TableRow, { kind: "task" }>;
  template: MissionTemplate;
}) {
  const value = getTemplateColumnValue(
    column,
    row.task,
    row.index - 1,
    template,
    row.contentName,
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
  const displayValue =
    isDateTime && value
      ? formatDateTimeDisplay(value)
      : isDate && value
        ? formatDateDisplay(value)
        : value;

  return (
    <DataCell
      className={`${alignClass} ${displayValue ? "" : "text-muted-foreground"}`}
      title={displayValue || undefined}
    >
      {displayValue || "-"}
    </DataCell>
  );
}

export function TaskAssignmentGrid({
  template,
  groups,
  contents,
  tasks,
  loading,
  onAddTask,
  onEditTask,
  onDeleteTask,
  editAriaLabel = "Sửa",
  showDelete = true,
  allowAddTask = true,
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
  const contentNameMerge = useMemo(() => buildContentNameMerge(rows), [rows]);
  const columnCount = visibleColumns.length + 2;
  const minTableWidth = Math.max(
    960,
    visibleColumns.reduce((sum, item) => sum + item.width, 0) +
      ASSIGNEE_COL_WIDTH +
      96,
  );

  if (!template) {
    return (
      <div className="rounded-md border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
        Chọn biểu mẫu nhiệm vụ để bắt đầu cấu hình và giao nhiệm vụ.
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
              <col style={{ width: ASSIGNEE_COL_WIDTH }} />
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
                    style={
                      cell.minWidth ? { minWidth: cell.minWidth } : undefined
                    }
                  >
                    {cell.label}
                  </HeaderCell>
                ))}
                {rowIndex === 0 ? (
                  <>
                    <HeaderCell rowSpan={headerPreview.rows.length}>
                      Giao cho
                    </HeaderCell>
                    <HeaderCell rowSpan={headerPreview.rows.length}>
                      Thao tác
                    </HeaderCell>
                  </>
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
                  const canAdd =
                    typeof allowAddTask === "function"
                      ? allowAddTask(row.content)
                      : allowAddTask;
                  // Chưa có NV: hiện ND như 1 dòng dữ liệu (tên vào cột Nội dung).
                  // Đã có NV: dòng khung gọn + nút thêm.
                  if (taskCount > 0) {
                    return (
                      <tr key={row.id}>
                        <td
                          colSpan={columnCount}
                          className="border border-slate-300 bg-slate-100 px-3 py-1.5 font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                        >
                          <div className="flex items-center gap-3">
                            {canAdd ? (
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
                              <span className="w-[7.5rem] shrink-0 text-xs font-normal text-muted-foreground">
                                {taskCount} NV
                              </span>
                            )}
                            <span className="min-w-0 flex-1 text-center break-words whitespace-normal">
                              {row.content.name}
                            </span>
                            <span className="w-[4.5rem] shrink-0 text-right text-xs font-normal text-muted-foreground tabular-nums">
                              {taskCount} NV
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  let contentIndex = 0;
                  for (const item of rows) {
                    if (item.kind !== "content") continue;
                    contentIndex += 1;
                    if (item.id === row.id) break;
                  }

                  return (
                    <tr
                      key={row.id}
                      className="bg-slate-50/80 hover:bg-blue-50/40 dark:bg-slate-900/40 dark:hover:bg-blue-950/20"
                    >
                      {visibleColumns.map((column) => {
                        const semantic = getColumnSemanticField(
                          column,
                          template,
                        );
                        if (isAutoIncrementColumn(column)) {
                          return (
                            <DataCell
                              key={`${row.id}-${column.id}`}
                              className="text-center tabular-nums"
                            >
                              {contentIndex}
                            </DataCell>
                          );
                        }
                        if (semantic === "content_name") {
                          return (
                            <DataCell
                              key={`${row.id}-${column.id}`}
                              className="text-left font-medium align-middle"
                              title={row.content.name}
                            >
                              {row.content.name}
                            </DataCell>
                          );
                        }
                        return (
                          <DataCell
                            key={`${row.id}-${column.id}`}
                            className="text-muted-foreground"
                          >
                            -
                          </DataCell>
                        );
                      })}
                      <DataCell className="text-muted-foreground">-</DataCell>
                      <DataCell className="sticky right-0 bg-background p-1 text-center">
                        {canAdd ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                            onClick={() => onAddTask(row.content)}
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Thêm
                          </Button>
                        ) : null}
                      </DataCell>
                    </tr>
                  );
                }

                const assignedTo = assigneeLabel(row.task);
                const mergeInfo = contentNameMerge.get(row.id);
                return (
                  <tr
                    key={row.id}
                    className="even:bg-slate-50/70 hover:bg-blue-50/60 dark:even:bg-slate-900/30 dark:hover:bg-blue-950/30"
                  >
                    {visibleColumns.map((column) => {
                      const semantic = getColumnSemanticField(column, template);
                      if (semantic === "content_name") {
                        if (mergeInfo?.skip) return null;
                        const span =
                          mergeInfo && mergeInfo.rowSpan > 1
                            ? mergeInfo.rowSpan
                            : undefined;
                        return (
                          <DataCell
                            key={`${row.id}-${column.id}`}
                            rowSpan={span}
                            className="bg-background text-left font-medium align-middle"
                            title={row.contentName}
                          >
                            {row.contentName}
                          </DataCell>
                        );
                      }
                      return (
                        <TemplateColumnCell
                          key={`${row.id}-${column.id}`}
                          column={column}
                          row={row}
                          template={template}
                        />
                      );
                    })}
                    <DataCell
                      className={`min-w-[8rem] text-left ${assignedTo ? "" : "text-muted-foreground"}`}
                      title={assignedTo || "Chưa giao"}
                    >
                      {assignedTo || "-"}
                    </DataCell>
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
        Biểu mẫu: {template.name} ({template.code}) · xem trên bảng, chỉnh sửa
        bằng nút Sửa / Giao nhiệm vụ (form).
      </p>
    </div>
  );
}
