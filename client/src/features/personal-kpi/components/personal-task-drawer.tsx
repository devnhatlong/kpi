"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ClipboardList, Inbox, Plus, Search } from "lucide-react";
import useSWR from "swr";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  fetchAxesAll,
  fetchWorkContentsAll,
} from "@/features/kpi-form-config/api";
import type { Axis, WorkContent } from "@/features/kpi-form-config/types";
import { entityId } from "@/features/kpi-form-config/types";
import { useScoreGroupMap } from "@/features/kpi-form-config/use-score-groups";
import {
  createPersonalKpiBatch,
  taskToWriteInput,
  updatePersonalKpi,
} from "@/features/personal-kpi/api";
import { TaskEntryCard } from "@/features/personal-kpi/components/task-entry-card";
import {
  missingRequiredColumns,
  outOfRangeColumns,
} from "@/features/personal-kpi/task-column-utils";
import {
  createContentEntry,
  createEmptyTask,
  isEmptyTask,
  type DraftContentEntry,
  type PersonalKpiItem,
  type PersonalTaskDraft,
} from "@/features/personal-kpi/types";
import { useAxisTemplates } from "@/features/personal-kpi/use-axis-templates";
import { getApiErrorMessage } from "@/lib/api-client";
import { cn } from "@/lib/utils";

function workContentAxisId(item: WorkContent): string {
  if (!item.axisId) return "";
  return typeof item.axisId === "string" ? item.axisId : item.axisId._id;
}

/** Nhóm điểm gán cho nội dung công việc - đổ xuống mọi việc của nội dung đó. */
function workContentScoreGroupId(item: WorkContent): string {
  if (!item.scoreGroupId) return "";
  return typeof item.scoreGroupId === "string"
    ? item.scoreGroupId
    : item.scoreGroupId._id;
}

/** Bỏ dấu để gõ "nhiem vu" vẫn tìm ra "nhiệm vụ". */
function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/đ/g, "d")
    .trim();
}

function searchHaystack(item: {
  name: string;
  code?: string;
  description?: string;
}): string {
  return normalizeText(`${item.name} ${item.code ?? ""} ${item.description ?? ""}`);
}

function sortByOrder<T extends { sortOrder: number; name: string }>(
  items: T[],
): T[] {
  return [...items].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
  );
}

function formatDayLabel(ymd: string): string {
  const date = new Date(`${ymd}T00:00:00`);
  if (Number.isNaN(date.getTime())) return ymd;
  return date.toLocaleDateString("vi-VN");
}

type PersonalTaskDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Sửa 1 nhiệm vụ đã có trên danh sách */
  edit?: PersonalKpiItem | null;
  /** Ngày báo cáo YYYY-MM-DD (mặc định hôm nay theo server) */
  reportDate?: string;
  onSaved: () => void | Promise<void>;
};

/**
 * Nhập nhiệm vụ trong ngày: chọn nội dung công tác ở thư viện bên trái, mỗi nội
 * dung chọn xong hiện thành một thẻ nhập bên phải.
 *
 * Các ô trong thẻ dựng theo mẫu KPI gán cho trục của nội dung đó - drawer không
 * tự đặt ra trường nào, đổi mẫu ở Cấu hình form KPI là màn này đổi theo.
 */
export function PersonalTaskDrawer({
  open,
  onOpenChange,
  edit,
  reportDate,
  onSaved,
}: PersonalTaskDrawerProps) {
  const {
    data: axes = [],
    isLoading: loadingAxes,
    error: axesError,
  } = useSWR(open ? ["axes", "all", "personal-task-drawer"] : null, fetchAxesAll);
  const {
    data: workContents = [],
    isLoading: loadingContents,
    error: contentsError,
  } = useSWR(
    open ? ["work-contents", "all", "personal-task-drawer"] : null,
    fetchWorkContentsAll,
  );
  const templates = useAxisTemplates(open);
  const scoreGroupById = useScoreGroupMap(open);

  const [entries, setEntries] = useState<DraftContentEntry[]>([]);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  /** Nội dung vừa bấm ở thư viện - cuộn tới thẻ nhập của nó. */
  const [focusKey, setFocusKey] = useState<string | null>(null);

  const isEdit = !!edit;
  const loading = loadingAxes || loadingContents || templates.isLoading;

  useEffect(() => {
    if (!open) return;
    if (axesError) {
      toast.error(getApiErrorMessage(axesError, "Không tải được danh sách trục."));
    }
  }, [open, axesError]);

  useEffect(() => {
    if (!open) return;
    if (contentsError) {
      toast.error(
        getApiErrorMessage(
          contentsError,
          "Không tải được danh sách nội dung công việc.",
        ),
      );
    }
  }, [open, contentsError]);

  useEffect(() => {
    if (!open) return;
    setSearch("");
    setEntries(
      edit
        ? [
            {
              key: `entry-edit-${edit.id}`,
              axisId: edit.axisId,
              workContentId: edit.workContentId,
              tasks: [{ ...edit.task }],
            },
          ]
        : [],
    );
  }, [open, edit]);

  // Thư viện dài hơn màn hình, thẻ vừa thêm dễ nằm ngoài tầm nhìn.
  useEffect(() => {
    if (!focusKey) return;
    document
      .getElementById(`kpi-entry-${focusKey}`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focusKey]);

  const axisById = useMemo(() => {
    const map = new Map<string, Axis>();
    for (const axis of axes) map.set(entityId(axis), axis);
    return map;
  }, [axes]);

  const contentById = useMemo(() => {
    const map = new Map<string, WorkContent>();
    for (const item of workContents) map.set(entityId(item), item);
    return map;
  }, [workContents]);

  /** Thứ tự trục dùng chung cho thư viện trái và các nhóm bên phải. */
  const orderedAxes = useMemo(() => sortByOrder(axes), [axes]);
  const axisOrderById = useMemo(() => {
    const map = new Map<string, number>();
    orderedAxes.forEach((axis, index) => map.set(entityId(axis), index));
    return map;
  }, [orderedAxes]);

  const libraryGroups = useMemo(() => {
    const term = normalizeText(search);
    return orderedAxes
      .map((axis, index) => {
        const axisId = entityId(axis);
        // Khớp tên trục thì giữ nguyên cả nhóm, khỏi phải gõ đúng tên nội dung.
        const axisMatched = !term || searchHaystack(axis).includes(term);
        const contents = sortByOrder(
          workContents.filter((item) => workContentAxisId(item) === axisId),
        ).filter(
          (item) => axisMatched || searchHaystack(item).includes(term),
        );
        return {
          axis,
          axisId,
          order: index + 1,
          contents,
          hasTemplate: templates.byAxis.has(axisId),
        };
      })
      .filter((group) => group.contents.length > 0);
  }, [orderedAxes, workContents, search, templates.byAxis]);

  /** Số việc đang nhập của từng nội dung - hiện lên huy hiệu ở thư viện. */
  const taskCountByContent = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of entries) {
      map.set(
        entry.workContentId,
        (map.get(entry.workContentId) ?? 0) + entry.tasks.length,
      );
    }
    return map;
  }, [entries]);

  /** Nội dung đã chọn, gom theo trục và xếp đúng thứ tự trục của danh mục. */
  const axisGroups = useMemo(() => {
    const grouped = new Map<string, DraftContentEntry[]>();
    for (const entry of entries) {
      const list = grouped.get(entry.axisId) ?? [];
      list.push(entry);
      grouped.set(entry.axisId, list);
    }

    const sorted = [...grouped.entries()].sort(
      ([left], [right]) =>
        (axisOrderById.get(left) ?? Number.MAX_SAFE_INTEGER) -
        (axisOrderById.get(right) ?? Number.MAX_SAFE_INTEGER),
    );

    return sorted.map(([axisId, list], groupIndex) => {
      // Số thứ tự chạy theo thứ tự nhìn thấy, không theo thứ tự bấm chọn.
      const before = sorted
        .slice(0, groupIndex)
        .reduce((sum, [, items]) => sum + items.length, 0);
      return {
        axisId,
        axis: axisById.get(axisId),
        order: (axisOrderById.get(axisId) ?? 0) + 1,
        entries: list.map((entry, index) => ({
          entry,
          index: before + index + 1,
        })),
        taskCount: list.reduce((sum, entry) => sum + entry.tasks.length, 0),
      };
    });
  }, [entries, axisById, axisOrderById]);

  const taskCount = entries.reduce((sum, entry) => sum + entry.tasks.length, 0);

  /** Bấm nội dung đã chọn rồi = thêm một việc nữa cho nội dung đó. */
  const pickContent = (axisId: string, workContentId: string) => {
    const existing = entries.find(
      (entry) => entry.workContentId === workContentId,
    );
    if (existing) {
      addTask(existing.key);
      setFocusKey(existing.key);
      return;
    }
    const entry = createContentEntry(axisId, workContentId);
    setEntries((prev) => [...prev, entry]);
    setFocusKey(entry.key);
  };

  const removeEntry = (entryKey: string) => {
    setEntries((prev) => prev.filter((entry) => entry.key !== entryKey));
  };

  const addTask = (entryKey: string) => {
    setEntries((prev) =>
      prev.map((entry) =>
        entry.key === entryKey
          ? { ...entry, tasks: [...entry.tasks, createEmptyTask()] }
          : entry,
      ),
    );
  };

  const removeTask = (entryKey: string, taskKey: string) => {
    setEntries((prev) =>
      prev.map((entry) => {
        if (entry.key !== entryKey || entry.tasks.length <= 1) return entry;
        return {
          ...entry,
          tasks: entry.tasks.filter((task) => task.key !== taskKey),
        };
      }),
    );
  };

  const updateTask = (
    entryKey: string,
    taskKey: string,
    patch: Partial<PersonalTaskDraft>,
  ) => {
    setEntries((prev) =>
      prev.map((entry) =>
        entry.key === entryKey
          ? {
            ...entry,
            tasks: entry.tasks.map((task) =>
              task.key === taskKey ? { ...task, ...patch } : task,
            ),
          }
          : entry,
      ),
    );
  };

  const submit = async () => {
    if (entries.length === 0) {
      toast.error("Chọn ít nhất một nội dung công tác ở cột bên trái.");
      return;
    }

    const payloads: ReturnType<typeof taskToWriteInput>[] = [];

    for (const entry of entries) {
      const axis = axisById.get(entry.axisId);
      const content = contentById.get(entry.workContentId);
      if (!axis || !content) {
        toast.error("Nội dung công việc không hợp lệ.");
        return;
      }

      const template = templates.byAxis.get(entry.axisId);
      if (!template) {
        toast.error(
          `Trục "${axis.name}" chưa gán mẫu bảng nên không nhập được nhiệm vụ. Bỏ nội dung thuộc trục này hoặc liên hệ quản trị.`,
        );
        return;
      }

      // Dòng chưa gõ gì là dòng thừa - bỏ đi thay vì bắt lỗi thiếu cột.
      const tasks = entry.tasks.filter((task) => !isEmptyTask(task));
      if (tasks.length === 0) {
        toast.error(
          `"${content.name}" chưa nhập việc nào. Nhập nội dung hoặc bỏ nội dung này khỏi phiếu.`,
        );
        return;
      }

      const scoreGroupId = workContentScoreGroupId(content);

      for (const task of tasks) {
        const missing = missingRequiredColumns(task, template.columns);
        if (missing.length > 0) {
          toast.error(`"${content.name}": còn thiếu ${missing.join(", ")}.`);
          return;
        }

        const problems = outOfRangeColumns(
          task,
          template.columns,
          scoreGroupById,
          scoreGroupId,
        );
        if (problems.length > 0) {
          toast.error(`"${content.name}": ${problems.join("; ")}.`);
          return;
        }

        payloads.push(
          taskToWriteInput(entry.axisId, entry.workContentId, task),
        );
      }
    }

    setSaving(true);
    try {
      if (edit) {
        await updatePersonalKpi(edit.id, payloads[0]!);
        toast.success("Đã lưu nháp.");
      } else {
        await createPersonalKpiBatch(payloads, reportDate);
        toast.success(
          payloads.length > 1
            ? `Đã lưu ${payloads.length} nhiệm vụ nháp.`
            : "Đã lưu nháp.",
        );
      }
      await onSaved();
      onOpenChange(false);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không lưu được nháp."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (saving) return;
        onOpenChange(next);
      }}
    >
      <SheetContent
        side="right"
        className="flex w-[96vw] max-w-[96vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-[96vw]"
      >
        <SheetHeader className="border-b px-5 py-4 pr-12 text-left">
          <SheetTitle>
            {isEdit
              ? "Sửa nhiệm vụ"
              : `Nhập nhiệm vụ mới${reportDate ? ` · ${formatDayLabel(reportDate)}` : ""}`}
          </SheetTitle>
          <SheetDescription>
            {isEdit
              ? "Các ô nhập lấy theo mẫu KPI của trục chứa nội dung công việc này."
              : "Chọn nội dung công tác ở cột trái, mỗi nội dung hiện một thẻ nhập bên phải. Ô nhập dựng theo mẫu KPI của từng trục."}
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 overflow-hidden">
          {!isEdit ? (
            <aside className="flex w-[290px] shrink-0 flex-col border-r bg-muted/20 xl:w-[340px]">
              <div className="space-y-2 border-b px-3 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Thư viện nội dung công tác
                </p>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="bg-background pl-8 placeholder:text-muted-foreground/70"
                    placeholder="Tìm nội dung..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>

              <div className="min-h-0 flex-1 space-y-4 overflow-auto px-3 py-3">
                {loading ? (
                  <p className="px-1 text-sm text-muted-foreground">
                    Đang tải danh mục...
                  </p>
                ) : libraryGroups.length === 0 ? (
                  <p className="px-1 text-sm text-muted-foreground">
                    {search.trim()
                      ? "Không có nội dung nào khớp từ khoá."
                      : "Chưa có nội dung công việc nào được cấu hình."}
                  </p>
                ) : (
                  libraryGroups.map((group) => (
                    <div key={group.axisId} className="space-y-1.5">
                      <p className="px-1 text-xs font-semibold text-muted-foreground">
                        Trục {group.order} · {group.axis.name}
                        {!group.hasTemplate ? (
                          <span className="ml-1 font-normal text-amber-600 dark:text-amber-500">
                            (chưa gán mẫu bảng)
                          </span>
                        ) : null}
                      </p>

                      {group.contents.map((content) => {
                        const contentId = entityId(content);
                        const count = taskCountByContent.get(contentId) ?? 0;
                        return (
                          <button
                            key={contentId}
                            type="button"
                            onClick={() => pickContent(group.axisId, contentId)}
                            disabled={saving || !group.hasTemplate}
                            title={
                              group.hasTemplate
                                ? "Thêm vào phiếu nhập"
                                : "Trục chưa gán mẫu bảng nên chưa nhập được"
                            }
                            className={cn(
                              "flex w-full items-center gap-2 rounded-lg border bg-card px-2.5 py-2 text-left transition-colors",
                              "hover:border-primary/40 hover:bg-primary/5",
                              "disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:border-border disabled:hover:bg-card",
                              count > 0 && "border-primary/50 bg-primary/5",
                            )}
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm">
                                {content.name}
                              </span>
                              {content.description ? (
                                <span className="block truncate text-xs text-muted-foreground">
                                  {content.description}
                                </span>
                              ) : null}
                            </span>
                            {count > 0 ? (
                              <Badge
                                variant="secondary"
                                className="shrink-0 border-transparent bg-primary/10 px-1.5 text-xs text-primary tabular-nums"
                              >
                                {count}
                              </Badge>
                            ) : null}
                            <Plus className="size-4 shrink-0 text-muted-foreground" />
                          </button>
                        );
                      })}
                    </div>
                  ))
                )}
              </div>
            </aside>
          ) : null}

          <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
            {entries.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-muted/10 p-10 text-center">
                <ClipboardList
                  className="size-9 text-muted-foreground/45"
                  strokeWidth={1.5}
                />
                <p className="text-sm font-medium">Chưa chọn nội dung nào</p>
                <p className="max-w-sm text-sm text-muted-foreground">
                  Bấm một nội dung công tác ở cột bên trái để mở thẻ nhập. Bấm
                  lại nội dung đó để thêm việc thứ hai.
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                {axisGroups.map((group) => (
                  <div key={group.axisId} className="space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <Badge
                          variant="secondary"
                          className="border-transparent bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                        >
                          Trục {group.order}
                        </Badge>
                        <span className="truncate text-sm font-semibold">
                          {group.axis?.name ?? "Trục không còn tồn tại"}
                        </span>
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                        {group.entries.length} nội dung · {group.taskCount} việc
                      </span>
                    </div>

                    {group.entries.map(({ entry, index }) => {
                      const content = contentById.get(entry.workContentId);
                      const template = templates.byAxis.get(entry.axisId);
                      return (
                        <TaskEntryCard
                          key={entry.key}
                          id={`kpi-entry-${entry.key}`}
                          entry={entry}
                          index={index}
                          contentName={content?.name ?? "Nội dung không còn tồn tại"}
                          contentDescription={content?.description}
                          columns={template?.columns ?? []}
                          hasTemplate={!!template}
                          scoreGroupId={
                            content ? workContentScoreGroupId(content) : ""
                          }
                          disabled={saving}
                          fixedTasks={isEdit}
                          onAddTask={() => addTask(entry.key)}
                          onRemoveTask={(taskKey) =>
                            removeTask(entry.key, taskKey)
                          }
                          onTaskChange={(taskKey, patch) =>
                            updateTask(entry.key, taskKey, patch)
                          }
                          onRemove={() => removeEntry(entry.key)}
                        />
                      );
                    })}
                  </div>
                ))}

                {!isEdit ? (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Inbox className="size-3.5" />
                    Lưu nháp xong mới gửi lên cấp trên từ danh sách nhiệm vụ.
                  </p>
                ) : null}
              </div>
            )}
          </div>
        </div>

        <SheetFooter className="flex-col gap-3 border-t px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline" className="font-normal">
              {axisGroups.length} trục
            </Badge>
            <Badge variant="outline" className="font-normal">
              {entries.length} nội dung
            </Badge>
            <Badge variant="outline" className="font-normal">
              {taskCount} việc
            </Badge>
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              className="bg-background"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Hủy
            </Button>
            <Button
              type="button"
              onClick={() => void submit()}
              disabled={saving || loading || entries.length === 0}
            >
              <Check className="h-4 w-4" />
              {saving ? "Đang lưu..." : "Lưu nháp"}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
