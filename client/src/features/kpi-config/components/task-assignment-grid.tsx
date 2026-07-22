"use client";

import { useMemo, useState } from "react";
import dayjs from "dayjs";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { entityId } from "@/features/organization/types";
import { getApiErrorMessage } from "@/lib/api-client";
import { updateTaskAssignment } from "../api";
import { buildHeaderPreviewRows } from "../template-header-preview";
import {
  getColumnEditableField,
  resolveColumnSourceField,
  resolveTaskColumnValue,
  type TaskEditableField,
} from "../template-field-resolver";
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
  onAddTask: (content: WorkContent) => void;
  onEditTask: (task: TaskAssignment) => void;
  onDeleteTask: (task: TaskAssignment) => void;
  onSaved: () => void;
};

const percentFields = new Set<TaskEditableField>([
  "selfProgressPercent",
  "selfQualityPercent",
  "appraisalProgressPercent",
  "appraisalQualityPercent",
]);
const textFields = new Set<TaskEditableField>([
  "actualProduct",
  "note",
  "proposedAdjustmentReason",
]);

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
    rows.push({
      id: entityId(task),
      kind: "task",
      index,
      contentName: "Chưa xác định",
      task,
    });
  }
  return rows;
}

function HeaderCell({
  children,
  rowSpan,
  colSpan,
  className = "",
  style,
}: {
  children: React.ReactNode;
  rowSpan?: number;
  colSpan?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <th
      rowSpan={rowSpan}
      colSpan={colSpan}
      style={style}
      className={`border border-slate-300 bg-slate-100 px-2 py-2 text-center align-middle font-semibold leading-tight text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 ${className}`}
    >
      {children}
    </th>
  );
}

function DataCell({
  children,
  className = "",
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <td
      className={`border border-slate-200 px-2 py-1.5 align-middle dark:border-slate-700 ${className}`}
    >
      {children}
    </td>
  );
}

function EditableCell({
  task,
  field,
  type = "number",
  value,
  onSave,
}: {
  task: TaskAssignment;
  field: TaskEditableField;
  type?: "number" | "text";
  value: string | number | undefined;
  onSave: (
    task: TaskAssignment,
    field: TaskEditableField,
    rawValue: string,
  ) => Promise<boolean>;
}) {
  const original = value == null ? "" : String(value);
  return (
    <DataCell className="p-1">
      <input
        key={`${entityId(task)}-${field}-${original}`}
        type={type}
        min={type === "number" && field !== "proposedAdjustment" ? 0 : undefined}
        max={percentFields.has(field) ? 100 : undefined}
        defaultValue={original}
        className="h-7 w-full min-w-16 rounded border border-transparent bg-transparent px-1.5 text-center outline-none hover:border-input focus:border-primary focus:bg-background"
        onBlur={async (event) => {
          if (event.currentTarget.value === original) return;
          const saved = await onSave(task, field, event.currentTarget.value);
          if (!saved) event.currentTarget.value = original;
        }}
      />
    </DataCell>
  );
}

function TaskColumnCell({
  column,
  row,
  onSave,
}: {
  column: TemplateColumn;
  row: Extract<TableRow, { kind: "task" }>;
  onSave: (
    task: TaskAssignment,
    field: TaskEditableField,
    rawValue: string,
  ) => Promise<boolean>;
}) {
  const value = resolveTaskColumnValue(column, {
    rowIndex: row.index - 1,
    contentName: row.contentName,
    task: row.task,
  });
  const editableField = getColumnEditableField(column);
  const sourceField = resolveColumnSourceField(column);

  if (editableField) {
    return (
      <EditableCell
        task={row.task}
        field={editableField}
        type={textFields.has(editableField) ? "text" : "number"}
        value={value}
        onSave={onSave}
      />
    );
  }

  const overdue =
    sourceField === "due_date" &&
    dayjs(row.task.dueDate).isBefore(dayjs(), "day") &&
    row.task.status !== "APPRAISED";

  return (
    <DataCell
      className={
        sourceField === "standard_score"
          ? "text-center font-semibold"
          : sourceField === "due_date"
            ? overdue
              ? "text-center font-semibold text-red-600"
              : "text-center"
            : sourceField === "task_title"
              ? ""
              : "text-center text-muted-foreground"
      }
    >
      {sourceField === "task_title" ? (
        <>
          <div className="font-medium">{row.task.title}</div>
          <div className="mt-0.5 text-[0.9em] text-muted-foreground">
            {row.task.assigneeId.fullName || row.task.assigneeId.username}
          </div>
        </>
      ) : (
        (value ?? "")
      )}
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
  onSaved,
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
    field: TaskEditableField,
    rawValue: string,
  ): Promise<boolean> => {
    let value: string | number | undefined = rawValue.trim();
    if (!textFields.has(field)) {
      value = rawValue.trim() === "" ? undefined : Number(rawValue);
      if (typeof value === "number" && !Number.isFinite(value)) {
        toast.error("Giá trị nhập không hợp lệ.");
        return false;
      }
      if (
        typeof value === "number" &&
        percentFields.has(field) &&
        (value < 0 || value > 100)
      ) {
        toast.error("Phần trăm phải nằm trong khoảng 0 đến 100.");
        return false;
      }
      if (
        typeof value === "number" &&
        field !== "proposedAdjustment" &&
        value < 0
      ) {
        toast.error("Điểm không được nhỏ hơn 0.");
        return false;
      }
    }

    try {
      await updateTaskAssignment(entityId(task), { [field]: value });
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
                  return (
                    <tr key={row.id}>
                      <td
                        colSpan={columnCount}
                        className="relative border border-slate-300 bg-slate-100 px-3 py-1.5 text-center font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                      >
                        <span>{row.content.name}</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="absolute right-3 top-1/2 h-7 -translate-y-1/2 px-2 text-xs"
                          onClick={() => onAddTask(row.content)}
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Thêm nhiệm vụ
                        </Button>
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
                      <TaskColumnCell
                        key={`${row.id}-${column.id}`}
                        column={column}
                        row={row}
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
                          aria-label="Sửa"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => onDeleteTask(row.task)}
                          aria-label="Xoá"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
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
        Biểu mẫu: {template.name} ({template.code}) · cuộn ngang để xem toàn bộ
        cột; nhấp vào ô nhập liệu và rời ô để lưu.
      </p>
    </div>
  );
}
