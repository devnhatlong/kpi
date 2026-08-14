"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  ClipboardList,
  FolderTree,
  Inbox,
  Info,
  Plus,
  Trash2,
} from "lucide-react";
import useSWR from "swr";
import { toast } from "sonner";

import { SearchableSelect } from "@/components/common/searchable-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { TableCell, TableRow } from "@/components/ui/table";
import {
  fetchAxesAll,
  fetchFormTemplatesAll,
  fetchWorkContentsAll,
} from "@/features/kpi-form-config/api";
import type { Axis, WorkContent } from "@/features/kpi-form-config/types";
import { entityId } from "@/features/kpi-form-config/types";
import {
  createPersonalKpiBatch,
  taskToWriteInput,
  updatePersonalKpi,
} from "@/features/personal-kpi/api";
import { AxisTaskTable } from "@/features/personal-kpi/components/axis-task-table";
import { PersonalTaskForm } from "@/features/personal-kpi/components/personal-task-form";
import {
  createEmptyAxisBlock,
  createEmptyContentBlock,
  createEmptyTask,
  type DraftAxisBlock,
  type PersonalKpiItem,
  type PersonalTaskDraft,
} from "@/features/personal-kpi/types";
import { getApiErrorMessage } from "@/lib/api-client";
import { cn } from "@/lib/utils";

function workContentAxisId(item: WorkContent): string {
  if (!item.axisId) return "";
  return typeof item.axisId === "string" ? item.axisId : item.axisId._id;
}

/** Nhóm điểm gán cho nội dung công việc - đổ xuống cột Nhóm điểm của mọi dòng. */
function workContentScoreGroupId(item: WorkContent): string {
  if (!item.scoreGroupId) return "";
  return typeof item.scoreGroupId === "string"
    ? item.scoreGroupId
    : item.scoreGroupId._id;
}

function catalogOptionLabel(item: { name: string; description?: string }) {
  const name = item.name.trim();
  const description = item.description?.trim();
  if (!description || description === name) return name;
  return `${name} (${description})`;
}

function contentsForAxisId(workContents: WorkContent[], axisId: string) {
  if (!axisId) return [];
  return workContents
    .filter((item) => workContentAxisId(item) === axisId)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

type ContentTaskTableProps = {
  axisId: string;
  tasks: PersonalTaskDraft[];
  stt: number;
  axisLabel: string;
  contentLabel: string;
  /** Nhóm điểm của nội dung công việc - cán bộ không tự chọn nữa. */
  scoreGroupId: string;
  isEdit: boolean;
  saving: boolean;
  onTaskChange: (taskKey: string, patch: Partial<PersonalTaskDraft>) => void;
  onTaskRemove: (taskKey: string) => void;
  onAddTask: () => void;
};

/**
 * Bảng nhiệm vụ của một nội dung công việc.
 * Header lấy theo mẫu bảng gán cho trục đang chọn; trục chưa gán thì dùng
 * bảng mặc định.
 */
function ContentTaskTable({
  axisId,
  tasks,
  stt,
  axisLabel,
  contentLabel,
  scoreGroupId,
  isEdit,
  saving,
  onTaskChange,
  onTaskRemove,
  onAddTask,
}: ContentTaskTableProps) {
  return (
    <AxisTaskTable
      axisId={axisId}
      caption={`${axisLabel} - ${contentLabel}`}
      footer={(totalCols) =>
        !isEdit ? (
          <TableRow className="hover:bg-transparent">
            <TableCell colSpan={totalCols} className="py-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="bg-background"
                onClick={onAddTask}
                disabled={saving}
              >
                <Plus className="h-4 w-4" />
                Thêm nhiệm vụ
              </Button>
            </TableCell>
          </TableRow>
        ) : null
      }
    >
      {(columns) =>
        tasks.map((task, taskIndex) => (
          <PersonalTaskForm
            key={task.key}
            index={stt}
            taskNumber={taskIndex + 1}
            task={task}
            columns={columns}
            canRemove={!isEdit && tasks.length > 1}
            showWorkContentCell={taskIndex === 0}
            showSttCell={taskIndex === 0}
            workContentLabel={contentLabel}
            workContentRowSpan={tasks.length}
            autoScoreGroupId={scoreGroupId}
            onChange={(patch) => onTaskChange(task.key, patch)}
            onRemove={() => onTaskRemove(task.key)}
          />
        ))
      }
    </AxisTaskTable>
  );
}

type WizardStep = "axes" | "contents";

type PersonalTaskDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Sửa 1 nhiệm vụ đã có trên danh sách */
  edit?: PersonalKpiItem | null;
  /** Ngày báo cáo YYYY-MM-DD (mặc định hôm nay theo server) */
  reportDate?: string;
  onSaved: () => void | Promise<void>;
};

export function PersonalTaskDrawer({
  open,
  onOpenChange,
  edit,
  reportDate,
  onSaved,
}: PersonalTaskDrawerProps) {
  const { data: axes = [], isLoading: loadingAxes, error: axesError } = useSWR(
    open ? ["axes", "all", "personal-task-drawer"] : null,
    fetchAxesAll,
  );
  const {
    data: workContents = [],
    isLoading: loadingContents,
    error: contentsError,
  } = useSWR(
    open ? ["work-contents", "all", "personal-task-drawer"] : null,
    fetchWorkContentsAll,
  );
  const { data: formTemplates = [] } = useSWR(
    open ? ["form-templates", "all", "personal-task-drawer"] : null,
    fetchFormTemplatesAll,
  );

  /** Trục không nằm trong Set này thì chưa có bảng để nhập. */
  const axesWithTemplate = useMemo(() => {
    const ids = new Set<string>();
    for (const template of formTemplates) {
      for (const axis of template.axisIds ?? []) ids.add(entityId(axis));
    }
    return ids;
  }, [formTemplates]);

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

  const [blocks, setBlocks] = useState<DraftAxisBlock[]>([]);
  const [step, setStep] = useState<WizardStep>("axes");
  const [saving, setSaving] = useState(false);
  const [collapsedAxes, setCollapsedAxes] = useState<Set<string>>(
    () => new Set(),
  );
  const [collapsedContents, setCollapsedContents] = useState<Set<string>>(
    () => new Set(),
  );

  useEffect(() => {
    if (!open) return;
    setCollapsedAxes(new Set());
    setCollapsedContents(new Set());
    if (edit) {
      setStep("contents");
      setBlocks([
        {
          key: `axis-edit-${edit.id}`,
          axisId: edit.axisId,
          contents: [
            {
              key: `content-edit-${edit.id}`,
              workContentId: edit.workContentId,
              tasks: [{ ...edit.task }],
            },
          ],
        },
      ]);
      return;
    }
    setStep("axes");
    setBlocks([]);
  }, [open, edit]);

  const toggleAxisCollapsed = (axisKey: string) => {
    setCollapsedAxes((prev) => {
      const next = new Set(prev);
      if (next.has(axisKey)) next.delete(axisKey);
      else next.add(axisKey);
      return next;
    });
  };

  const toggleContentCollapsed = (contentKey: string) => {
    setCollapsedContents((prev) => {
      const next = new Set(prev);
      if (next.has(contentKey)) next.delete(contentKey);
      else next.add(contentKey);
      return next;
    });
  };

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

  const selectedAxisCount = blocks.filter((b) => b.axisId).length;
  const taskCount = blocks.reduce(
    (sum, block) =>
      sum +
      block.contents.reduce(
        (inner, content) => inner + content.tasks.length,
        0,
      ),
    0,
  );

  const addAxisBlock = () => {
    setBlocks((prev) => [...prev, createEmptyAxisBlock()]);
  };

  const removeAxisBlock = (axisKey: string) => {
    setBlocks((prev) => prev.filter((block) => block.key !== axisKey));
  };

  const setAxisId = (axisKey: string, axisId: string) => {
    setBlocks((prev) =>
      prev.map((block) =>
        block.key === axisKey
          ? {
            ...block,
            axisId,
            contents: block.contents.map((content) => ({
              ...content,
              workContentId: "",
            })),
          }
          : block,
      ),
    );
  };

  const addContentBlock = (axisKey: string) => {
    setBlocks((prev) =>
      prev.map((block) =>
        block.key === axisKey
          ? {
            ...block,
            contents: [...block.contents, createEmptyContentBlock()],
          }
          : block,
      ),
    );
  };

  const removeContentBlock = (axisKey: string, contentKey: string) => {
    setBlocks((prev) =>
      prev.map((block) => {
        if (block.key !== axisKey) return block;
        return {
          ...block,
          contents: block.contents.filter((c) => c.key !== contentKey),
        };
      }),
    );
  };

  const setWorkContentId = (
    axisKey: string,
    contentKey: string,
    workContentId: string,
  ) => {
    setBlocks((prev) =>
      prev.map((block) =>
        block.key === axisKey
          ? {
            ...block,
            contents: block.contents.map((content) =>
              content.key === contentKey
                ? { ...content, workContentId }
                : content,
            ),
          }
          : block,
      ),
    );
  };

  const addTask = (axisKey: string, contentKey: string) => {
    setBlocks((prev) =>
      prev.map((block) =>
        block.key === axisKey
          ? {
            ...block,
            contents: block.contents.map((content) =>
              content.key === contentKey
                ? {
                  ...content,
                  tasks: [
                    ...content.tasks,
                    createEmptyTask(content.tasks.length + 1),
                  ],
                }
                : content,
            ),
          }
          : block,
      ),
    );
  };

  const updateTask = (
    axisKey: string,
    contentKey: string,
    taskKey: string,
    patch: Partial<PersonalTaskDraft>,
  ) => {
    setBlocks((prev) =>
      prev.map((block) =>
        block.key === axisKey
          ? {
            ...block,
            contents: block.contents.map((content) =>
              content.key === contentKey
                ? {
                  ...content,
                  tasks: content.tasks.map((task) =>
                    task.key === taskKey ? { ...task, ...patch } : task,
                  ),
                }
                : content,
            ),
          }
          : block,
      ),
    );
  };

  const removeTask = (
    axisKey: string,
    contentKey: string,
    taskKey: string,
  ) => {
    setBlocks((prev) =>
      prev.map((block) =>
        block.key === axisKey
          ? {
            ...block,
            contents: block.contents.map((content) => {
              if (content.key !== contentKey) return content;
              if (content.tasks.length <= 1) return content;
              return {
                ...content,
                tasks: content.tasks.filter((task) => task.key !== taskKey),
              };
            }),
          }
          : block,
      ),
    );
  };

  const goToContentsStep = () => {
    if (blocks.length === 0) {
      toast.error("Thêm ít nhất một trục trước khi tiếp tục.");
      return;
    }
    const ids = blocks.map((b) => b.axisId);
    if (ids.some((id) => !id)) {
      toast.error("Vui lòng chọn trục cho mọi dòng đã thêm.");
      return;
    }
    if (new Set(ids).size !== ids.length) {
      toast.error("Mỗi trục chỉ được chọn một lần.");
      return;
    }
    setStep("contents");
  };

  const submit = async () => {
    if (blocks.length === 0) {
      toast.error("Chưa có trục nào. Thêm trục nếu cần lưu nhiệm vụ.");
      return;
    }

    const payloads: ReturnType<typeof taskToWriteInput>[] = [];

    for (const block of blocks) {
      if (!block.axisId) {
        toast.error("Vui lòng chọn trục cho mọi khối đã thêm.");
        return;
      }
      if (block.contents.length === 0) {
        toast.error(
          "Có trục chưa có nội dung. Thêm nội dung hoặc xoá trục đó.",
        );
        return;
      }
      const axis = axisById.get(block.axisId);
      if (!axis) {
        toast.error("Trục không hợp lệ.");
        return;
      }
      if (!axesWithTemplate.has(block.axisId)) {
        toast.error(
          `Trục "${axis.name}" chưa gán mẫu bảng nên không nhập được nhiệm vụ. Bỏ trục này hoặc liên hệ quản trị.`,
        );
        return;
      }

      for (const content of block.contents) {
        if (!content.workContentId) {
          toast.error("Vui lòng chọn nội dung công việc cho mọi khối.");
          return;
        }
        if (!contentById.get(content.workContentId)) {
          toast.error("Nội dung công việc không hợp lệ.");
          return;
        }

        for (const task of content.tasks) {
          payloads.push(
            taskToWriteInput(block.axisId, content.workContentId, task),
          );
        }
      }
    }

    if (payloads.length === 0) {
      toast.error("Chưa có nhiệm vụ nào để lưu.");
      return;
    }

    setSaving(true);
    try {
      if (edit) {
        await updatePersonalKpi(edit.id, payloads[0]);
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

  const loading = loadingAxes || loadingContents;
  const isEdit = !!edit;
  const showAxesStep = !isEdit && step === "axes";
  let contentStt = 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-[96vw] max-w-[96vw] flex-col gap-0 overflow-hidden sm:max-w-[96vw]"
      >
        <SheetHeader className="border-b pb-4 text-left">
          <SheetTitle>
            {isEdit ? "Sửa nháp báo cáo KPI" : "Tạo nháp báo cáo KPI"}
          </SheetTitle>
          <SheetDescription>
            Chỉ thêm đúng những trục / nội dung cần dùng. Lưu nháp xong mới gửi
            từ danh sách.
          </SheetDescription>
        </SheetHeader>

        {!isEdit ? (
          <div className="border-b px-1 py-4">
            <div className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3 sm:gap-4 sm:px-5">
              <button
                type="button"
                onClick={() => setStep("axes")}
                className="flex min-w-0 flex-1 items-start gap-3 text-left outline-none"
              >
                <span
                  className={cn(
                    "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold tabular-nums",
                    step === "axes" || step === "contents"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {step === "contents" ? (
                    <Check className="size-4" />
                  ) : (
                    1
                  )}
                </span>
                <span className="min-w-0">
                  <span
                    className={cn(
                      "flex items-center gap-1.5 text-sm font-semibold",
                      step === "axes" ? "text-primary" : "text-foreground",
                    )}
                  >
                    <FolderTree className="size-3.5 shrink-0 opacity-80" />
                    Chọn trục
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Nhóm lĩnh vực công tác ({selectedAxisCount})
                  </span>
                </span>
              </button>

              <div
                className={cn(
                  "hidden h-px min-w-8 flex-1 sm:block",
                  step === "contents" ? "bg-primary" : "bg-border",
                )}
                aria-hidden
              />

              <button
                type="button"
                onClick={() => {
                  if (step === "axes") goToContentsStep();
                }}
                className="flex min-w-0 flex-1 items-start gap-3 text-left outline-none"
              >
                <span
                  className={cn(
                    "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold tabular-nums",
                    step === "contents"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  2
                </span>
                <span className="min-w-0">
                  <span
                    className={cn(
                      "flex items-center gap-1.5 text-sm font-semibold",
                      step === "contents"
                        ? "text-primary"
                        : "text-muted-foreground",
                    )}
                  >
                    <ClipboardList className="size-3.5 shrink-0 opacity-80" />
                    Nội dung công việc
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Nhập nhiệm vụ chi tiết
                  </span>
                </span>
              </button>
            </div>
          </div>
        ) : null}

        <div className="flex-1 space-y-4 overflow-auto py-4">
          {showAxesStep ? (
            <div className="space-y-4 rounded-lg border bg-muted/20 p-4">
              <div className="flex items-start gap-2 rounded-md border border-primary/20 bg-primary/10 px-3 py-2.5 text-sm text-primary">
                <Info className="mt-0.5 size-4 shrink-0" />
                <p>
                  Chọn các trục công tác sẽ báo cáo. Mỗi trục chỉ chọn một lần.
                </p>
              </div>

              {blocks.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-card p-10 text-center">
                  <Inbox className="size-8 text-muted-foreground/50" strokeWidth={1.5} />
                  <p className="text-sm text-muted-foreground">
                    Chưa có trục nào. Thêm trục khi có nhiệm vụ thuộc trục đó.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    className="bg-background"
                    onClick={addAxisBlock}
                    disabled={saving || loading}
                  >
                    <Plus className="h-4 w-4" />
                    Thêm trục
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {blocks.map((block, index) => {
                    const usedByOthers = new Set(
                      blocks
                        .filter((b) => b.key !== block.key && b.axisId)
                        .map((b) => b.axisId),
                    );
                    return (
                      <div
                        key={block.key}
                        className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-3"
                      >
                        <span className="mb-1 flex size-8 shrink-0 items-center justify-center rounded-md bg-sky-50 text-sm font-semibold text-sky-700 dark:bg-sky-950/50 dark:text-sky-300">
                          {index + 1}
                        </span>
                        <div className="min-w-[240px] flex-1 space-y-2">
                          <Label>
                            Trục <span className="text-destructive">*</span>
                          </Label>
                          <SearchableSelect
                            value={block.axisId}
                            onValueChange={(value) =>
                              setAxisId(block.key, value)
                            }
                            disabled={loading || saving}
                            placeholder="Chọn trục"
                            searchPlaceholder="Tìm trục..."
                            emptyText="Không tìm thấy trục."
                            className="z-[100]"
                            options={axes
                              .filter(
                                (item) =>
                                  entityId(item) === block.axisId ||
                                  !usedByOthers.has(entityId(item)),
                              )
                              .map((item) => ({
                                value: entityId(item),
                                // Nói trước trục nào chưa có bảng để nhập.
                                label: axesWithTemplate.has(entityId(item))
                                  ? catalogOptionLabel(item)
                                  : `${catalogOptionLabel(item)} - chưa gán mẫu bảng`,
                                keywords: item.code,
                              }))}
                          />
                        </div>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={() => removeAxisBlock(block.key)}
                          disabled={saving}
                          aria-label="Xoá trục"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    );
                  })}

                  <Button
                    type="button"
                    variant="outline"
                    className="bg-background"
                    onClick={addAxisBlock}
                    disabled={saving || loading}
                  >
                    <Plus className="h-4 w-4" />
                    Thêm trục
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {blocks.map((block, axisIndex) => {
                const axis = axisById.get(block.axisId);
                const availableContents = contentsForAxisId(
                  workContents,
                  block.axisId,
                );
                const usedContentIds = new Set(
                  block.contents
                    .map((c) => c.workContentId)
                    .filter(Boolean),
                );
                const axisLabel = axis
                  ? catalogOptionLabel(axis)
                  : `Trục ${axisIndex + 1}`;

                return (
                  <Collapsible
                    key={block.key}
                    open={!collapsedAxes.has(block.key)}
                    onOpenChange={() => toggleAxisCollapsed(block.key)}
                    className="rounded-xl border bg-card shadow-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <CollapsibleTrigger asChild>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="size-8 shrink-0"
                            aria-label={
                              collapsedAxes.has(block.key)
                                ? "Mở trục"
                                : "Thu gọn trục"
                            }
                          >
                            <ChevronDown
                              className={cn(
                                "size-4 transition-transform",
                                collapsedAxes.has(block.key) && "-rotate-90",
                              )}
                            />
                          </Button>
                        </CollapsibleTrigger>
                        <Badge
                          variant="secondary"
                          className="max-w-full truncate border-transparent bg-primary/10 px-2.5 py-1 text-sm font-medium text-primary"
                        >
                          Trục {axisIndex + 1}: {axisLabel}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {block.contents.length} nội dung
                        </span>
                      </div>
                      {!isEdit ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="bg-background"
                          onClick={() => addContentBlock(block.key)}
                          disabled={saving || !block.axisId}
                        >
                          <Plus className="h-4 w-4" />
                          Thêm nội dung
                        </Button>
                      ) : null}
                    </div>

                    <CollapsibleContent className="space-y-3 border-t px-4 pb-4 pt-3">
                      {block.contents.length === 0 ? (
                        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/20 p-10 text-center">
                          <Inbox
                            className="size-8 text-muted-foreground/45"
                            strokeWidth={1.5}
                          />
                          <p className="text-sm text-muted-foreground">
                            Chưa có nội dung công việc nào cho trục này
                          </p>
                        </div>
                      ) : null}

                      {block.contents.map((content) => {
                        contentStt += 1;
                        const stt = contentStt;
                        const selectedContent = contentById.get(
                          content.workContentId,
                        );
                        const contentOptions = availableContents.filter(
                          (item) =>
                            entityId(item) === content.workContentId ||
                            !usedContentIds.has(entityId(item)),
                        );
                        const contentCollapsed = collapsedContents.has(
                          content.key,
                        );
                        const contentTitle = selectedContent
                          ? catalogOptionLabel(selectedContent)
                          : "Chưa chọn nội dung";

                        return (
                          <Collapsible
                            key={content.key}
                            open={!contentCollapsed}
                            onOpenChange={() =>
                              toggleContentCollapsed(content.key)
                            }
                            className="rounded-lg border bg-muted/15"
                          >
                            <div className="flex flex-wrap items-end gap-3 p-3">
                              <div className="flex min-w-0 flex-1 items-end gap-2">
                                <CollapsibleTrigger asChild>
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    className="mb-0.5 size-8 shrink-0"
                                    aria-label={
                                      contentCollapsed
                                        ? "Mở nội dung"
                                        : "Thu gọn nội dung"
                                    }
                                  >
                                    <ChevronDown
                                      className={cn(
                                        "size-4 transition-transform",
                                        contentCollapsed && "-rotate-90",
                                      )}
                                    />
                                  </Button>
                                </CollapsibleTrigger>
                                <div className="min-w-[240px] flex-1 space-y-2">
                                  <Label>
                                    Tiêu chí / nội dung công việc{" "}
                                    <span className="text-destructive">*</span>
                                  </Label>
                                  <SearchableSelect
                                    value={content.workContentId}
                                    onValueChange={(value) =>
                                      setWorkContentId(
                                        block.key,
                                        content.key,
                                        value,
                                      )
                                    }
                                    disabled={
                                      !block.axisId ||
                                      loading ||
                                      saving ||
                                      isEdit
                                    }
                                    placeholder={
                                      block.axisId
                                        ? "Chọn tiêu chí / nội dung công việc"
                                        : "Chọn trục trước"
                                    }
                                    searchPlaceholder="Tìm nội dung công việc..."
                                    emptyText="Không tìm thấy nội dung."
                                    className="z-[100]"
                                    options={contentOptions.map((item) => ({
                                      value: entityId(item),
                                      label: catalogOptionLabel(item),
                                      keywords: item.code,
                                    }))}
                                  />
                                  {block.axisId &&
                                    availableContents.length === 0 ? (
                                    <p className="text-xs text-muted-foreground">
                                      Trục này chưa có nội dung công việc nào.
                                    </p>
                                  ) : null}
                                </div>
                              </div>
                              {!isEdit ? (
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  onClick={() =>
                                    removeContentBlock(block.key, content.key)
                                  }
                                  disabled={saving}
                                  aria-label="Xoá nội dung"
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              ) : null}
                            </div>

                            {contentCollapsed ? (
                              <p className="border-t px-3 py-2 text-xs text-muted-foreground">
                                Đã thu gọn · {contentTitle} ·{" "}
                                {content.tasks.length} nhiệm vụ
                              </p>
                            ) : null}

                            <CollapsibleContent className="space-y-3 border-t px-3 pb-3 pt-3">
                              {selectedContent ? (
                                <ContentTaskTable
                                  axisId={block.axisId}
                                  tasks={content.tasks}
                                  stt={stt}
                                  axisLabel={
                                    axis ? catalogOptionLabel(axis) : "Trục"
                                  }
                                  contentLabel={catalogOptionLabel(
                                    selectedContent,
                                  )}
                                  scoreGroupId={workContentScoreGroupId(
                                    selectedContent,
                                  )}
                                  isEdit={isEdit}
                                  saving={saving}
                                  onTaskChange={(taskKey, patch) =>
                                    updateTask(
                                      block.key,
                                      content.key,
                                      taskKey,
                                      patch,
                                    )
                                  }
                                  onTaskRemove={(taskKey) =>
                                    removeTask(block.key, content.key, taskKey)
                                  }
                                  onAddTask={() =>
                                    addTask(block.key, content.key)
                                  }
                                />
                              ) : (
                                <div className="rounded-md border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
                                  Chọn nội dung công việc để hiện bảng nhiệm vụ.
                                </div>
                              )}
                            </CollapsibleContent>
                          </Collapsible>
                        );
                      })}
                    </CollapsibleContent>
                  </Collapsible>
                );
              })}
            </div>
          )}
        </div>

        <SheetFooter className="flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline" className="font-normal">
              {selectedAxisCount} trục
            </Badge>
            <Badge variant="outline" className="font-normal">
              {taskCount} nhiệm vụ
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

            {showAxesStep ? (
              <Button
                type="button"
                onClick={goToContentsStep}
                disabled={saving || loading}
              >
                Tiếp tục
              </Button>
            ) : (
              <>
                {!isEdit ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="bg-background"
                    onClick={() => setStep("axes")}
                    disabled={saving}
                  >
                    Quay lại
                  </Button>
                ) : null}
                <Button
                  type="button"
                  onClick={() => void submit()}
                  disabled={saving || loading}
                >
                  <Check className="h-4 w-4" />
                  {saving ? "Đang lưu..." : "Lưu nháp"}
                </Button>
              </>
            )}
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
