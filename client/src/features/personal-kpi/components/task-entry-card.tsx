"use client";

import { Plus, TriangleAlert, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { FormTemplateColumn } from "@/features/kpi-form-config/types";
import { TaskFieldsGrid } from "@/features/personal-kpi/components/task-fields-grid";
import type {
  DraftContentEntry,
  PersonalTaskDraft,
} from "@/features/personal-kpi/types";

type TaskEntryCardProps = {
  /** Neo để cuộn tới thẻ vừa thêm. */
  id?: string;
  entry: DraftContentEntry;
  /** Số thứ tự nội dung trong cả phiếu nhập. */
  index: number;
  contentName: string;
  contentDescription?: string;
  /** Bộ cột của mẫu bảng gán cho trục; rỗng khi trục chưa gán mẫu. */
  columns: FormTemplateColumn[];
  hasTemplate: boolean;
  /** Nhóm điểm của nội dung công việc - đổ xuống mọi việc trong thẻ. */
  scoreGroupId: string;
  disabled?: boolean;
  /** Sửa một nhiệm vụ đã có thì không thêm / bớt việc được. */
  fixedTasks?: boolean;
  onAddTask: () => void;
  onRemoveTask: (taskKey: string) => void;
  onTaskChange: (taskKey: string, patch: Partial<PersonalTaskDraft>) => void;
  onRemove: () => void;
};

/**
 * Thẻ nhập việc của một nội dung công việc.
 * Các ô trong thẻ dựng theo mẫu KPI của trục chứa nội dung đó, nên hai nội dung
 * khác trục sẽ có bộ ô khác nhau.
 */
export function TaskEntryCard({
  id,
  entry,
  index,
  contentName,
  contentDescription,
  columns,
  hasTemplate,
  scoreGroupId,
  disabled = false,
  fixedTasks = false,
  onAddTask,
  onRemoveTask,
  onTaskChange,
  onRemove,
}: TaskEntryCardProps) {
  return (
    <div id={id} className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="flex items-start gap-2 border-b bg-muted/30 px-3 py-2.5">
        <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-xs font-semibold text-primary tabular-nums">
          {index}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold" title={contentName}>
            {contentName}
          </p>
          {contentDescription ? (
            <p className="truncate text-xs text-muted-foreground">
              {contentDescription}
            </p>
          ) : null}
        </div>
        <span className="mt-1 shrink-0 text-xs text-muted-foreground tabular-nums">
          {entry.tasks.length} việc
        </span>
        {!fixedTasks ? (
          <>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-8 shrink-0"
              onClick={onAddTask}
              disabled={disabled || !hasTemplate}
              aria-label={`Thêm việc cho ${contentName}`}
              title="Thêm việc"
            >
              <Plus className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-8 shrink-0"
              onClick={onRemove}
              disabled={disabled}
              aria-label={`Bỏ nội dung ${contentName}`}
              title="Bỏ nội dung này"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </Button>
          </>
        ) : null}
      </div>

      {!hasTemplate ? (
        <div className="flex flex-col items-center gap-2 border-t border-dashed border-amber-500/40 bg-amber-500/5 p-6 text-center">
          <TriangleAlert className="size-5 text-amber-600 dark:text-amber-500" />
          <p className="text-sm font-medium">Trục này chưa gán mẫu bảng</p>
          <p className="max-w-md text-xs text-muted-foreground">
            Chưa có mẫu bảng nào áp dụng cho trục của nội dung này nên chưa nhập
            được. Bỏ nội dung này hoặc liên hệ quản trị để cấu hình tại Cấu hình
            form KPI › Mẫu bảng KPI.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5 p-3">
          {entry.tasks.map((task, taskIndex) => (
            <div
              key={task.key}
              className="flex items-start gap-2 rounded-lg border bg-background p-2.5"
            >
              <span className="mt-6 flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-medium text-muted-foreground tabular-nums">
                {taskIndex + 1}
              </span>
              <div className="min-w-0 flex-1">
                <TaskFieldsGrid
                  columns={columns}
                  task={task}
                  scoreGroupId={scoreGroupId}
                  disabled={disabled}
                  onChange={(patch) => onTaskChange(task.key, patch)}
                />
              </div>
              {!fixedTasks ? (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="mt-5 size-8 shrink-0"
                  onClick={() => onRemoveTask(task.key)}
                  disabled={disabled || entry.tasks.length <= 1}
                  aria-label={`Xoá việc ${taskIndex + 1}`}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              ) : null}
            </div>
          ))}

          {!fixedTasks ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="bg-background"
              onClick={onAddTask}
              disabled={disabled}
            >
              <Plus className="h-4 w-4" />
              Thêm việc
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}
