"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import {
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Loader2,
  Save,
  Send,
  TriangleAlert,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  appraisalKeys,
  fetchAppraisal,
  saveAppraisal,
  sendAppraisal,
  unitComplete,
  type AppraisalUnit,
} from "@/features/team-report/appraisal";
import { AppraisalWorkspace } from "@/features/team-report/components/appraisal-workspace";
import {
  SummaryRecipientFields,
  hasInactiveUnit,
} from "@/features/team-report/components/summary-recipient-fields";
import { ApprovalChain } from "@/features/team-report/components/participants-block";
import { DAY_STATUS_CLASS } from "@/features/team-report/status-styles";
import { stagedStatusLabel } from "@/features/team-report/types";
import { useServerTime } from "@/hooks/use-server-time";
import { getApiErrorMessage } from "@/lib/api-client";
import { formatServerHm, serverYmd } from "@/lib/server-time";
import { cn } from "@/lib/utils";

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const index = y! * 12 + (m! - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

function monthLabel(month: string): string {
  const [y, m] = month.split("-");
  return `Tháng ${m}/${y}`;
}

/**
 * "Phụ lục theo dõi, thẩm định tháng" của đội PV01 - tài khoản duyệt của đội
 * thẩm định lại kết quả tự chấm của các đơn vị mình theo dõi, tháng một bản,
 * rồi trình theo luồng (mặc định về Đội CNTT duyệt).
 *
 * Giữ bản nháp ở màn hình và lưu bằng nút, không tự lưu từng ô: cả bảng là
 * một văn bản, lưu nửa chừng giữa hai đơn vị là ra một bản không ai định có.
 */
export function TeamReportAppraisalView() {
  const { ready } = useServerTime();
  const [pickedMonth, setPickedMonth] = useState<string | null>(null);
  const month = pickedMonth ?? (ready ? serverYmd().slice(0, 7) : "");
  const thisMonth = ready ? serverYmd().slice(0, 7) : "";

  const { data, error, isLoading, mutate } = useSWR(
    month ? appraisalKeys.sheet(month) : null,
    () => fetchAppraisal(month),
    { revalidateOnFocus: false },
  );

  const [draft, setDraft] = useState<AppraisalUnit[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [leaderName, setLeaderName] = useState("");
  const [commanderName, setCommanderName] = useState("");
  const [nameError, setNameError] = useState(false);

  // Đổi tháng là bỏ bản nháp của tháng cũ.
  const [draftMonth, setDraftMonth] = useState(month);
  if (draftMonth !== month) {
    setDraftMonth(month);
    setDraft(null);
  }

  const dirty = draft !== null;
  const units = draft ?? data?.units ?? [];
  const editable = !!data?.canEdit;

  // Rời trang khi còn thay đổi chưa lưu - hỏi lại.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const persist = async (names?: { leader: string; commander: string }) => {
    if (!data) return null;
    const saved = await saveAppraisal(month, {
      version: data._id ? data.version : undefined,
      leaderName: names?.leader ?? data.leaderName,
      commanderName: names?.commander ?? data.commanderName,
      units,
    });
    setDraft(null);
    await mutate();
    return saved;
  };

  const save = async () => {
    setSaving(true);
    try {
      await persist();
      toast.success("Đã lưu bảng thẩm định.");
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Không lưu được."));
    } finally {
      setSaving(false);
    }
  };

  const openSend = () => {
    setLeaderName(data?.leaderName ?? "");
    setCommanderName(data?.commanderName ?? "");
    setNameError(false);
    setSendOpen(true);
  };

  const incomplete = units.filter((unit) => !unitComplete(unit));

  /*
    Trình chỉ mở khi bảng ĐÃ LƯU và đủ ô bắt buộc (tự chấm + xếp loại của mọi
    đơn vị). Trước đây chỉ chặn trong hộp trình - bấm được nút rồi mới biết
    thiếu, mà bản trình đi là bản đang lưu chứ không phải bản trên màn.
    Nói rõ lý do ngay cạnh nút: nút xám không lời là người ta bấm thử mãi.
  */
  const sendBlocker = !units.length
    ? "Chưa có đơn vị nào để trình."
    : incomplete.length
      ? `Còn ${incomplete.length} đơn vị chưa đủ tự chấm / xếp loại.`
      : dirty || !data?._id
        ? "Lưu nháp trước rồi mới trình."
        : null;

  const send = async () => {
    if (!leaderName.trim() || !commanderName.trim()) {
      setNameError(true);
      return;
    }
    setSaving(true);
    try {
      // Lưu luôn bản đang sửa + hai tên ký, rồi mới trình.
      await persist({ leader: leaderName.trim(), commander: commanderName.trim() });
      await sendAppraisal(month);
      await mutate();
      setSendOpen(false);
      toast.success("Đã trình bảng thẩm định.");
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Không trình được."));
    } finally {
      setSaving(false);
    }
  };

  const status = data?._id ? data.status : null;
  const routeUnits = data?.route.units ?? null;
  const leadName =
    routeUnits?.find((unit) => unit.role === "LEAD")?.fullName ?? "";

  return (
    <div className="space-y-4">
      <Card className="shadow-sm">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ClipboardCheck className="size-5" />
            </span>
            <div>
              <h1 className="font-display text-xl font-semibold tracking-tight">
                Thẩm định KPI các đơn vị
              </h1>
              <p className="text-sm text-muted-foreground">
                Phụ lục theo dõi, thẩm định tháng - mỗi đơn vị một khối: tự
                chấm + cộng − trừ = điểm sau thẩm định.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={!month}
              onClick={() => setPickedMonth(shiftMonth(month, -1))}
              aria-label="Tháng trước"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <div className="min-w-[9rem] rounded-md border bg-background px-3 py-2 text-center text-sm font-medium tabular-nums">
              {month ? monthLabel(month) : "…"}
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={!month || month >= thisMonth}
              onClick={() => setPickedMonth(shiftMonth(month, 1))}
              aria-label="Tháng sau"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {getApiErrorMessage(error, "Không tải được bảng thẩm định.")}
        </p>
      ) : null}

      {isLoading || !data ? (
        error ? null : (
          <Skeleton className="h-96 w-full" />
        )
      ) : (
        <Card className="shadow-sm">
          <CardContent className="space-y-4 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant="secondary"
                  className={cn(
                    "font-normal",
                    status ? DAY_STATUS_CLASS[status] : "",
                  )}
                >
                  {status
                    ? status === "DRAFT"
                      ? "Nháp"
                      : stagedStatusLabel(data)
                    : "Chưa lưu"}
                </Badge>
                {data.updatedAt && !dirty ? (
                  <span className="text-xs text-muted-foreground">
                    Lưu lần cuối {formatServerHm(data.updatedAt)}
                  </span>
                ) : null}
                {dirty ? (
                  <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
                    Có thay đổi chưa lưu
                  </span>
                ) : null}
                {editable && leadName ? (
                  <span className="text-xs text-muted-foreground">
                    · Trình tới{" "}
                    <strong className="font-medium text-foreground">
                      {leadName}
                    </strong>
                    {data.route.finalReviewer
                      ? ` → duyệt cuối ${data.route.finalReviewer.fullName}`
                      : ""}
                  </span>
                ) : null}
              </div>
              {editable ? (
                <div className="flex flex-wrap items-center gap-2">
                  {dirty ? (
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={saving}
                      onClick={() => setDraft(null)}
                    >
                      Bỏ thay đổi
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    disabled={
                      saving || (!dirty && (!!data._id || !units.length))
                    }
                    onClick={() => void save()}
                  >
                    {saving ? (
                      <Loader2
                        className="size-4 motion-safe:animate-spin"
                        aria-hidden="true"
                      />
                    ) : (
                      <Save className="size-4" aria-hidden="true" />
                    )}
                    Lưu nháp
                  </Button>
                  {sendBlocker ? (
                    <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
                      {sendBlocker}
                    </span>
                  ) : null}
                  <Button
                    type="button"
                    disabled={saving || !!sendBlocker}
                    onClick={openSend}
                  >
                    <Send className="size-4" aria-hidden="true" />
                    {status === "RETURNED" ? "Trình lại" : "Trình duyệt"}
                  </Button>
                </div>
              ) : null}
            </div>

            {status && status !== "DRAFT" ? (
              <ApprovalChain
                status={data.status}
                leadName={data.recipientName}
                finalName={data.finalRecipientName}
                stage={data.stage}
                firstApproval={data.firstApproval}
              />
            ) : null}
            {status === "PENDING" || status === "APPROVED" ? (
              <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                {status === "PENDING"
                  ? `Đã trình ${data.recipientName}${
                      data.sentAt ? ` lúc ${formatServerHm(data.sentAt)}` : ""
                    } - đang chờ duyệt, bảng khoá cho tới khi được duyệt hoặc trả lại.`
                  : `${data.decidedByName || "Cấp trên"} đã duyệt${
                      data.decidedAt
                        ? ` lúc ${formatServerHm(data.decidedAt)}`
                        : ""
                    }. Bảng tháng này đã chốt.`}
              </p>
            ) : null}
            {status === "RETURNED" ? (
              <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                <strong className="font-semibold">Bị trả lại:</strong>{" "}
                {data.returnReason || "không nêu lý do"} - sửa rồi bấm Trình
                lại.
              </p>
            ) : null}

            <AppraisalWorkspace
              units={units}
              criteria={data.criteria}
              editable={editable}
              hints={data.selfScoreHints}
              suggestedUnits={data.suggestedUnits}
              newlyApprovedIds={data.newlyApprovedIds}
              onChange={setDraft}
              exportInfo={{
                periodMonth: month,
                teamName: data.departmentName,
                leaderName: data.leaderName,
                commanderName: data.commanderName,
                statusLabel: status
                  ? status === "DRAFT"
                    ? "Nháp"
                    : stagedStatusLabel(data)
                  : "Chưa lưu",
              }}
            />

            {data._id && (data.leaderName || data.commanderName) ? (
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
                  <p className="mt-1 font-medium">
                    {data.commanderName || "-"}
                  </p>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}

      <Dialog open={sendOpen} onOpenChange={setSendOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Trình bảng thẩm định {monthLabel(month).toLowerCase()}</DialogTitle>
            <DialogDescription>
              {units.length} đơn vị. Bảng khoá lại cho tới khi được duyệt hoặc
              trả lại.
            </DialogDescription>
          </DialogHeader>

          {incomplete.length ? (
            <div
              role="alert"
              className="space-y-1 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
            >
              <p className="flex items-center gap-1.5 font-medium">
                <TriangleAlert className="size-4" aria-hidden="true" />
                {incomplete.length} đơn vị chưa đủ tự chấm / xếp loại
              </p>
              <p className="text-xs">
                {incomplete
                  .slice(0, 5)
                  .map((unit) => unit.departmentName)
                  .join("; ")}
                {incomplete.length > 5 ? `; và ${incomplete.length - 5} đơn vị khác` : ""}
              </p>
            </div>
          ) : null}

          {routeUnits ? (
            <SummaryRecipientFields
              idPrefix="appraisal"
              recipients={[]}
              units={routeUnits}
              finalReviewer={data?.route.finalReviewer}
              recipientId=""
              onRecipientChange={() => undefined}
            />
          ) : (
            <p
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              Chưa có luồng trình bảng thẩm định cho tài khoản này - báo quản
              trị cấu hình ở Luồng trình báo cáo → tab Thẩm định KPI.
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="appraisal-leader">
                Lãnh đạo phụ trách <span className="text-destructive">*</span>
              </Label>
              <Input
                id="appraisal-leader"
                value={leaderName}
                aria-invalid={nameError && !leaderName.trim()}
                onChange={(event) => setLeaderName(event.target.value)}
                placeholder="Họ và tên"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="appraisal-commander">
                Chỉ huy đội <span className="text-destructive">*</span>
              </Label>
              <Input
                id="appraisal-commander"
                value={commanderName}
                aria-invalid={nameError && !commanderName.trim()}
                onChange={(event) => setCommanderName(event.target.value)}
                placeholder="Họ và tên"
              />
            </div>
          </div>
          {nameError && (!leaderName.trim() || !commanderName.trim()) ? (
            <p role="alert" className="text-xs text-destructive">
              Nhập đủ hai người ký trước khi trình.
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setSendOpen(false)}
            >
              Huỷ
            </Button>
            <Button
              type="button"
              disabled={
                saving ||
                incomplete.length > 0 ||
                !routeUnits ||
                hasInactiveUnit(routeUnits, data?.route.finalReviewer)
              }
              onClick={() => void send()}
            >
              {saving ? (
                <Loader2
                  className="size-4 motion-safe:animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <Send className="size-4" aria-hidden="true" />
              )}
              Trình duyệt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
