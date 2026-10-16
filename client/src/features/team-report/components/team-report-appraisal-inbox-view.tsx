"use client";

import { useState } from "react";
import useSWR from "swr";
import { ArrowLeft, Check, Inbox, Loader2, Undo2 } from "lucide-react";
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
import {
  appraisalKeys,
  appraisalTotals,
  decideAppraisal,
  fetchAppraisalInbox,
  fetchAppraisalIncoming,
} from "@/features/team-report/appraisal";
import { AppraisalWorkspace } from "@/features/team-report/components/appraisal-workspace";
import { ApprovalChain } from "@/features/team-report/components/participants-block";
import {
  DAY_STATUS_CLASS,
  RETURN_BUTTON_CLASS,
} from "@/features/team-report/status-styles";
import {
  formatScore,
  stagedStatusLabel,
  type TeamReportDayStatus,
} from "@/features/team-report/types";
import { getApiErrorMessage } from "@/lib/api-client";
import { formatServerHm } from "@/lib/server-time";
import { cn } from "@/lib/utils";

type Box = "PENDING" | "APPROVED" | "RETURNED" | "";

const monthLabel = (month: string) => {
  const [y, m] = month.split("-");
  return `Tháng ${m}/${y}`;
};

/** Hộp đến bảng thẩm định - mặc định Đội CNTT, theo luồng APPRAISAL. */
export function TeamReportAppraisalInboxView() {
  const [box, setBox] = useState<Box>("PENDING");
  const [openId, setOpenId] = useState<string | null>(null);

  const list = useSWR(appraisalKeys.inbox(box, 1), () =>
    fetchAppraisalInbox({ status: box as TeamReportDayStatus | "", limit: 50 }),
  );

  if (openId) {
    return (
      <AppraisalIncomingDetail
        id={openId}
        onBack={() => setOpenId(null)}
        onChanged={() => void list.mutate()}
      />
    );
  }

  const rows = list.data?.data ?? [];

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
                Duyệt bảng thẩm định
              </h1>
              <p className="text-sm text-muted-foreground">
                Phụ lục theo dõi, thẩm định tháng - các đội trình lên từng đơn
                vị, duyệt / trả lại riêng từng đơn vị.
              </p>
            </div>
          </div>
          <SegmentedTabs
            ariaLabel="Trạng thái"
            value={box}
            onChange={setBox}
            items={[
              { value: "PENDING" as const, label: "Chờ duyệt" },
              { value: "APPROVED" as const, label: "Đã duyệt" },
              { value: "RETURNED" as const, label: "Đã trả lại" },
              { value: "" as const, label: "Tất cả" },
            ]}
          />
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
              Không có đơn vị nào.
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
                      <span className="block font-medium">{row.unitName}</span>
                      <span className="text-xs text-muted-foreground">
                        {monthLabel(row.periodMonth)} · thẩm định bởi{" "}
                        {row.departmentName}
                        {row.sentAt
                          ? ` · trình lúc ${formatServerHm(row.sentAt)}`
                          : ""}
                      </span>
                    </span>
                    <span className="text-right text-sm tabular-nums">
                      <span className="block font-semibold">
                        {row.finalScore === null
                          ? "-"
                          : formatScore(row.finalScore)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {row.proposedRating}
                      </span>
                    </span>
                    <Badge
                      variant="secondary"
                      className={cn("font-normal", DAY_STATUS_CLASS[row.status])}
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

function AppraisalIncomingDetail({
  id,
  onBack,
  onChanged,
}: {
  id: string;
  onBack: () => void;
  onChanged: () => void;
}) {
  const { data, error, isLoading, mutate } = useSWR(
    appraisalKeys.incoming(id),
    () => fetchAppraisalIncoming(id),
  );
  const [dialog, setDialog] = useState<"APPROVE" | "RETURN" | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const decide = async () => {
    if (!dialog) return;
    if (dialog === "RETURN" && !reason.trim()) return;
    setBusy(true);
    try {
      await decideAppraisal(id, {
        decision: dialog,
        reason: dialog === "RETURN" ? reason.trim() : undefined,
      });
      setDialog(null);
      setReason("");
      await mutate();
      onChanged();
      toast.success(dialog === "RETURN" ? "Đã trả lại." : "Đã duyệt.");
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Không thực hiện được."));
    } finally {
      setBusy(false);
    }
  };

  const decidable = data?.status === "PENDING" && data.canDecide;
  // Mở theo MỘT đơn vị - server trả bảng chỉ gồm đúng đơn vị đó.
  const unit = data?.units[0] ?? null;
  const finalScore = unit ? appraisalTotals(unit).finalScore : null;

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
                    {unit?.departmentName ?? "Đơn vị"} ·{" "}
                    {monthLabel(data.periodMonth).toLowerCase()}
                  </h2>
                  <Badge
                    variant="secondary"
                    className={cn("font-normal", DAY_STATUS_CLASS[data.status])}
                  >
                    {stagedStatusLabel(data)}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  Thẩm định bởi{" "}
                  <strong className="font-medium text-foreground">
                    {data.departmentName}
                  </strong>
                  {finalScore !== null
                    ? ` · sau thẩm định ${formatScore(finalScore)}`
                    : ""}
                  {unit?.proposedRating ? ` · ${unit.proposedRating}` : ""}
                  {data.sentAt
                    ? ` · trình lúc ${formatServerHm(data.sentAt)}`
                    : ""}
                </p>
              </div>
              {decidable ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className={RETURN_BUTTON_CLASS}
                    onClick={() => setDialog("RETURN")}
                  >
                    <Undo2 className="size-4" aria-hidden="true" />
                    Trả lại
                  </Button>
                  <Button type="button" onClick={() => setDialog("APPROVE")}>
                    <Check className="size-4" aria-hidden="true" />
                    Duyệt
                  </Button>
                </div>
              ) : null}
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

            <AppraisalWorkspace
              units={data.units}
              criteria={[]}
              editable={false}
              exportInfo={{
                periodMonth: data.periodMonth,
                teamName: data.departmentName,
                leaderName: data.leaderName,
                commanderName: data.commanderName,
                statusLabel: stagedStatusLabel(data),
              }}
            />

            <div className="grid gap-3 border-t pt-4 text-center text-sm sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Lãnh đạo phụ trách
                </p>
                <p className="mt-1 font-medium">{data.leaderName || "-"}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Chỉ huy đội
                </p>
                <p className="mt-1 font-medium">{data.commanderName || "-"}</p>
              </div>
            </div>
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
                ? "Trả lại đơn vị thẩm định?"
                : "Duyệt đơn vị thẩm định?"}
            </DialogTitle>
            <DialogDescription>
              {unit?.departmentName} -{" "}
              {data ? monthLabel(data.periodMonth).toLowerCase() : ""} (đội{" "}
              {data?.departmentName}). Chỉ quyết riêng đơn vị này.
              {dialog === "APPROVE" &&
              data?.finalRecipientName &&
              data.stage !== "FINAL"
                ? ` Đây là duyệt cấp 1 - duyệt xong chuyển lên ${data.finalRecipientName} duyệt cuối.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          {dialog === "RETURN" ? (
            <div className="space-y-1.5">
              <Label htmlFor="appraisal-return-reason">
                Lý do trả lại <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="appraisal-return-reason"
                value={reason}
                rows={3}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Nêu rõ đơn vị / nội dung cần sửa…"
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
