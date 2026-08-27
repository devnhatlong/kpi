"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  Copy,
  FolderTree,
  Inbox,
  Info,
  Plus,
  Table2,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  fetchScoreGroupsAll,
  fetchWorkContentsAll,
} from "@/features/mission-form-config/api";
import { NoReportTemplateNotice } from "@/features/mission-form-config/components/no-report-template-notice";
import { useScopedAxes } from "@/features/mission-form-config/use-scoped-axes";
import { formatScoreGroupRange } from "@/features/mission-form-config/score-group.constants";
import { entityId } from "@/features/mission-form-config/types";
import type { WorkContent } from "@/features/mission-form-config/types";
import {
  assignmentKeys,
  createAssignments,
  fetchAssignmentTargets,
} from "@/features/mission-assignment/api";
import { TargetTreeSelect } from "@/features/mission-assignment/components/target-tree-select";
import {
  PASTE_COLUMNS,
  parsePastedRows,
  type PastedRow,
} from "@/features/mission-assignment/excel-paste";
import {
  countSelectedTargets,
  emptyTargetSelection,
  type AssignmentTargetSelection,
  type CreateAssignmentItem,
} from "@/features/mission-assignment/types";
import { getApiErrorMessage } from "@/lib/api-client";
import { cn } from "@/lib/utils";

type AssignTaskDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
};

type TaskRow = {
  key: string;
  title: string;
  product: string;
  scoreGroupId: string;
  deadline: string;
  targets: AssignmentTargetSelection;
};

type ContentBlock = {
  key: string;
  workContentId: string;
  tasks: TaskRow[];
};

type AxisBlock = {
  key: string;
  axisId: string;
  contents: ContentBlock[];
};

function localKey(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function emptyTask(): TaskRow {
  return {
    key: localKey("task"),
    title: "",
    product: "",
    scoreGroupId: "",
    deadline: "",
    targets: emptyTargetSelection(),
  };
}

function emptyContent(): ContentBlock {
  return { key: localKey("content"), workContentId: "", tasks: [emptyTask()] };
}

function emptyAxis(): AxisBlock {
  return { key: localKey("axis"), axisId: "", contents: [] };
}

function contentAxisId(item: WorkContent): string {
  if (!item.axisId) return "";
  return typeof item.axisId === "string" ? item.axisId : item.axisId._id;
}

function catalogLabel(item: { name: string; description?: string }) {
  const name = item.name.trim();
  const description = item.description?.trim();
  if (!description || description === name) return name;
  return `${name} (${description})`;
}

/** Gom các dòng dán từ Excel vào đúng khối trục / nội dung đang có. */
function mergePastedRows(blocks: AxisBlock[], rows: PastedRow[]): AxisBlock[] {
  const next = blocks.map((axis) => ({
    ...axis,
    contents: axis.contents.map((content) => ({
      ...content,
      tasks: [...content.tasks],
    })),
  }));

  for (const row of rows) {
    let axis = next.find((item) => item.axisId === row.axisId);
    if (!axis) {
      axis = { ...emptyAxis(), axisId: row.axisId };
      next.push(axis);
    }

    let content = axis.contents.find(
      (item) => item.workContentId === row.workContentId,
    );
    if (!content) {
      content = {
        key: localKey("content"),
        workContentId: row.workContentId,
        tasks: [],
      };
      axis.contents.push(content);
    }

    content.tasks.push({
      ...emptyTask(),
      title: row.title,
      product: row.product,
      scoreGroupId: row.scoreGroupId,
      deadline: row.deadline,
    });
  }

  // Bỏ các khối trống còn sót lại từ trước khi dán.
  return next.filter((axis) => axis.axisId || axis.contents.length);
}

export function AssignTaskDrawer({
  open,
  onOpenChange,
  onSaved,
}: AssignTaskDrawerProps) {
  const [blocks, setBlocks] = useState<AxisBlock[]>([]);
  const [collapsedAxes, setCollapsedAxes] = useState<Set<string>>(new Set());
  const [bulkTargets, setBulkTargets] = useState(emptyTargetSelection());
  const [bulkDeadline, setBulkDeadline] = useState("");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [saving, setSaving] = useState(false);

  /*
    Trục lấy theo mẫu báo cáo của ĐƠN VỊ NGƯỜI GIAO, không phải mọi trục.
    Đơn vị nhận nằm dưới đơn vị giao trong cây, mà mẫu mặc định cho cấp dưới
    thừa kế của cấp trên, nên hai bên gần như luôn cùng một mẫu. Chọn theo người
    giao vì một lần giao có thể nhắm nhiều đơn vị nhận cùng lúc - lấy theo bên
    nhận thì không có "một" danh sách trục để dựng form.
  */
  const {
    axes,
    hasTemplate: canAssign,
    isLoading: loadingScope,
  } = useScopedAxes({ enabled: open });
  const { data: workContents = [] } = useSWR(
    open ? ["work-contents", "assign"] : null,
    fetchWorkContentsAll,
  );
  const { data: scoreGroups = [] } = useSWR(
    open ? ["score-groups", "assign"] : null,
    fetchScoreGroupsAll,
  );
  const { data: targets } = useSWR(
    open ? assignmentKeys.targets() : null,
    fetchAssignmentTargets,
  );

  useEffect(() => {
    if (open) return;
    setBlocks([]);
    setCollapsedAxes(new Set());
    setBulkTargets(emptyTargetSelection());
    setBulkDeadline("");
    setPasteText("");
  }, [open]);

  const contentById = useMemo(
    () => new Map(workContents.map((item) => [entityId(item), item])),
    [workContents],
  );

  const scoreGroupOptions = useMemo(
    () =>
      scoreGroups.map((item) => ({
        value: entityId(item),
        label: `${item.name} (${formatScoreGroupRange(
          item.minScore,
          item.maxScore,
          item.maxInclusive,
        )})`,
        keywords: item.code,
      })),
    [scoreGroups],
  );

  const toggleAxisCollapsed = (key: string) => {
    setCollapsedAxes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // ------------------------------------------------------------- thao tác khối

  const patchAxis = (axisKey: string, patch: Partial<AxisBlock>) => {
    setBlocks((prev) =>
      prev.map((axis) => (axis.key === axisKey ? { ...axis, ...patch } : axis)),
    );
  };

  const setAxisId = (axisKey: string, axisId: string) => {
    // Đổi trục thì nội dung cũ không còn thuộc trục này nữa.
    patchAxis(axisKey, { axisId, contents: [emptyContent()] });
  };

  const patchContent = (
    axisKey: string,
    contentKey: string,
    patch: Partial<ContentBlock>,
  ) => {
    setBlocks((prev) =>
      prev.map((axis) =>
        axis.key !== axisKey
          ? axis
          : {
              ...axis,
              contents: axis.contents.map((content) =>
                content.key === contentKey ? { ...content, ...patch } : content,
              ),
            },
      ),
    );
  };

  const patchTask = (
    axisKey: string,
    contentKey: string,
    taskKey: string,
    patch: Partial<TaskRow>,
  ) => {
    setBlocks((prev) =>
      prev.map((axis) =>
        axis.key !== axisKey
          ? axis
          : {
              ...axis,
              contents: axis.contents.map((content) =>
                content.key !== contentKey
                  ? content
                  : {
                      ...content,
                      tasks: content.tasks.map((task) =>
                        task.key === taskKey ? { ...task, ...patch } : task,
                      ),
                    },
              ),
            },
      ),
    );
  };

  const addContent = (axisKey: string) => {
    setBlocks((prev) =>
      prev.map((axis) =>
        axis.key === axisKey
          ? { ...axis, contents: [...axis.contents, emptyContent()] }
          : axis,
      ),
    );
  };

  const removeContent = (axisKey: string, contentKey: string) => {
    setBlocks((prev) =>
      prev.map((axis) =>
        axis.key === axisKey
          ? {
              ...axis,
              contents: axis.contents.filter(
                (content) => content.key !== contentKey,
              ),
            }
          : axis,
      ),
    );
  };

  const addTask = (axisKey: string, contentKey: string) => {
    setBlocks((prev) =>
      prev.map((axis) =>
        axis.key !== axisKey
          ? axis
          : {
              ...axis,
              contents: axis.contents.map((content) =>
                content.key === contentKey
                  ? { ...content, tasks: [...content.tasks, emptyTask()] }
                  : content,
              ),
            },
      ),
    );
  };

  const duplicateTask = (
    axisKey: string,
    contentKey: string,
    taskKey: string,
  ) => {
    setBlocks((prev) =>
      prev.map((axis) =>
        axis.key !== axisKey
          ? axis
          : {
              ...axis,
              contents: axis.contents.map((content) => {
                if (content.key !== contentKey) return content;
                const index = content.tasks.findIndex(
                  (task) => task.key === taskKey,
                );
                if (index < 0) return content;
                const source = content.tasks[index]!;
                const tasks = [...content.tasks];
                tasks.splice(index + 1, 0, {
                  ...source,
                  key: localKey("task"),
                  targets: { ...source.targets },
                });
                return { ...content, tasks };
              }),
            },
      ),
    );
  };

  const removeTask = (axisKey: string, contentKey: string, taskKey: string) => {
    setBlocks((prev) =>
      prev.map((axis) =>
        axis.key !== axisKey
          ? axis
          : {
              ...axis,
              contents: axis.contents.map((content) =>
                content.key !== contentKey || content.tasks.length === 1
                  ? content
                  : {
                      ...content,
                      tasks: content.tasks.filter(
                        (task) => task.key !== taskKey,
                      ),
                    },
              ),
            },
      ),
    );
  };

  // --------------------------------------------------------------- áp nhanh

  const applyToAll = () => {
    const hasTargets = countSelectedTargets(bulkTargets) > 0;
    if (!hasTargets && !bulkDeadline) {
      toast.error("Chọn nơi nhận hoặc thời hạn để áp cho mọi nhiệm vụ.");
      return;
    }
    let count = 0;
    setBlocks((prev) =>
      prev.map((axis) => ({
        ...axis,
        contents: axis.contents.map((content) => ({
          ...content,
          tasks: content.tasks.map((task) => {
            count += 1;
            return {
              ...task,
              ...(hasTargets ? { targets: { ...bulkTargets } } : {}),
              ...(bulkDeadline ? { deadline: bulkDeadline } : {}),
            };
          }),
        })),
      })),
    );
    toast.success(`Đã áp cho ${count} nhiệm vụ.`);
  };

  const applyPaste = () => {
    const result = parsePastedRows(pasteText, {
      axes,
      workContents,
      scoreGroups,
    });
    if (result.errors.length) {
      toast.error(result.errors.slice(0, 3).join(" "));
      if (!result.rows.length) return;
    }
    setBlocks((prev) => mergePastedRows(prev, result.rows));
    toast.success(`Đã thêm ${result.rows.length} nhiệm vụ từ Excel.`);
    setPasteOpen(false);
    setPasteText("");
  };

  // ------------------------------------------------------------------- lưu

  const taskCount = blocks.reduce(
    (sum, axis) =>
      sum + axis.contents.reduce((inner, c) => inner + c.tasks.length, 0),
    0,
  );
  const recordCount = blocks.reduce(
    (sum, axis) =>
      sum +
      axis.contents.reduce(
        (inner, content) =>
          inner +
          content.tasks.reduce(
            (acc, task) => acc + countSelectedTargets(task.targets),
            0,
          ),
        0,
      ),
    0,
  );

  const submit = async () => {
    const items: CreateAssignmentItem[] = [];

    for (const [axisIndex, axis] of blocks.entries()) {
      const axisAt = `Trục ${axisIndex + 1}`;
      if (!axis.axisId) {
        return toast.error(`${axisAt}: chưa chọn trục.`);
      }
      if (!axis.contents.length) {
        return toast.error(`${axisAt}: chưa có nội dung công việc nào.`);
      }

      for (const content of axis.contents) {
        if (!content.workContentId) {
          return toast.error(`${axisAt}: còn nội dung chưa chọn.`);
        }
        const contentName = catalogLabel(
          contentById.get(content.workContentId) ?? { name: "Nội dung" },
        );

        for (const [taskIndex, task] of content.tasks.entries()) {
          const at = `${axisAt} · ${contentName} · nhiệm vụ ${taskIndex + 1}`;
          if (!task.title.trim()) {
            return toast.error(`${at}: chưa nhập tên nhiệm vụ.`);
          }
          if (!task.scoreGroupId) {
            return toast.error(`${at}: chưa chọn nhóm điểm.`);
          }
          if (countSelectedTargets(task.targets) === 0) {
            return toast.error(`${at}: chưa chọn nơi nhận.`);
          }
          items.push({
            axisId: axis.axisId,
            workContentId: content.workContentId,
            title: task.title.trim(),
            product: task.product.trim() || undefined,
            scoreGroupId: task.scoreGroupId,
            deadline: task.deadline || undefined,
            targets: task.targets,
          });
        }
      }
    }

    if (!items.length) {
      toast.error("Chưa nhập nhiệm vụ nào.");
      return;
    }

    setSaving(true);
    try {
      const result = await createAssignments({ items });
      toast.success(
        `Đã giao ${result.taskCount} nhiệm vụ, tạo ${result.count} bản ghi.`,
      );
      onOpenChange(false);
      onSaved();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không giao được nhiệm vụ."));
    } finally {
      setSaving(false);
    }
  };

  const usedAxisIds = new Set(
    blocks.map((axis) => axis.axisId).filter(Boolean),
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-[96vw] max-w-[96vw] flex-col gap-0 overflow-hidden sm:max-w-[96vw]"
      >
        <SheetHeader className="border-b pb-4 text-left">
          <SheetTitle>Giao nhiệm vụ xuống</SheetTitle>
          <SheetDescription>
            Một trục thêm được nhiều nội dung công việc, một nội dung thêm được
            nhiều nhiệm vụ. Mỗi nơi nhận trên một nhiệm vụ là một bản ghi riêng.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-auto px-1 py-4">
          {/*
            Không có mẫu áp dụng thì không có trục nào để dựng khối - khoá hẳn
            thay vì bày ra form rỗng rồi báo lỗi lúc lưu.
          */}
          {!loadingScope && !canAssign ? (
            <NoReportTemplateNotice action="giao nhiệm vụ" />
          ) : (
            <>
              <p className="flex items-start gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                <Info className="mt-0.5 size-4 shrink-0 text-primary" />
                Dán từ Excel sẽ tự gom nhiệm vụ vào đúng trục và nội dung tương
                ứng.
              </p>

              <div className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
                <span className="text-sm text-muted-foreground">
                  Áp nhanh cho mọi nhiệm vụ:
                </span>
                <div className="w-[240px]">
                  <TargetTreeSelect
                    value={bulkTargets}
                    onChange={setBulkTargets}
                    targets={targets}
                  />
                </div>
                <Input
                  type="date"
                  className="h-8 w-[160px]"
                  value={bulkDeadline}
                  onChange={(e) => setBulkDeadline(e.target.value)}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="bg-background"
                  onClick={applyToAll}
                >
                  Áp dụng
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="bg-background"
                  onClick={() => setPasteOpen(true)}
                >
                  <Table2 className="size-4" />
                  Dán từ Excel
                </Button>
                {targets?.scope ? (
                  <span className="ml-auto text-xs text-muted-foreground">
                    Phạm vi giao của bạn:{" "}
                    <span className="font-medium text-foreground">
                      {targets.scope.departmentName}
                    </span>
                  </span>
                ) : null}
              </div>

              {blocks.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-muted/20 p-12 text-center">
                  <FolderTree
                    className="size-9 text-muted-foreground/40"
                    strokeWidth={1.5}
                  />
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Chưa có trục nào</p>
                    <p className="text-sm text-muted-foreground">
                      Thêm trục rồi chọn nội dung công việc và nhập nhiệm vụ,
                      hoặc dán thẳng từ Excel.
                    </p>
                  </div>
                  <Button
                    type="button"
                    onClick={() => setBlocks([emptyAxis()])}
                  >
                    <Plus className="size-4" />
                    Thêm trục
                  </Button>
                </div>
              ) : null}

              <div className="space-y-4">
                {blocks.map((axis, axisIndex) => {
                  const collapsed = collapsedAxes.has(axis.key);
                  const usedContentIds = new Set(
                    axis.contents.map((c) => c.workContentId).filter(Boolean),
                  );

                  return (
                    <Collapsible
                      key={axis.key}
                      open={!collapsed}
                      onOpenChange={() => toggleAxisCollapsed(axis.key)}
                      className="rounded-xl border bg-card shadow-sm"
                    >
                      <div className="flex flex-wrap items-end justify-between gap-3 p-4">
                        <div className="flex min-w-0 flex-1 items-end gap-2">
                          <CollapsibleTrigger asChild>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="mb-0.5 size-8 shrink-0"
                              aria-label={
                                collapsed ? "Mở trục" : "Thu gọn trục"
                              }
                            >
                              <ChevronDown
                                className={cn(
                                  "size-4 transition-transform",
                                  collapsed && "-rotate-90",
                                )}
                              />
                            </Button>
                          </CollapsibleTrigger>
                          <div className="min-w-[260px] flex-1 space-y-2">
                            <Label className="flex items-center gap-1.5">
                              <FolderTree className="size-3.5 opacity-70" />
                              Trục {axisIndex + 1}{" "}
                              <span className="text-destructive">*</span>
                            </Label>
                            <SearchableSelect
                              value={axis.axisId}
                              onValueChange={(value) =>
                                setAxisId(axis.key, value)
                              }
                              placeholder="Chọn trục"
                              searchPlaceholder="Tìm trục..."
                              emptyText="Không tìm thấy trục."
                              className="z-[120]"
                              options={axes
                                .filter(
                                  (item) =>
                                    entityId(item) === axis.axisId ||
                                    !usedAxisIds.has(entityId(item)),
                                )
                                .map((item) => ({
                                  value: entityId(item),
                                  label: catalogLabel(item),
                                  keywords: item.code,
                                }))}
                            />
                          </div>
                          {axis.axisId ? (
                            <Badge
                              variant="outline"
                              className="mb-1.5 font-normal"
                            >
                              {axis.contents.length} nội dung
                            </Badge>
                          ) : null}
                        </div>

                        <div className="mb-0.5 flex gap-2">
                          {axis.axisId ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="bg-background"
                              onClick={() => addContent(axis.key)}
                            >
                              <Plus className="size-4" />
                              Thêm nội dung
                            </Button>
                          ) : null}
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            onClick={() =>
                              setBlocks((prev) =>
                                prev.filter((item) => item.key !== axis.key),
                              )
                            }
                            aria-label="Xoá trục"
                          >
                            <Trash2 className="size-4 text-destructive" />
                          </Button>
                        </div>
                      </div>

                      <CollapsibleContent
                        className={cn(
                          "space-y-3 px-4 pb-4",
                          // Chưa chọn trục thì không có gì để hiện - khỏi chừa chỗ trống.
                          (axis.axisId || axis.contents.length) &&
                            "border-t pt-3",
                        )}
                      >
                        {axis.axisId && axis.contents.length === 0 ? (
                          <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/20 p-8 text-center">
                            <Inbox
                              className="size-7 text-muted-foreground/45"
                              strokeWidth={1.5}
                            />
                            <p className="text-sm text-muted-foreground">
                              Chưa có nội dung công việc nào cho trục này
                            </p>
                          </div>
                        ) : null}

                        {axis.contents.map((content, contentIndex) => {
                          const contentOptions = workContents.filter(
                            (item) =>
                              contentAxisId(item) === axis.axisId &&
                              (entityId(item) === content.workContentId ||
                                !usedContentIds.has(entityId(item))),
                          );

                          return (
                            <div
                              key={content.key}
                              className="space-y-3 rounded-lg border bg-muted/15 p-3"
                            >
                              <div className="flex flex-wrap items-end gap-3">
                                <div className="min-w-[280px] flex-1 space-y-2">
                                  <Label>
                                    Nội dung {contentIndex + 1}{" "}
                                    <span className="text-destructive">*</span>
                                  </Label>
                                  <SearchableSelect
                                    value={content.workContentId}
                                    onValueChange={(value) =>
                                      patchContent(axis.key, content.key, {
                                        workContentId: value,
                                      })
                                    }
                                    disabled={!axis.axisId}
                                    placeholder={
                                      axis.axisId
                                        ? "Chọn nội dung công việc"
                                        : "Chọn trục trước"
                                    }
                                    searchPlaceholder="Tìm nội dung..."
                                    emptyText="Trục này chưa có nội dung."
                                    className="z-[120]"
                                    options={contentOptions.map((item) => ({
                                      value: entityId(item),
                                      label: catalogLabel(item),
                                      keywords: item.code,
                                    }))}
                                  />
                                </div>
                                <Badge
                                  variant="outline"
                                  className="mb-1.5 font-normal"
                                >
                                  {content.tasks.length} nhiệm vụ
                                </Badge>
                                {axis.contents.length > 1 ? (
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    className="mb-0.5"
                                    onClick={() =>
                                      removeContent(axis.key, content.key)
                                    }
                                    aria-label="Xoá nội dung"
                                  >
                                    <Trash2 className="size-4 text-destructive" />
                                  </Button>
                                ) : null}
                              </div>

                              <div className="overflow-x-auto rounded-md border bg-card">
                                <Table className="min-w-[1100px]">
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead className="w-12 text-center">
                                        STT
                                      </TableHead>
                                      <TableHead className="min-w-[240px]">
                                        Tên nhiệm vụ{" "}
                                        <span className="text-destructive">
                                          *
                                        </span>
                                      </TableHead>
                                      <TableHead className="min-w-[180px]">
                                        Sản phẩm dự kiến
                                      </TableHead>
                                      <TableHead className="min-w-[200px]">
                                        Nhóm điểm{" "}
                                        <span className="text-destructive">
                                          *
                                        </span>
                                      </TableHead>
                                      <TableHead className="min-w-[150px]">
                                        Thời hạn
                                      </TableHead>
                                      <TableHead className="min-w-[220px]">
                                        Nơi nhận{" "}
                                        <span className="text-destructive">
                                          *
                                        </span>
                                      </TableHead>
                                      <TableHead className="w-20" />
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {content.tasks.map((task, taskIndex) => (
                                      <TableRow key={task.key}>
                                        <TableCell className="text-center text-muted-foreground">
                                          {taskIndex + 1}
                                        </TableCell>
                                        <TableCell>
                                          <Input
                                            className="h-8"
                                            value={task.title}
                                            onChange={(e) =>
                                              patchTask(
                                                axis.key,
                                                content.key,
                                                task.key,
                                                { title: e.target.value },
                                              )
                                            }
                                            placeholder={`Nhiệm vụ ${taskIndex + 1}`}
                                          />
                                        </TableCell>
                                        <TableCell>
                                          <Input
                                            className="h-8"
                                            value={task.product}
                                            onChange={(e) =>
                                              patchTask(
                                                axis.key,
                                                content.key,
                                                task.key,
                                                { product: e.target.value },
                                              )
                                            }
                                            placeholder="Báo cáo, kế hoạch..."
                                          />
                                        </TableCell>
                                        <TableCell>
                                          <SearchableSelect
                                            value={task.scoreGroupId}
                                            onValueChange={(value) =>
                                              patchTask(
                                                axis.key,
                                                content.key,
                                                task.key,
                                                { scoreGroupId: value },
                                              )
                                            }
                                            placeholder="Chọn nhóm điểm"
                                            searchPlaceholder="Tìm nhóm điểm..."
                                            emptyText="Chưa có nhóm điểm."
                                            className="z-[120]"
                                            triggerClassName="h-8"
                                            options={scoreGroupOptions}
                                          />
                                        </TableCell>
                                        <TableCell>
                                          <Input
                                            type="date"
                                            className="h-8"
                                            value={task.deadline}
                                            onChange={(e) =>
                                              patchTask(
                                                axis.key,
                                                content.key,
                                                task.key,
                                                { deadline: e.target.value },
                                              )
                                            }
                                          />
                                        </TableCell>
                                        <TableCell>
                                          <TargetTreeSelect
                                            value={task.targets}
                                            onChange={(value) =>
                                              patchTask(
                                                axis.key,
                                                content.key,
                                                task.key,
                                                { targets: value },
                                              )
                                            }
                                            targets={targets}
                                          />
                                        </TableCell>
                                        <TableCell>
                                          <div className="flex items-center gap-0.5">
                                            <Button
                                              type="button"
                                              size="icon"
                                              variant="ghost"
                                              className="size-7"
                                              onClick={() =>
                                                duplicateTask(
                                                  axis.key,
                                                  content.key,
                                                  task.key,
                                                )
                                              }
                                              aria-label="Nhân bản nhiệm vụ"
                                            >
                                              <Copy className="size-3.5" />
                                            </Button>
                                            <Button
                                              type="button"
                                              size="icon"
                                              variant="ghost"
                                              className="size-7"
                                              onClick={() =>
                                                removeTask(
                                                  axis.key,
                                                  content.key,
                                                  task.key,
                                                )
                                              }
                                              disabled={
                                                content.tasks.length === 1
                                              }
                                              aria-label="Xoá nhiệm vụ"
                                            >
                                              <Trash2 className="size-3.5 text-destructive" />
                                            </Button>
                                          </div>
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                    <TableRow className="hover:bg-transparent">
                                      <TableCell colSpan={7} className="py-2">
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant="outline"
                                          className="bg-background"
                                          onClick={() =>
                                            addTask(axis.key, content.key)
                                          }
                                        >
                                          <Plus className="size-4" />
                                          Thêm nhiệm vụ
                                        </Button>
                                      </TableCell>
                                    </TableRow>
                                  </TableBody>
                                </Table>
                              </div>
                            </div>
                          );
                        })}
                      </CollapsibleContent>
                    </Collapsible>
                  );
                })}
              </div>

              {blocks.length ? (
                <Button
                  type="button"
                  variant="outline"
                  className="bg-background"
                  onClick={() => setBlocks((prev) => [...prev, emptyAxis()])}
                >
                  <Plus className="size-4" />
                  Thêm trục
                </Button>
              ) : null}
            </>
          )}
        </div>

        <SheetFooter className="flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline" className="font-normal">
              {blocks.filter((axis) => axis.axisId).length} trục
            </Badge>
            <Badge variant="outline" className="font-normal">
              {taskCount} nhiệm vụ
            </Badge>
            <Badge variant="outline" className="font-normal">
              {recordCount} bản ghi giao việc
            </Badge>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Hủy
            </Button>
            <Button type="button" onClick={submit} disabled={saving}>
              {saving ? "Đang giao..." : "Giao nhiệm vụ"}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>

      <Dialog open={pasteOpen} onOpenChange={setPasteOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Dán từ Excel</DialogTitle>
            <DialogDescription>
              Copy vùng dữ liệu trong Excel rồi dán vào ô dưới. Cột theo thứ tự:{" "}
              {PASTE_COLUMNS.join(" | ")}. Trục, nội dung và nhóm điểm khớp theo
              mã hoặc tên; nhiệm vụ tự gom vào đúng khối.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            rows={10}
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder={`TRUC-0001\tND-0001\tTriển khai đề án 06\tBáo cáo\tDG-0003\t31/12/2026`}
            className="font-mono text-xs"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setPasteOpen(false)}>
              Hủy
            </Button>
            <Button onClick={applyPaste}>Thêm vào bảng</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Sheet>
  );
}
