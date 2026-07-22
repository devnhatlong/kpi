"use client";

import { useMemo, useState } from "react";
import dayjs from "dayjs";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { entityId } from "@/features/organization/types";
import { getApiErrorMessage } from "@/lib/api-client";
import { updateTaskAssignment } from "../api";
import type { TaskAssignment, WorkContent, WorkGroup } from "../types";

type EditableField =
  | "actualProduct"
  | "selfProgressPercent"
  | "selfProgressScore"
  | "selfQualityPercent"
  | "selfQualityScore"
  | "proposedAdjustment"
  | "appraisalProgressPercent"
  | "appraisalProgressScore"
  | "appraisalQualityPercent"
  | "appraisalQualityScore"
  | "note";

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
  groups: WorkGroup[];
  contents: WorkContent[];
  tasks: TaskAssignment[];
  loading: boolean;
  onAddTask: (content: WorkContent) => void;
  onEditTask: (task: TaskAssignment) => void;
  onDeleteTask: (task: TaskAssignment) => void;
  onSaved: () => void;
};

const COLUMN_COUNT = 18;
const percentFields = new Set<EditableField>([
  "selfProgressPercent",
  "selfQualityPercent",
  "appraisalProgressPercent",
  "appraisalQualityPercent",
]);
const textFields = new Set<EditableField>(["actualProduct", "note"]);

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
      label: `${group.code} — ${group.name}`,
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
      label: "KHÁC — Nội dung chưa xác định nhóm",
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
}: {
  children: React.ReactNode;
  rowSpan?: number;
  colSpan?: number;
  className?: string;
}) {
  return (
    <th
      rowSpan={rowSpan}
      colSpan={colSpan}
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
  field: EditableField;
  type?: "number" | "text";
  value: string | number | undefined;
  onSave: (
    task: TaskAssignment,
    field: EditableField,
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

export function TaskAssignmentGrid({
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
  const rows = useMemo(
    () => buildRows(groups, contents, tasks),
    [groups, contents, tasks],
  );

  const saveCell = async (
    task: TaskAssignment,
    field: EditableField,
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
          className="min-w-[2300px] border-collapse bg-background"
          style={{ fontSize }}
        >
          <thead
            className="sticky top-0 z-20"
            style={{ fontSize: headerFontSize }}
          >
            <tr>
              <HeaderCell rowSpan={3} className="w-14">
                STT
              </HeaderCell>
              <HeaderCell rowSpan={3} className="w-64">
                Nội dung công việc
              </HeaderCell>
              <HeaderCell rowSpan={3} className="w-64">
                Nhiệm vụ
              </HeaderCell>
              <HeaderCell rowSpan={3} className="w-28">
                Thời hạn hoàn thành
              </HeaderCell>
              <HeaderCell rowSpan={3} className="w-44">
                Sản phẩm dự kiến
              </HeaderCell>
              <HeaderCell rowSpan={3} className="w-44">
                Sản phẩm sau khi thực hiện
              </HeaderCell>
              <HeaderCell rowSpan={3} className="w-20">
                Điểm chuẩn
              </HeaderCell>
              <HeaderCell colSpan={4}>Điểm tự chấm</HeaderCell>
              <HeaderCell rowSpan={3} className="w-36">
                Đề nghị cộng/trừ điểm của các phòng
              </HeaderCell>
              <HeaderCell colSpan={4}>
                Kết quả thẩm định của PV01 (Chỉ huy)
              </HeaderCell>
              <HeaderCell rowSpan={3} className="w-44">
                Ghi chú
              </HeaderCell>
              <HeaderCell rowSpan={3} className="w-24">
                Thao tác
              </HeaderCell>
            </tr>
            <tr>
              <HeaderCell colSpan={2}>Kết quả KPI tiến độ (B)</HeaderCell>
              <HeaderCell colSpan={2}>Kết quả KPI chất lượng (C)</HeaderCell>
              <HeaderCell colSpan={2}>Kết quả KPI tiến độ (B)</HeaderCell>
              <HeaderCell colSpan={2}>Kết quả KPI chất lượng (C)</HeaderCell>
            </tr>
            <tr>
              <HeaderCell>Thực tế hoàn thành %</HeaderCell>
              <HeaderCell>Điểm tự chấm</HeaderCell>
              <HeaderCell>Thực tế hoàn thành %</HeaderCell>
              <HeaderCell>Điểm tự chấm</HeaderCell>
              <HeaderCell>Thực tế hoàn thành %</HeaderCell>
              <HeaderCell>Điểm thẩm định</HeaderCell>
              <HeaderCell>Thực tế hoàn thành %</HeaderCell>
              <HeaderCell>Điểm thẩm định</HeaderCell>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={COLUMN_COUNT}
                  className="h-28 border text-center text-muted-foreground"
                >
                  Đang tải dữ liệu...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td
                  colSpan={COLUMN_COUNT}
                  className="h-28 border text-center text-muted-foreground"
                >
                  Chưa có dữ liệu cấu hình KPI.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                if (row.kind === "group") {
                  return (
                    <tr key={row.id}>
                      <td
                        colSpan={COLUMN_COUNT}
                        className="border border-slate-700 bg-slate-800 px-3 py-2 font-bold uppercase text-white dark:bg-slate-950"
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
                        colSpan={COLUMN_COUNT}
                        className="border border-slate-300 bg-slate-100 px-3 py-1.5 font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span>{row.content.name}</span>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                            onClick={() => onAddTask(row.content)}
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Thêm nhiệm vụ
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                }

                const { task } = row;
                const overdue =
                  dayjs(task.dueDate).isBefore(dayjs(), "day") &&
                  task.status !== "APPRAISED";
                return (
                  <tr
                    key={row.id}
                    className="even:bg-slate-50/70 hover:bg-blue-50/60 dark:even:bg-slate-900/30 dark:hover:bg-blue-950/30"
                  >
                    <DataCell className="text-center text-muted-foreground">
                      {row.index}
                    </DataCell>
                    <DataCell>{row.contentName}</DataCell>
                    <DataCell>
                      <div className="font-medium">{task.title}</div>
                      <div className="mt-0.5 text-[0.9em] text-muted-foreground">
                        {task.assigneeId.fullName || task.assigneeId.username}
                      </div>
                    </DataCell>
                    <DataCell
                      className={
                        overdue
                          ? "text-center font-semibold text-red-600"
                          : "text-center"
                      }
                    >
                      {dayjs(task.dueDate).format("DD/MM/YYYY")}
                    </DataCell>
                    <DataCell>{task.product}</DataCell>
                    <EditableCell
                      task={task}
                      field="actualProduct"
                      type="text"
                      value={task.actualProduct}
                      onSave={saveCell}
                    />
                    <DataCell className="text-center font-semibold">
                      {task.standardScore}
                    </DataCell>
                    <EditableCell
                      task={task}
                      field="selfProgressPercent"
                      value={task.selfProgressPercent}
                      onSave={saveCell}
                    />
                    <EditableCell
                      task={task}
                      field="selfProgressScore"
                      value={task.selfProgressScore}
                      onSave={saveCell}
                    />
                    <EditableCell
                      task={task}
                      field="selfQualityPercent"
                      value={task.selfQualityPercent}
                      onSave={saveCell}
                    />
                    <EditableCell
                      task={task}
                      field="selfQualityScore"
                      value={task.selfQualityScore}
                      onSave={saveCell}
                    />
                    <EditableCell
                      task={task}
                      field="proposedAdjustment"
                      value={task.proposedAdjustment}
                      onSave={saveCell}
                    />
                    <EditableCell
                      task={task}
                      field="appraisalProgressPercent"
                      value={task.appraisalProgressPercent}
                      onSave={saveCell}
                    />
                    <EditableCell
                      task={task}
                      field="appraisalProgressScore"
                      value={task.appraisalProgressScore}
                      onSave={saveCell}
                    />
                    <EditableCell
                      task={task}
                      field="appraisalQualityPercent"
                      value={task.appraisalQualityPercent}
                      onSave={saveCell}
                    />
                    <EditableCell
                      task={task}
                      field="appraisalQualityScore"
                      value={task.appraisalQualityScore}
                      onSave={saveCell}
                    />
                    <EditableCell
                      task={task}
                      field="note"
                      type="text"
                      value={task.note}
                      onSave={saveCell}
                    />
                    <DataCell className="sticky right-0 bg-background p-1 text-center">
                      <div className="inline-flex gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => onEditTask(task)}
                          aria-label="Sửa"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => onDeleteTask(task)}
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
        Bảng HTML thuần: cuộn ngang để xem toàn bộ cột; nhấp vào ô nhập liệu và
        rời ô để lưu.
      </p>
    </div>
  );
}
