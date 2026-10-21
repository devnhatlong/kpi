"use client";

import { useState } from "react";
import useSWR from "swr";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  FileDown,
  Inbox,
  Loader2,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { SegmentedTabs } from "@/components/common/segmented-tabs";
import { CountBadge } from "@/components/common/count-badge";
import {
  commendationKeys,
  decideCommendation,
  fetchCommendationInbox,
  fetchCommendationInboxExport,
  fetchCommendationIncoming,
  type CommendationInboxBox,
} from "@/features/team-report/commendation";
import {
  exportCommendationToExcel,
  exportCommendationsAdvanced,
  exportCommendationsCombined,
} from "@/features/team-report/commendation-excel";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  MonthSwitcher,
  useCurrentMonth,
} from "@/features/team-report/components/month-switcher";
import { CommendationTables } from "@/features/team-report/components/commendation-tables";
import { ApprovalChain } from "@/features/team-report/components/participants-block";
import {
  ReturnTargetPicker,
  StageReturnNotice,
} from "@/features/team-report/components/return-target";
import type { ReturnTarget } from "@/features/team-report/stages";
import { commendationExportRows } from "@/features/team-report/components/team-report-commendation-view";
import {
  DAY_STATUS_CLASS,
  RETURN_BUTTON_CLASS,
} from "@/features/team-report/status-styles";
import {
  stagedStatusLabel,
  type TeamReportDayStatus,
} from "@/features/team-report/types";
import { getApiErrorMessage } from "@/lib/api-client";
import { formatServerHm } from "@/lib/server-time";
import { cn } from "@/lib/utils";

type StatusBox = "PENDING" | "APPROVED" | "RETURNED" | "";

const STATUS_TEXT: Record<Exclude<StatusBox, "">, string> = {
  PENDING: "Chờ duyệt",
  APPROVED: "Đã duyệt",
  RETURNED: "Đã trả lại",
};

const monthLabel = (month: string) => {
  const [y, m] = month.split("-");
  return `Tháng ${m}/${y}`;
};

/**
 * Hộp đến bảng biểu dương, phê bình của các đội Phòng Tham mưu.
 *
 * Hai hộp: CHỦ TRÌ (duyệt / trả lại) và THEO DÕI (nhận để biết - chỉ đọc).
 * Hộp đến theo tài khoản, không theo đơn vị.
 */
export function TeamReportCommendationInboxView() {
  const [box, setBox] = useState<CommendationInboxBox>("LEAD");
  const [status, setStatus] = useState<StatusBox>("PENDING");
  const [openId, setOpenId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  // Mỗi tháng xem riêng - mặc định tháng hiện tại theo giờ server.
  const [pickedMonth, setPickedMonth] = useState<string | null>(null);
  const currentMonth = useCurrentMonth();
  const month = pickedMonth ?? currentMonth;

  const list = useSWR(
    month ? commendationKeys.inbox(box, status, 1, month) : null,
    () =>
      fetchCommendationInbox({
        box,
        status: status as TeamReportDayStatus | "",
        periodMonth: month,
        limit: 50,
      }),
    // Giữ số đếm cũ trong lúc tải tab mới - huy hiệu không chớp tắt.
    { keepPreviousData: true },
  );
  const counts = list.data?.counts ?? null;

  if (openId) {
    return (
      <CommendationIncomingDetail
        id={openId}
        onBack={() => setOpenId(null)}
        onChanged={() => void list.mutate()}
      />
    );
  }

  const rows = list.data?.data ?? [];

  /* Xuất TẤT CẢ đơn vị đang hiện theo bộ lọc (hộp + trạng thái), không chỉ
     trang đang thấy - server trả đủ dòng từng bảng. */
  const exportAll = async () => {
    setExporting(true);
    try {
      const { criteria, sheets } = await fetchCommendationInboxExport({
        box,
        status: status as TeamReportDayStatus | "",
        periodMonth: month,
      });
      if (!sheets.length) {
        toast.info("Không có bảng nào để xuất.");
        return;
      }
      await exportCommendationsCombined({
        criteria,
        scopeLabel: `Tổng hợp các đơn vị${status ? ` · ${STATUS_TEXT[status]}` : ""
          }`,
        sheets: sheets.map((sheet) => ({
          periodMonth: sheet.periodMonth,
          departmentName: sheet.departmentName,
          praises: commendationExportRows(sheet.praises, []),
          criticisms: commendationExportRows(sheet.criticisms, []),
        })),
      });
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Không xuất được Excel."));
    } finally {
      setExporting(false);
    }
  };

  /* Xuất nâng cao: tách mỗi dòng theo TỪNG đơn vị được nêu tên, server trả
     kèm thứ tự đơn vị theo khối của cây đơn vị. */
  const exportAdvanced = async (kind: "PRAISE" | "CRITICISM") => {
    setExporting(true);
    try {
      const { units, sheets } = await fetchCommendationInboxExport({
        box,
        status: status as TeamReportDayStatus | "",
        periodMonth: month,
      });
      if (!sheets.length) {
        toast.info("Không có bảng nào để xuất.");
        return;
      }
      await exportCommendationsAdvanced({
        kind,
        units,
        scopeLabel: `Tổng hợp các đơn vị${
          status ? ` · ${STATUS_TEXT[status]}` : ""
        }`,
        sheets: sheets.map((sheet) => ({
          periodMonth: sheet.periodMonth,
          rows: (kind === "PRAISE" ? sheet.praises : sheet.criticisms).flatMap(
            (row) =>
              row.departmentIds.map((departmentId, index) => ({
                departmentId,
                departmentLabel:
                  row.departmentShortNames?.[index] ??
                  row.departmentNames[index] ??
                  "",
                content: row.content,
                evidence: row.evidence,
                note: row.note,
                source: sheet.departmentName,
              })),
          ),
        })),
      });
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Không xuất được Excel."));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="shadow-sm">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Inbox className="size-5" />
            </span>
            <div>
              <h1 className="font-display text-xl font-semibold tracking-tight">
                Bảng biểu dương, phê bình
              </h1>
              <p className="text-sm text-muted-foreground">
                Trưởng phòng: duyệt bảng các đội trong phòng gửi lên. Các đội
                Phòng Tham mưu: bảng các phòng gửi về - đội chủ trì duyệt / trả
                lại, các đội khác theo dõi.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <MonthSwitcher month={month} onChange={setPickedMonth} />
            <SegmentedTabs
              ariaLabel="Hộp"
              value={box}
              onChange={(next) => {
                setBox(next);
                // Hộp theo dõi không có "chờ tôi duyệt" - mở sẵn tất cả.
                setStatus(next === "LEAD" ? "PENDING" : "");
              }}
              /* Huy hiệu ở hai hộp = việc đang chờ TÔI: chủ trì - bảng chờ
                 tôi duyệt; theo dõi - bảng mới chưa mở. */
              items={[
                {
                  value: "LEAD" as const,
                  label: (
                    <span className="inline-flex items-center">
                      Chủ trì duyệt
                      <CountBadge
                        count={counts?.boxes.LEAD}
                        label={`${counts?.boxes.LEAD ?? 0} bảng chờ bạn duyệt`}
                      />
                    </span>
                  ),
                },
                {
                  value: "INFORM" as const,
                  label: (
                    <span className="inline-flex items-center">
                      Theo dõi
                      <CountBadge
                        count={counts?.boxes.INFORM}
                        label={`${counts?.boxes.INFORM ?? 0} bảng mới chưa xem`}
                      />
                    </span>
                  ),
                },
              ]}
            />
            <SegmentedTabs
              ariaLabel="Trạng thái"
              value={status}
              onChange={setStatus}
              items={(
                [
                  ["PENDING", "Chờ duyệt"],
                  ["APPROVED", "Đã duyệt"],
                  ["RETURNED", "Đã trả lại"],
                  ["", "Tất cả"],
                ] as const
              ).map(([value, text]) => ({
                value,
                label: (
                  <span className="inline-flex items-center">
                    {text}
                    <CountBadge
                      count={counts?.statuses[value || "ALL"]}
                      label={`${counts?.statuses[value || "ALL"] ?? 0} bảng`}
                    />
                  </span>
                ),
              }))}
            />
            <Button
              type="button"
              variant="outline"
              className="bg-background"
              disabled={exporting || !rows.length}
              onClick={() => void exportAll()}
              title="Xuất tất cả bảng đang hiện theo bộ lọc vào một file Excel"
            >
              {exporting ? (
                <Loader2
                  className="size-4 motion-safe:animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <FileDown className="size-4" aria-hidden="true" />
              )}
              Xuất tổng hợp
            </Button>
            {/* Xuất NÂNG CAO: một loại mỗi file, mỗi đơn vị một dòng, xếp
                theo khối của cây đơn vị. */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="bg-background"
                  disabled={exporting || !rows.length}
                >
                  <FileDown className="size-4" aria-hidden="true" />
                  Xuất nâng cao
                  <ChevronDown className="size-4" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onSelect={() => void exportAdvanced("PRAISE")}
                >
                  1. Xuất biểu dương
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => void exportAdvanced("CRITICISM")}
                >
                  2. Xuất phê bình, chấn chỉnh
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardContent className="p-0">
          {list.isLoading ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : rows.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              Không có bảng nào.
            </p>
          ) : (
            <ul className="divide-y">
              {rows.map((row) => (
                <li key={row._id}>
                  <button
                    type="button"
                    onClick={() => setOpenId(row._id)}
                    className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left hover:bg-muted/50"
                  >
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "block",
                          row.seen ? "font-medium" : "font-semibold",
                        )}
                      >
                        {row.departmentName}
                        {row.seen ? null : (
                          <span className="ml-2 text-xs font-medium text-primary">
                            Mới
                          </span>
                        )}
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {monthLabel(row.periodMonth)} · {row.praiseCount} biểu
                        dương · {row.criticismCount} phê bình
                        {row.sentAt
                          ? ` · gửi lúc ${formatServerHm(row.sentAt)}`
                          : ""}
                      </span>
                    </span>
                    <Badge
                      variant="secondary"
                      className={cn(
                        "font-normal",
                        DAY_STATUS_CLASS[row.status],
                      )}
                    >
                      {stagedStatusLabel(row)}
                    </Badge>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CommendationIncomingDetail({
  id,
  onBack,
  onChanged,
}: {
  id: string;
  onBack: () => void;
  onChanged: () => void;
}) {
  const { data, error, isLoading, mutate } = useSWR(
    commendationKeys.incoming(id),
    () => fetchCommendationIncoming(id),
  );
  const [dialog, setDialog] = useState<"APPROVE" | "RETURN" | null>(null);
  const [reason, setReason] = useState("");
  const [returnTo, setReturnTo] = useState<ReturnTarget>("PREVIOUS");
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);

  const openReturn = () => {
    setReturnTo("PREVIOUS");
    setDialog("RETURN");
  };

  const decide = async () => {
    if (!dialog) return;
    if (dialog === "RETURN" && !reason.trim()) return;
    const toPrevious =
      dialog === "RETURN" &&
      !!data?.canReturnToPrevious &&
      returnTo === "PREVIOUS";
    setBusy(true);
    try {
      await decideCommendation(id, {
        decision: dialog,
        reason: dialog === "RETURN" ? reason.trim() : undefined,
        returnTo: toPrevious ? "PREVIOUS" : undefined,
      });
      setDialog(null);
      setReason("");
      await mutate();
      onChanged();
      toast.success(
        dialog === "RETURN"
          ? toPrevious
            ? "Đã trả về người duyệt cấp 1."
            : "Đã trả lại."
          : "Đã duyệt.",
      );
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Không thực hiện được."));
    } finally {
      setBusy(false);
    }
  };

  const exportExcel = async () => {
    if (!data) return;
    setExporting(true);
    try {
      await exportCommendationToExcel({
        periodMonth: data.periodMonth,
        unitName: data.departmentName,
        statusLabel: stagedStatusLabel(data),
        criteria: data.criteria,
        praises: commendationExportRows(data.praises, []),
        criticisms: commendationExportRows(data.criticisms, []),
      });
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Không xuất được Excel."));
    } finally {
      setExporting(false);
    }
  };

  const decidable = data?.status === "PENDING" && data.canDecide;
  /* Bảng đã duyệt vẫn trả lại được - chỉ người chốt bảng (server quyết
     `canReturnApproved`), và chỉ trả, không duyệt lại. */
  const returnable =
    data?.status === "APPROVED" && !!data.canReturnApproved;

  return (
    <div className="space-y-4">
      <Button
        type="button"
        variant="outline"
        className="bg-background"
        onClick={onBack}
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Danh sách
      </Button>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {getApiErrorMessage(error, "Không mở được bảng.")}
        </p>
      ) : null}
      {isLoading || !data ? (
        error ? null : (
          <Skeleton className="h-96 w-full" />
        )
      ) : (
        <Card className="shadow-sm">
          <CardContent className="space-y-4 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-display text-lg font-semibold">
                    {data.departmentName} ·{" "}
                    {monthLabel(data.periodMonth).toLowerCase()}
                  </h2>
                  <Badge
                    variant="secondary"
                    className={cn("font-normal", DAY_STATUS_CLASS[data.status])}
                  >
                    {stagedStatusLabel(data)}
                  </Badge>
                  {data.viewerRole !== "RECIPIENT" ? (
                    <Badge variant="outline" className="font-normal">
                      Nhận để theo dõi
                    </Badge>
                  ) : null}
                </div>
                <p className="text-sm text-muted-foreground">
                  {data.sentByName ? `${data.sentByName} gửi` : "Đã gửi"}
                  {data.sentAt
                    ? ` lúc ${formatServerHm(data.sentAt)}`
                    : ""} · {data.praises.length} biểu dương ·{" "}
                  {data.criticisms.length} phê bình
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="bg-background"
                  disabled={exporting}
                  onClick={() => void exportExcel()}
                >
                  {exporting ? (
                    <Loader2
                      className="size-4 motion-safe:animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <FileDown className="size-4" aria-hidden="true" />
                  )}
                  Xuất Excel
                </Button>
                {decidable ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      className={RETURN_BUTTON_CLASS}
                      onClick={openReturn}
                    >
                      <Undo2 className="size-4" aria-hidden="true" />
                      Trả lại
                    </Button>
                    <Button type="button" onClick={() => setDialog("APPROVE")}>
                      <Check className="size-4" aria-hidden="true" />
                      Duyệt
                    </Button>
                  </>
                ) : returnable ? (
                  <Button
                    type="button"
                    variant="outline"
                    className={RETURN_BUTTON_CLASS}
                    onClick={openReturn}
                  >
                    <Undo2 className="size-4" aria-hidden="true" />
                    Trả lại
                  </Button>
                ) : null}
              </div>
            </div>

            <ApprovalChain
              status={data.status}
              leadName={data.recipientName}
              finalName={data.finalRecipientName}
              stage={data.stage}
              firstApproval={data.firstApproval}
            />
            {data.status === "RETURNED" ? (
              <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                <strong className="font-semibold">Đã trả lại:</strong>{" "}
                {data.returnReason}
              </p>
            ) : null}
            {data.status === "PENDING" ? (
              <StageReturnNotice info={data.returnedToFirst} />
            ) : null}

            <CommendationTables
              praises={data.praises}
              criticisms={data.criticisms}
              criteria={data.criteria ?? []}
              editable={false}
              ownerName={data.departmentName}
            />
          </CardContent>
        </Card>
      )}

      <Dialog
        open={dialog !== null}
        onOpenChange={(open) => !open && setDialog(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {dialog === "RETURN"
                ? "Trả lại bảng biểu dương, phê bình?"
                : "Duyệt bảng biểu dương, phê bình?"}
            </DialogTitle>
            <DialogDescription>
              {data?.departmentName} -{" "}
              {data ? monthLabel(data.periodMonth).toLowerCase() : ""}.
              {dialog === "APPROVE" &&
                data?.finalRecipientName &&
                data.stage !== "FINAL"
                ? ` Đây là duyệt cấp 1 - duyệt xong chuyển lên ${data.finalRecipientName} duyệt cuối.`
                : ""}
              {dialog === "RETURN" && data?.status === "APPROVED"
                ? data.canReturnToPrevious
                  ? " Bảng này đã duyệt - chọn trả về người duyệt cấp 1 hoặc về phòng lập."
                  : " Bảng này đã duyệt - trả lại thì phòng sửa rồi gửi lại, đi lại từ cấp 1."
                : ""}
            </DialogDescription>
          </DialogHeader>
          {dialog === "RETURN" && data?.canReturnToPrevious ? (
            <ReturnTargetPicker
              value={returnTo}
              onChange={setReturnTo}
              creatorName={data.departmentName}
              previousName={data.firstApproval?.byName}
            />
          ) : null}
          {dialog === "RETURN" ? (
            <div className="space-y-1.5">
              <Label htmlFor="commendation-return-reason">
                Lý do trả lại <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="commendation-return-reason"
                value={reason}
                rows={3}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Nêu rõ dòng / nội dung cần sửa…"
              />
            </div>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDialog(null)}
            >
              Huỷ
            </Button>
            <Button
              type="button"
              variant={dialog === "RETURN" ? "destructive" : "default"}
              disabled={busy || (dialog === "RETURN" && !reason.trim())}
              onClick={() => void decide()}
            >
              {busy ? (
                <Loader2
                  className="size-4 motion-safe:animate-spin"
                  aria-hidden="true"
                />
              ) : null}
              {dialog === "RETURN" ? "Trả lại" : "Duyệt"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
