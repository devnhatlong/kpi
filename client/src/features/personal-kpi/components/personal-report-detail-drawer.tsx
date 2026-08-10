"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Pencil, Send, Undo2, X } from "lucide-react";
import useSWR from "swr";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { FormTemplateColumn } from "@/features/kpi-form-config/types";
import { AxisTaskTable } from "@/features/personal-kpi/components/axis-task-table";
import { missingRequiredColumns } from "@/features/personal-kpi/task-column-utils";
import {
  fetchMyPersonalKpi,
  personalKpiKeys,
  submitPersonalKpiReport,
  taskToWriteInput,
  updatePersonalKpi,
  type SubmitPersonalKpiPayload,
} from "@/features/personal-kpi/api";
import { PersonalTaskForm } from "@/features/personal-kpi/components/personal-task-form";
import { SendRecipientDialog } from "@/features/personal-kpi/components/send-recipient-dialog";
import {
  PERSONAL_KPI_STATUS_LABEL,
  canEditPersonalKpi,
  canSendPersonalKpi,
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
      axis = { axisId: item.axisId, axisName: item.axisName, contents: [] };
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
  /** Sửa theo TỪNG DÒNG, không bật chế độ sửa cho cả báo cáo. */
  const [editingIds, setEditingIds] = useState<Set<string>>(new Set());
  const [savingId, setSavingId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  /** Các nhiệm vụ sẽ gửi khi xác nhận người nhận; rỗng = đang đóng. */
  const [sendIds, setSendIds] = useState<string[]>([]);
  /** Nhiệm vụ đang xem lý do trả lại. */
  const [reasonItem, setReasonItem] = useState<PersonalKpiItem | null>(null);

  const { data, isLoading, mutate } = useSWR(
    open && reportDate
      ? personalKpiKeys.byDate({ reportDate, page: 1, limit: 100 })
      : null,
    () => fetchMyPersonalKpi({ reportDate: reportDate!, page: 1, limit: 100 }),
  );

  useEffect(() => {
    if (!open) {
      setItems([]);
      setEditingIds(new Set());
      setSendIds([]);
      return;
    }
    if (data?.data) setItems(data.data);
  }, [open, data]);

  const groups = useMemo(() => groupByAxisContent(items), [items]);

  /**
   * Nhiệm vụ bị Trả lại KHÔNG gửi lại được cho tới khi sửa và lưu - lưu xong
   * server chuyển nó về Nháp. Gửi lại y nguyên chỉ khiến cấp trên trả về lần
   * nữa, nên chặn ngay ở đây.
   */
  const sendableItems = items.filter(
    (item) => item.status === "DRAFT" && !editingIds.has(item.id),
  );
  const returnedItems = items.filter((item) => item.status === "RETURNED");
  const hasReturned = returnedItems.length > 0;
  /** Báo cáo đã từng gửi đi lần nào chưa - quyết định gửi cả lượt hay gửi lại lẻ. */
  const everSent = items.some((item) => Boolean(item.sentAt));

  const updateTask = (id: string, patch: Partial<PersonalTaskDraft>) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, task: { ...item.task, ...patch } } : item,
      ),
    );
  };

  const startEditRow = (id: string) => {
    setEditingIds((prev) => new Set(prev).add(id));
  };

  const cancelEditRow = (id: string) => {
    const original = data?.data.find((item) => item.id === id);
    if (original) {
      setItems((prev) =>
        prev.map((item) => (item.id === id ? original : item)),
      );
    }
    setEditingIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const saveRow = async (item: PersonalKpiItem, columns: FormTemplateColumn[]) => {
    if (!item.task.title.trim()) {
      toast.error("Vui lòng nhập tên nhiệm vụ.");
      return;
    }
    const score = Number(item.task.standardScore);
    if (!Number.isFinite(score) || score < 0) {
      toast.error("Điểm chuẩn phải là số ≥ 0.");
      return;
    }
    // Cột super admin tích "bắt buộc" trong mẫu phải có dữ liệu.
    const missing = missingRequiredColumns(item.task, columns);
    if (missing.length) {
      toast.error(`Chưa nhập cột bắt buộc: ${missing.join(", ")}.`);
      return;
    }

    setSavingId(item.id);
    try {
      await updatePersonalKpi(
        item.id,
        taskToWriteInput(item.axisId, item.workContentId, item.task),
      );
      setEditingIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
      toast.success(
        item.status === "RETURNED"
          ? "Đã lưu. Giờ gửi lại được nhiệm vụ này."
          : "Đã lưu nháp.",
      );
      await mutate();
      await onChanged();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không lưu được nhiệm vụ."));
    } finally {
      setSavingId(null);
    }
  };

  const handleSend = async (payload: SubmitPersonalKpiPayload) => {
    if (!reportDate || sendIds.length === 0) return;
    setSending(true);
    try {
      const result = await submitPersonalKpiReport(reportDate, {
        ...payload,
        itemIds: sendIds,
      });
      toast.success(
        `Đã gửi ${result.sentCount} nhiệm vụ tới ${result.recipientName}.`,
      );
      setSendIds([]);
      await mutate();
      await onChanged();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không gửi được báo cáo."));
    } finally {
      setSending(false);
    }
  };

  const busy = savingId !== null || sending;
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
            {hasReturned
              ? `${returnedItems.length} nhiệm vụ bị trả lại - sửa và lưu từng dòng, lưu xong mới gửi lại được.`
              : everSent
                ? "Bấm Sửa ở dòng cần chỉnh. Nhiệm vụ đang chờ duyệt thì khoá."
                : "Báo cáo chưa gửi lần nào - soạn xong bấm Gửi báo cáo ở dưới để gửi cả lượt."}
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
                  {PERSONAL_KPI_STATUS_LABEL[status as PersonalKpiStatus] ??
                    status}{" "}
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
                <p className="text-sm font-medium">{group.axisName}</p>
                {group.contents.map((content) => {
                  contentStt += 1;
                  const stt = contentStt;
                  return (
                    <div
                      key={content.workContentId}
                      className="space-y-2 rounded-md border border-dashed p-3"
                    >
                      <p className="text-sm text-muted-foreground">
                        {content.workContentName}
                      </p>
                      <AxisTaskTable
                        axisId={group.axisId}
                        actionLabel="Trạng thái"
                        caption={`${group.axisName} - ${content.workContentName}`}
                      >
                        {(columns) =>
                          content.items.map((item, taskIndex) => {
                            const editing = editingIds.has(item.id);
                            const canEdit = canEditPersonalKpi(item.status);
                            return (
                              <PersonalTaskForm
                                key={item.id}
                                index={stt}
                                taskNumber={taskIndex + 1}
                                task={item.task}
                                columns={columns}
                                readOnly={!editing}
                                canRemove={false}
                                showWorkContentCell={taskIndex === 0}
                                showSttCell={taskIndex === 0}
                                workContentLabel={content.workContentName}
                                workContentRowSpan={content.items.length}
                                onChange={(patch) => updateTask(item.id, patch)}
                                onRemove={() => undefined}
                                rowClassName={
                                  item.status === "RETURNED"
                                    ? "bg-rose-50/70 hover:bg-rose-50 dark:bg-rose-950/25 dark:hover:bg-rose-950/40"
                                    : undefined
                                }
                                actions={
                                  <RowActions
                                    item={item}
                                    editing={editing}
                                    canEdit={canEdit}
                                    busy={busy}
                                    saving={savingId === item.id}
                                    onEdit={() => startEditRow(item.id)}
                                    onCancel={() => cancelEditRow(item.id)}
                                    onSave={() => void saveRow(item, columns)}
                                    onSend={() => setSendIds([item.id])}
                                    onShowReason={() => setReasonItem(item)}
                                  />
                                }
                              />
                            );
                          })
                        }
                      </AxisTaskTable>
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <SheetFooter className="border-t pt-4 sm:justify-end">
          <div className="flex flex-wrap items-center gap-2">
            {hasReturned ? (
              <span className="mr-auto text-xs text-muted-foreground">
                {returnedItems.length} nhiệm vụ bị trả lại chưa sửa - chưa gửi
                lại được.
              </span>
            ) : null}
            <Button
              type="button"
              variant="outline"
              className="bg-background"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Đóng
            </Button>
            {sendableItems.length > 0 ? (
              <Button
                type="button"
                onClick={() =>
                  setSendIds(sendableItems.map((item) => item.id))
                }
                disabled={busy || isLoading}
              >
                <Send className="h-4 w-4" />
                {sending
                  ? "Đang gửi..."
                  : everSent
                    ? `Gửi lại (${sendableItems.length})`
                    : `Gửi báo cáo (${sendableItems.length})`}
              </Button>
            ) : null}
          </div>
        </SheetFooter>
      </SheetContent>

      <SendRecipientDialog
        open={sendIds.length > 0}
        onOpenChange={(next) => {
          if (!next && !sending) setSendIds([]);
        }}
        title={
          sendIds.length === 1
            ? "Gửi nhiệm vụ"
            : `Gửi ${sendIds.length} nhiệm vụ`
        }
        submitting={sending}
        onConfirm={handleSend}
      />

      <Dialog
        open={!!reasonItem}
        onOpenChange={(next) => {
          if (!next) setReasonItem(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Undo2 className="size-4 text-rose-600 dark:text-rose-400" />
              Nhiệm vụ bị trả lại
            </DialogTitle>
            <DialogDescription className="line-clamp-2">
              {reasonItem?.task.title}
            </DialogDescription>
          </DialogHeader>

          <dl className="space-y-3 text-sm">
            <div className="flex gap-3">
              <dt className="w-24 shrink-0 text-muted-foreground">Người trả</dt>
              <dd className="font-medium">
                {reasonItem?.decidedByName || "Không rõ"}
              </dd>
            </div>
            <div className="flex gap-3">
              <dt className="w-24 shrink-0 text-muted-foreground">Thời điểm</dt>
              <dd>{formatDateTime(reasonItem?.decidedAt)}</dd>
            </div>
            <div className="space-y-1.5">
              <dt className="text-muted-foreground">Lý do</dt>
              <dd className="whitespace-pre-wrap rounded-md border border-rose-200 bg-rose-50 p-3 text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
                {reasonItem?.rejectReason?.trim() || "Không ghi lý do."}
              </dd>
            </div>
          </dl>

          <DialogFooter>
            <Button variant="outline" onClick={() => setReasonItem(null)}>
              Đóng
            </Button>
            {reasonItem && canEditPersonalKpi(reasonItem.status) ? (
              <Button
                onClick={() => {
                  startEditRow(reasonItem.id);
                  setReasonItem(null);
                }}
              >
                <Pencil className="size-4" />
                Sửa nhiệm vụ
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Sheet>
  );
}

function formatDateTime(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("vi-VN");
}

/** Ô cuối mỗi dòng: trạng thái, lý do trả lại, và thao tác của chính dòng đó. */
function RowActions({
  item,
  editing,
  canEdit,
  busy,
  saving,
  onEdit,
  onCancel,
  onSave,
  onSend,
  onShowReason,
}: {
  item: PersonalKpiItem;
  editing: boolean;
  canEdit: boolean;
  busy: boolean;
  saving: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  onSend: () => void;
  onShowReason: () => void;
}) {
  if (editing) {
    return (
      <div className="flex items-center justify-end gap-1">
        <Button
          size="sm"
          onClick={onSave}
          disabled={busy}
          title="Lưu nhiệm vụ này"
        >
          <Check className="h-4 w-4" />
          {saving ? "Đang lưu" : "Lưu"}
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={onCancel}
          disabled={busy}
          aria-label="Hủy sửa"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-1.5 text-right">
      <Badge
        variant="secondary"
        className={personalKpiStatusBadgeClass(item.status)}
      >
        {PERSONAL_KPI_STATUS_LABEL[item.status]}
      </Badge>

      {item.status === "RETURNED" ? (
        <button
          type="button"
          onClick={onShowReason}
          className="inline-flex w-full items-center justify-end gap-1 rounded-md px-1 py-0.5 text-[11px] font-medium text-rose-600 underline-offset-2 hover:underline dark:text-rose-400"
        >
          <Undo2 className="size-3 shrink-0" />
          Xem lý do trả lại
        </button>
      ) : null}

      <div className="flex justify-end gap-1">
        {canEdit ? (
          <Button
            size="sm"
            variant="outline"
            className="h-7 bg-background px-2 text-xs"
            onClick={onEdit}
            disabled={busy}
          >
            <Pencil className="h-3.5 w-3.5" />
            Sửa
          </Button>
        ) : null}
        {/*
          Chỉ dòng ĐÃ TỪNG gửi đi (tức bị trả lại rồi sửa lại) mới có nút gửi
          riêng. Báo cáo mới lập thì gửi cả lượt bằng nút dưới chân trang - gửi
          lẻ lúc đó chỉ đẻ ra nhiều lượt gửi vụn cho cùng một người nhận.
        */}
        {item.status === "DRAFT" && item.sentAt ? (
          <Button
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={onSend}
            disabled={busy}
          >
            <Send className="h-3.5 w-3.5" />
            Gửi lại
          </Button>
        ) : null}
      </div>
    </div>
  );
}
