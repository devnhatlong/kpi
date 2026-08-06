"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import useSWR from "swr";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { AxisTaskTable } from "@/features/personal-kpi/components/axis-task-table";
import {
  completePersonalKpi,
  completePersonalKpiInboxReport,
  fetchPersonalKpiInbox,
  personalKpiKeys,
  rejectPersonalKpi,
  rejectPersonalKpiInboxReport,
} from "@/features/personal-kpi/api";
import { PersonalTaskForm } from "@/features/personal-kpi/components/personal-task-form";
import {
  PERSONAL_KPI_STATUS_LABEL,
  canApprovePersonalKpi,
  type PersonalKpiItem,
} from "@/features/personal-kpi/types";
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

type PersonalInboxDetailDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ownerId: string | null;
  ownerName?: string;
  reportDate: string | null;
  onChanged: () => void | Promise<void>;
};

export function PersonalInboxDetailDrawer({
  open,
  onOpenChange,
  ownerId,
  ownerName,
  reportDate,
  onChanged,
}: PersonalInboxDetailDrawerProps) {
  const [acting, setActing] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectTarget, setRejectTarget] = useState<"report" | string | null>(
    null,
  );

  const { data, isLoading, mutate } = useSWR(
    open && ownerId && reportDate
      ? personalKpiKeys.inboxItems({
        ownerId,
        reportDate,
        page: 1,
        limit: 100,
      })
      : null,
    () =>
      fetchPersonalKpiInbox({
        ownerId: ownerId!,
        reportDate: reportDate!,
        page: 1,
        limit: 100,
      }),
  );

  const items = data?.data ?? [];
  const groups = useMemo(() => groupByAxisContent(items), [items]);
  const approvableCount = items.filter((item) =>
    canApprovePersonalKpi(item.status),
  ).length;
  const sendNote = items.find((item) => item.sendNote)?.sendNote;

  useEffect(() => {
    if (!open) {
      setRejectOpen(false);
      setRejectReason("");
      setRejectTarget(null);
    }
  }, [open]);

  const openRejectReport = () => {
    setRejectTarget("report");
    setRejectReason("");
    setRejectOpen(true);
  };

  const openRejectItem = (id: string) => {
    setRejectTarget(id);
    setRejectReason("");
    setRejectOpen(true);
  };

  const handleCompleteReport = async () => {
    if (!ownerId || !reportDate || approvableCount === 0) return;
    setActing(true);
    try {
      const result = await completePersonalKpiInboxReport(ownerId, reportDate);
      toast.success(
        result?.completedCount
          ? `Đã duyệt ${result.completedCount} nhiệm vụ.`
          : "Đã duyệt báo cáo.",
      );
      await mutate();
      await onChanged();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không duyệt được báo cáo."));
    } finally {
      setActing(false);
    }
  };

  const handleCompleteItem = async (id: string) => {
    setActing(true);
    try {
      await completePersonalKpi(id);
      toast.success("Đã duyệt hoàn thành.");
      await mutate();
      await onChanged();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không duyệt được nhiệm vụ."));
    } finally {
      setActing(false);
    }
  };

  const handleConfirmReject = async () => {
    if (!rejectTarget || !ownerId || !reportDate) return;
    const reason = rejectReason.trim();
    if (!reason) {
      toast.error("Vui lòng nhập lý do trả lại.");
      return;
    }

    setActing(true);
    try {
      if (rejectTarget === "report") {
        const result = await rejectPersonalKpiInboxReport(
          ownerId,
          reportDate,
          reason,
        );
        toast.success(
          result?.rejectedCount
            ? `Đã trả lại ${result.rejectedCount} nhiệm vụ.`
            : "Đã trả lại báo cáo.",
        );
      } else {
        await rejectPersonalKpi(rejectTarget, reason);
        toast.success("Đã trả lại nhiệm vụ.");
      }
      setRejectOpen(false);
      await mutate();
      await onChanged();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không trả lại được."));
    } finally {
      setActing(false);
    }
  };

  let contentStt = 0;

  return (
    <>
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
              Báo cáo từ{" "}
              <span className="font-medium text-foreground">
                {ownerName || "-"}
              </span>
              . Duyệt hoàn thành hoặc trả lại nhiệm vụ Đã gửi.
            </SheetDescription>
            {sendNote ? (
              <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                <span className="font-medium">Nội dung gửi: </span>
                {sendNote}
              </p>
            ) : null}
            {items.length > 0 ? (
              <div className="flex flex-wrap gap-1 pt-1">
                {Object.entries(
                  items.reduce<Record<string, number>>((acc, item) => {
                    acc[item.status] = (acc[item.status] ?? 0) + 1;
                    return acc;
                  }, {}),
                ).map(([status, count]) => (
                  <Badge key={status} variant="outline">
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
                Không có nhiệm vụ trong báo cáo này.
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
                        <AxisTaskTable
                          axisId={group.axisId}
                          actionLabel="Trạng thái / Thao tác"
                          caption={`${group.axisName} - ${content.workContentName}`}
                        >
                          {(columns) =>
                            content.items.map((item, taskIndex) => (
                                <PersonalTaskForm
                                  key={item.id}
                                  index={stt}
                                  taskNumber={taskIndex + 1}
                                  task={item.task}
                                  columns={columns}
                                  readOnly
                                  canRemove={false}
                                  showWorkContentCell={taskIndex === 0}
                                  showSttCell={taskIndex === 0}
                                  workContentLabel={content.workContentName}
                                  workContentRowSpan={content.items.length}
                                  onChange={() => undefined}
                                  onRemove={() => undefined}
                                  actions={
                                    <div className="flex flex-col items-end gap-2">
                                      <Badge variant="outline">
                                        {
                                          PERSONAL_KPI_STATUS_LABEL[
                                          item.status
                                          ]
                                        }
                                      </Badge>
                                      {canApprovePersonalKpi(item.status) ? (
                                        <div className="flex flex-col gap-1.5">
                                          <Button
                                            type="button"
                                            size="sm"
                                            className="bg-emerald-600 text-white hover:bg-emerald-700"
                                            onClick={() =>
                                              void handleCompleteItem(item.id)
                                            }
                                            disabled={acting}
                                          >
                                            <CheckCircle2 className="h-4 w-4" />
                                            Duyệt
                                          </Button>
                                          <Button
                                            type="button"
                                            size="sm"
                                            variant="destructive"
                                            onClick={() =>
                                              openRejectItem(item.id)
                                            }
                                            disabled={acting}
                                          >
                                            <XCircle className="h-4 w-4" />
                                            Trả lại
                                          </Button>
                                        </div>
                                      ) : null}
                                      {item.rejectReason ? (
                                        <p className="max-w-[140px] text-left text-xs text-destructive">
                                          {item.rejectReason}
                                        </p>
                                      ) : null}
                                    </div>
                                  }
                                />
                            ))
                          }
                        </AxisTaskTable>
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          <SheetFooter className="border-t pt-4">
            <div className="flex w-full flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                className="bg-background"
                onClick={() => onOpenChange(false)}
                disabled={acting}
              >
                Đóng
              </Button>
              {approvableCount > 0 ? (
                <>
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={openRejectReport}
                    disabled={acting || isLoading}
                  >
                    <XCircle className="h-4 w-4" />
                    Trả lại tất cả
                  </Button>
                  <Button
                    type="button"
                    className="bg-emerald-600 text-white hover:bg-emerald-700"
                    onClick={() => void handleCompleteReport()}
                    disabled={acting || isLoading}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    {acting ? "Đang xử lý..." : "Duyệt tất cả"}
                  </Button>
                </>
              ) : null}
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Trả lại báo cáo / nhiệm vụ</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reject-reason">
              Lý do trả lại <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="reject-reason"
              value={rejectReason}
              onChange={(event) => setRejectReason(event.target.value)}
              rows={4}
              placeholder="Nhập lý do trả lại..."
              disabled={acting}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="bg-background"
              onClick={() => setRejectOpen(false)}
              disabled={acting}
            >
              Hủy
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleConfirmReject()}
              disabled={acting || !rejectReason.trim()}
            >
              Xác nhận trả lại
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
