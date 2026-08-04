"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import useSWR from "swr";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/common/searchable-select";
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
import {
  fetchAxesAll,
  fetchWorkContentsAll,
} from "@/features/kpi-form-config/api";
import type { Axis, WorkContent } from "@/features/kpi-form-config/types";
import { entityId } from "@/features/kpi-form-config/types";
import {
  createPersonalKpiBatch,
  taskToWriteInput,
  updatePersonalKpi,
} from "@/features/personal-kpi/api";
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

function workContentAxisId(item: WorkContent): string {
  if (!item.axisId) return "";
  return typeof item.axisId === "string" ? item.axisId : item.axisId._id;
}

function catalogOptionLabel(item: { name: string; description?: string }) {
  const description = item.description?.trim();
  return description ? `${item.name} (${description})` : item.name;
}

function contentsForAxisId(workContents: WorkContent[], axisId: string) {
  if (!axisId) return [];
  return workContents
    .filter((item) => workContentAxisId(item) === axisId)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
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
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (edit) {
      setBlocks([
        {
          key: `axis-edit-${edit.id}`,
          axisId: edit.axisId,
          contents: [
            {
              key: `content-edit-${edit.id}`,
              workContentId: edit.workContentId,
              tasks: [
                {
                  ...edit.task,
                  evidenceFiles: edit.task.evidenceFiles ?? [],
                },
              ],
            },
          ],
        },
      ]);
      return;
    }
    // Không mặc định sẵn trục - thêm đúng những trục cần dùng
    setBlocks([]);
  }, [open, edit]);

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
      if (!axisById.get(block.axisId)) {
        toast.error("Trục không hợp lệ.");
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
          if (!task.title.trim()) {
            toast.error("Vui lòng nhập tên nhiệm vụ.");
            return;
          }
          const score = Number(task.standardScore);
          if (!Number.isFinite(score) || score < 0) {
            toast.error("Điểm chuẩn phải là số ≥ 0.");
            return;
          }
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
  let contentStt = 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-[96vw] max-w-[96vw] flex-col gap-0 overflow-hidden sm:max-w-[96vw]"
      >
        <SheetHeader className="border-b pb-4 text-left">
          <SheetTitle>{isEdit ? "Sửa nháp" : "Tạo nháp"}</SheetTitle>
          <SheetDescription>
            Chỉ thêm đúng những trục / nội dung cần dùng (có thể một phần hoặc
            đủ). Lưu nháp xong mới gửi từ danh sách.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-auto py-4">
          {blocks.length === 0 && !isEdit ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-10 text-center">
              <p className="text-sm text-muted-foreground">
                Chưa có trục nào. Thêm trục khi có nhiệm vụ thuộc trục đó.
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={addAxisBlock}
                disabled={saving || loading}
              >
                <Plus className="h-4 w-4" />
                Thêm trục
              </Button>
            </div>
          ) : null}

          {blocks.map((block) => {
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

            return (
              <div
                key={block.key}
                className="space-y-3 rounded-lg border bg-card p-3"
              >
                <div className="flex flex-wrap items-end gap-3">
                  <div className="min-w-[240px] flex-1 space-y-2">
                    <Label>
                      Trục <span className="text-destructive">*</span>
                    </Label>
                    <SearchableSelect
                      value={block.axisId}
                      onValueChange={(value) => setAxisId(block.key, value)}
                      disabled={loading || saving || isEdit}
                      placeholder="Chọn trục"
                      searchPlaceholder="Tìm trục..."
                      emptyText="Không tìm thấy trục."
                      className="z-[100]"
                      options={axes.map((item) => ({
                        value: entityId(item),
                        label: catalogOptionLabel(item),
                        keywords: item.code,
                      }))}
                    />
                  </div>
                  {!isEdit ? (
                    <div className="flex h-9 items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => addContentBlock(block.key)}
                        disabled={saving || !block.axisId}
                      >
                        <Plus className="h-4 w-4" />
                        Thêm nội dung
                      </Button>
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
                  ) : null}
                </div>

                {block.axisId && block.contents.length === 0 && !isEdit ? (
                  <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                    Trục này chưa có nội dung. Bấm &quot;Thêm nội dung&quot; nếu
                    cần nhập nhiệm vụ.
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

                  return (
                    <div
                      key={content.key}
                      className="space-y-2 rounded-md border border-dashed p-3"
                    >
                      <div className="flex flex-wrap items-end gap-3">
                        <div className="min-w-[280px] flex-1 space-y-2">
                          <Label>
                            Nội dung công việc{" "}
                            <span className="text-destructive">*</span>
                          </Label>
                          <SearchableSelect
                            value={content.workContentId}
                            onValueChange={(value) =>
                              setWorkContentId(block.key, content.key, value)
                            }
                            disabled={
                              !block.axisId || loading || saving || isEdit
                            }
                            placeholder={
                              block.axisId
                                ? "Chọn nội dung công việc"
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
                          {block.axisId && availableContents.length === 0 ? (
                            <p className="text-xs text-muted-foreground">
                              Trục này chưa có nội dung công việc nào.
                            </p>
                          ) : null}
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

                      {selectedContent ? (
                        <div className="overflow-auto rounded-md border">
                          <Table className="min-w-[1800px]">
                            <TableHeader>
                              <TableRow>
                                <TableHead
                                  rowSpan={2}
                                  className="sticky left-0 z-20 w-12 bg-muted/50 text-center align-middle text-sm font-medium"
                                >
                                  STT
                                </TableHead>
                                <TableHead
                                  rowSpan={2}
                                  className="min-w-[220px] align-middle text-sm font-medium"
                                >
                                  Nội dung công việc
                                </TableHead>
                                <TableHead
                                  rowSpan={2}
                                  className="min-w-[200px] align-middle text-sm font-medium"
                                >
                                  Nhiệm vụ
                                </TableHead>
                                <TableHead
                                  rowSpan={2}
                                  className="min-w-[140px] align-middle text-sm font-medium"
                                >
                                  Thời hạn hoàn thành
                                </TableHead>
                                <TableHead
                                  rowSpan={2}
                                  className="min-w-[160px] align-middle text-sm font-medium"
                                >
                                  Sản phẩm dự kiến
                                </TableHead>
                                <TableHead
                                  rowSpan={2}
                                  className="min-w-[100px] align-middle text-sm font-medium"
                                >
                                  Điểm chuẩn
                                </TableHead>
                                <TableHead
                                  rowSpan={2}
                                  className="min-w-[140px] align-middle text-sm font-medium"
                                >
                                  Đơn vị thực hiện
                                </TableHead>
                                <TableHead
                                  colSpan={4}
                                  className="text-center text-sm font-medium after:hidden"
                                >
                                  Kết quả theo dõi
                                </TableHead>
                                <TableHead
                                  rowSpan={2}
                                  className="min-w-[160px] align-middle text-sm font-medium before:absolute before:left-0 before:top-1/2 before:h-4 before:w-px before:-translate-y-1/2 before:bg-border"
                                >
                                  Đề nghị khác (căn cứ)
                                </TableHead>
                                <TableHead
                                  rowSpan={2}
                                  className="min-w-[200px] align-middle text-sm font-medium"
                                >
                                  Tài liệu kiểm chứng
                                </TableHead>
                                <TableHead
                                  rowSpan={2}
                                  className="sticky right-0 z-20 w-14 bg-muted/50"
                                />
                              </TableRow>
                              <TableRow>
                                <TableHead className="min-w-[100px] text-center text-sm font-medium">
                                  KPI tiến độ %
                                </TableHead>
                                <TableHead className="min-w-[110px] text-center text-sm font-medium">
                                  Điểm tự chấm
                                </TableHead>
                                <TableHead className="min-w-[100px] text-center text-sm font-medium">
                                  KPI chất lượng %
                                </TableHead>
                                <TableHead className="min-w-[110px] text-center text-sm font-medium after:hidden">
                                  Điểm tự chấm
                                </TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              <TableRow className="bg-muted/40 hover:bg-muted/40">
                                <TableCell
                                  colSpan={14}
                                  className="py-2 text-sm font-semibold"
                                >
                                  {axis
                                    ? catalogOptionLabel(axis)
                                    : "Trục"}
                                  {" - "}
                                  {catalogOptionLabel(selectedContent)}
                                </TableCell>
                              </TableRow>
                              {content.tasks.map((task, taskIndex) => (
                                <PersonalTaskForm
                                  key={task.key}
                                  index={stt}
                                  taskNumber={taskIndex + 1}
                                  task={task}
                                  canRemove={
                                    !isEdit && content.tasks.length > 1
                                  }
                                  showWorkContentCell={taskIndex === 0}
                                  showSttCell={taskIndex === 0}
                                  workContentLabel={catalogOptionLabel(
                                    selectedContent,
                                  )}
                                  workContentRowSpan={content.tasks.length}
                                  onChange={(patch) =>
                                    updateTask(
                                      block.key,
                                      content.key,
                                      task.key,
                                      patch,
                                    )
                                  }
                                  onRemove={() =>
                                    removeTask(
                                      block.key,
                                      content.key,
                                      task.key,
                                    )
                                  }
                                />
                              ))}
                              {!isEdit ? (
                                <TableRow className="hover:bg-transparent">
                                  <TableCell colSpan={14} className="py-2">
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      onClick={() =>
                                        addTask(block.key, content.key)
                                      }
                                      disabled={saving}
                                    >
                                      <Plus className="h-4 w-4" />
                                      Thêm nhiệm vụ
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              ) : null}
                            </TableBody>
                          </Table>
                        </div>
                      ) : (
                        <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                          Chọn nội dung công việc để hiện bảng nhiệm vụ.
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}

          {!isEdit && blocks.length > 0 ? (
            <Button
              type="button"
              variant="outline"
              onClick={addAxisBlock}
              disabled={saving || loading}
            >
              <Plus className="h-4 w-4" />
              Thêm trục
            </Button>
          ) : null}
        </div>

        <SheetFooter className="border-t pt-4 sm:space-x-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Huỷ
          </Button>
          <Button
            type="button"
            onClick={() => void submit()}
            disabled={saving || loading}
          >
            {saving ? "Đang lưu..." : "Lưu nháp"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
