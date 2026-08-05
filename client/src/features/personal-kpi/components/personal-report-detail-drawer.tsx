"use client";

import { useEffect, useMemo, useState } from "react";
import { Pencil, Send } from "lucide-react";
import useSWR from "swr";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  fetchMyPersonalKpi,
  personalKpiKeys,
  sendPersonalKpiReport,
  taskToWriteInput,
  updatePersonalKpi,
  type SendPersonalKpiPayload,
} from "@/features/personal-kpi/api";
import { PersonalTaskForm } from "@/features/personal-kpi/components/personal-task-form";
import { SendRecipientDialog } from "@/features/personal-kpi/components/send-recipient-dialog";
import {
  PERSONAL_KPI_STATUS_LABEL,
  canEditPersonalKpiInReport,
  canSendPersonalKpiInReport,
  type PersonalKpiItem,
  type PersonalKpiStatus,
  type PersonalTaskDraft,
} from "@/features/personal-kpi/types";
import { personalKpiStatusBadgeClass } from "@/features/personal-kpi/status-styles";
import { getApiErrorMessage } from "@/lib/api-client";

function formatReportDate(ymd: string) {
  const date = new Date(`${ymd}T00:00:00`);
  if (Number.isNaN(date.getTime())) return ymd;
  return date.toLocaleDateString("vi-VN", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

type AxisGroup = {
  axisId: string;
  axisName: string;
  contents: Array<{
    workContentId: string;
    workContentName: string;
    items: PersonalKpiItem[];
  }>;
};

function groupByAxisContent(items: PersonalKpiItem[]): AxisGroup[] {
  const axisMap = new Map<string, AxisGroup>();

  for (const item of items) {
    let axis = axisMap.get(item.axisId);
    if (!axis) {
      axis = {
        axisId: item.axisId,
        axisName: item.axisName,
        contents: [],
      };
      axisMap.set(item.axisId, axis);
    }

    let content = axis.contents.find(
      (c) => c.workContentId === item.workContentId,
    );
    if (!content) {
      content = {
        workContentId: item.workContentId,
        workContentName: item.workContentName,
        items: [],
      };
      axis.contents.push(content);
    }
    content.items.push(item);
  }

  return [...axisMap.values()];
}

type PersonalReportDetailDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reportDate: string | null;
  onChanged: () => void | Promise<void>;
};

export function PersonalReportDetailDrawer({
  open,
  onOpenChange,
  reportDate,
  onChanged,
}: PersonalReportDetailDrawerProps) {
  const [items, setItems] = useState<PersonalKpiItem[]>([]);
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);

  const { data, isLoading, mutate } = useSWR(
    open && reportDate
      ? personalKpiKeys.byDate({
        reportDate,
        page: 1,
        limit: 100,
      })
      : null,
    () =>
      fetchMyPersonalKpi({
        reportDate: reportDate!,
        page: 1,
        limit: 100,
      }),
  );

  useEffect(() => {
    if (!open) {
      setItems([]);
      setMode("view");
      return;
    }
    if (data?.data) setItems(data.data);
    setMode("view");
  }, [open, data]);

  const groups = useMemo(() => groupByAxisContent(items), [items]);
  const hasRejected = items.some((item) => item.status === "REJECTED");
  const canShowEdit = items.some((item) =>
    canEditPersonalKpiInReport(item.status, items),
  );
  const sendableItems = items.filter((item) =>
    canSendPersonalKpiInReport(item.status, items),
  );
  const sendableCount = sendableItems.length;
  const isEditing = mode === "edit";

  const updateTask = (id: string, patch: Partial<PersonalTaskDraft>) => {
    if (!isEditing) return;
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id || !canEditPersonalKpiInReport(item.status, prev)) {
          return item;
        }
        return { ...item, task: { ...item.task, ...patch } };
      }),
    );
  };

  const startEdit = () => {
    if (!canShowEdit) {
      toast.error(
        hasRejected
          ? "Chỉ sửa được nhiệm vụ Trả lại."
          : "Chỉ sửa được khi có nhiệm vụ Nháp hoặc Trả lại.",
      );
      return;
    }
    setMode("edit");
  };

  const cancelEdit = () => {
    setItems(data?.data ?? []);
    setMode("view");
  };

  const handleSave = async () => {
    const editableItems = items.filter((item) =>
      canEditPersonalKpiInReport(item.status, items),
    );
    if (editableItems.length === 0) {
      toast.error(
        hasRejected
          ? "Chỉ sửa được nhiệm vụ Trả lại."
          : "Không có nhiệm vụ nào được phép sửa.",
      );
      return;
    }

    for (const item of editableItems) {
      if (!item.task.title.trim()) {
        toast.error("Vui lòng nhập tên nhiệm vụ.");
        return;
      }
      const score = Number(item.task.standardScore);
      if (!Number.isFinite(score) || score < 0) {
        toast.error("Điểm chuẩn phải là số ≥ 0.");
        return;
      }
    }

    setSaving(true);
    try {
      await Promise.all(
        editableItems.map((item) =>
          updatePersonalKpi(
            item.id,
            taskToWriteInput(item.axisId, item.workContentId, item.task),
          ),
        ),
      );
      toast.success(
        hasRejected ? "Đã lưu nhiệm vụ Trả lại." : "Đã lưu nháp.",
      );
      await mutate();
      await onChanged();
      setMode("view");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không lưu được nháp."));
    } finally {
      setSaving(false);
    }
  };

  const handleSend = async (payload: SendPersonalKpiPayload) => {
    if (!reportDate || isEditing) return;
    if (sendableCount === 0) {
      toast.error(
        hasRejected
          ? "Không còn nhiệm vụ Trả lại để gửi lại."
          : "Không còn nhiệm vụ nháp/trả lại để gửi.",
      );
      return;
    }

    setSending(true);
    try {
      const result = await sendPersonalKpiReport(reportDate, {
        ...payload,
        itemIds: sendableItems.map((item) => item.id),
      });
      toast.success(
        result?.sentCount
          ? hasRejected
            ? `Đã gửi lại ${result.sentCount} nhiệm vụ Trả lại tới ${result.recipientName}.`
            : `Đã gửi ${result.sentCount} nhiệm vụ tới ${result.recipientName}.`
          : "Đã gửi báo cáo.",
      );
      setSendOpen(false);
      await mutate();
      await onChanged();
      onOpenChange(false);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không gửi được báo cáo."));
    } finally {
      setSending(false);
    }
  };

  const openSendDialog = () => {
    if (!reportDate || isEditing) return;
    if (sendableCount === 0) {
      toast.error(
        hasRejected
          ? "Không còn nhiệm vụ Trả lại để gửi lại."
          : "Không còn nhiệm vụ nháp/trả lại để gửi.",
      );
      return;
    }
    setSendOpen(true);
  };

  const busy = saving || sending;
  let contentStt = 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-[96vw] max-w-[96vw] flex-col gap-0 overflow-hidden sm:max-w-[96vw]"
      >
        <SheetHeader className="border-b pb-4 text-left">
          <SheetTitle className="capitalize">
            {reportDate ? formatReportDate(reportDate) : "Chi tiết báo cáo"}
          </SheetTitle>
          <SheetDescription>
            {isEditing
              ? hasRejected
                ? "Chỉ chỉnh sửa nhiệm vụ Trả lại. Nhiệm vụ Đã gửi / Nháp khác bị khoá."
                : "Đang chỉnh sửa nhiệm vụ Nháp / Trả lại. Lưu xong mới gửi được."
              : hasRejected
                ? "Có nhiệm vụ Trả lại - chỉ được sửa và gửi lại đúng các nhiệm vụ đó."
                : "Chế độ xem. Bấm Chỉnh sửa nếu còn nhiệm vụ Nháp / Trả lại."}
          </SheetDescription>
          {items.length > 0 ? (
            <div className="flex flex-wrap gap-1 pt-1">
              {Object.entries(
                items.reduce<Record<string, number>>((acc, item) => {
                  acc[item.status] = (acc[item.status] ?? 0) + 1;
                  return acc;
                }, {}),
              ).map(([status, count]) => (
                <Badge
                  key={status}
                  variant="secondary"
                  className={personalKpiStatusBadgeClass(
                    status as PersonalKpiStatus,
                  )}
                >
                  {PERSONAL_KPI_STATUS_LABEL[
                    status as keyof typeof PERSONAL_KPI_STATUS_LABEL
                  ] ?? status}{" "}
                  {count}
                </Badge>
              ))}
            </div>
          ) : null}
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-auto py-4">
          {isLoading ? (
            <div className="rounded-md border border-dashed p-10 text-center text-sm text-muted-foreground">
              Đang tải...
            </div>
          ) : groups.length === 0 ? (
            <div className="rounded-md border border-dashed p-10 text-center text-sm text-muted-foreground">
              Ngày này chưa có nhiệm vụ.
            </div>
          ) : (
            groups.map((group) => (
              <div
                key={group.axisId}
                className="space-y-3 rounded-lg border bg-card p-3"
              >
                <p className="text-sm font-medium">Trục: {group.axisName}</p>
                {group.contents.map((content) => {
                  contentStt += 1;
                  const stt = contentStt;
                  return (
                    <div
                      key={content.workContentId}
                      className="space-y-2 rounded-md border border-dashed p-3"
                    >
                      <p className="text-sm text-muted-foreground">
                        Nội dung công việc: {content.workContentName}
                      </p>
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
                                className="sticky right-0 z-20 w-[110px] bg-muted/50 text-center align-middle text-sm font-medium"
                              >
                                Trạng thái
                              </TableHead>
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
                                {group.axisName} - {content.workContentName}
                              </TableCell>
                            </TableRow>
                            {content.items.map((item, taskIndex) => {
                              const editable =
                                isEditing &&
                                canEditPersonalKpiInReport(item.status, items);
                              return (
                                <PersonalTaskForm
                                  key={item.id}
                                  index={stt}
                                  taskNumber={taskIndex + 1}
                                  task={item.task}
                                  readOnly={!editable}
                                  canRemove={false}
                                  showWorkContentCell={taskIndex === 0}
                                  showSttCell={taskIndex === 0}
                                  workContentLabel={content.workContentName}
                                  workContentRowSpan={content.items.length}
                                  onChange={(patch) =>
                                    updateTask(item.id, patch)
                                  }
                                  onRemove={() => undefined}
                                  actions={
                                    <Badge
                                      variant="secondary"
                                      className={personalKpiStatusBadgeClass(
                                        item.status,
                                      )}
                                    >
                                      {PERSONAL_KPI_STATUS_LABEL[item.status]}
                                    </Badge>
                                  }
                                />
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <SheetFooter className="border-t pt-4 sm:justify-end">
          <div className="flex flex-wrap gap-2">
            {isEditing ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  className="bg-background"
                  onClick={cancelEdit}
                  disabled={busy}
                >
                  Hủy
                </Button>
                <Button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={busy || isLoading}
                >
                  {saving ? "Đang lưu..." : "Lưu"}
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  className="bg-background"
                  onClick={() => onOpenChange(false)}
                  disabled={busy}
                >
                  Đóng
                </Button>
                {canShowEdit ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="bg-background"
                    onClick={startEdit}
                    disabled={busy || isLoading}
                  >
                    <Pencil className="h-4 w-4" />
                    Chỉnh sửa
                  </Button>
                ) : null}
                {sendableCount > 0 ? (
                  <Button
                    type="button"
                    onClick={openSendDialog}
                    disabled={busy || isLoading}
                  >
                    <Send className="h-4 w-4" />
                    {sending
                      ? "Đang gửi..."
                      : hasRejected
                        ? `Gửi lại (${sendableCount})`
                        : `Gửi (${sendableCount})`}
                  </Button>
                ) : null}
              </>
            )}
          </div>
        </SheetFooter>
      </SheetContent>

      <SendRecipientDialog
        open={sendOpen}
        onOpenChange={setSendOpen}
        title={
          hasRejected
            ? `Gửi lại ${sendableCount} nhiệm vụ Trả lại`
            : `Gửi ${sendableCount} nhiệm vụ`
        }
        submitting={sending}
        onConfirm={handleSend}
      />
    </Sheet>
  );
}
