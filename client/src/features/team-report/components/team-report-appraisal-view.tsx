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
  appraisalTotals,
  saveAppraisal,
  sendAppraisal,
  unitComplete,
  unitEditable,
  type AppraisalUnit,
} from "@/features/team-report/appraisal";
import { AppraisalWorkspace } from "@/features/team-report/components/appraisal-workspace";
import {
  SummaryRecipientFields,
  hasInactiveUnit,
} from "@/features/team-report/components/summary-recipient-fields";
import { Checkbox } from "@/components/ui/checkbox";
import { DAY_STATUS_CLASS } from "@/features/team-report/status-styles";
import {
  formatScore,
  type TeamReportDayStatus,
} from "@/features/team-report/types";
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

  /*
    Trình RIÊNG từng đơn vị. Đơn vị trình được = còn sửa được (chưa trình / bị
    trả lại) VÀ đủ ô bắt buộc (tự chấm + xếp loại). Đơn vị đã trình nằm yên,
    không cản các đơn vị khác.
  */
  const pendingUnits = units.filter(unitEditable);
  const readyUnits = pendingUnits.filter(unitComplete);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const openSend = () => {
    setLeaderName(data?.leaderName ?? "");
    setCommanderName(data?.commanderName ?? "");
    setNameError(false);
    // Mặc định chọn hết đơn vị đã đủ - phần lớn lượt trình là "trình hết".
    setPicked(new Set(readyUnits.map((unit) => unit.departmentId)));
    setSendOpen(true);
  };

  /*
    Nút trình chỉ mở khi bảng ĐÃ LƯU và có ít nhất một đơn vị đủ để trình -
    bản trình đi là bản đang lưu chứ không phải bản trên màn. Nói rõ lý do
    ngay cạnh nút: nút xám không lời là người ta bấm thử mãi.
  */
  const sendBlocker = !units.length
    ? "Chưa có đơn vị nào để trình."
    : dirty || !data?._id
      ? "Lưu nháp trước rồi mới trình."
      : !pendingUnits.length
        ? null
        : !readyUnits.length
          ? `Chưa đơn vị nào đủ tự chấm / xếp loại để trình.`
          : null;

  const send = async () => {
    if (!leaderName.trim() || !commanderName.trim()) {
      setNameError(true);
      return;
    }
    if (!picked.size) return;
    setSaving(true);
    try {
      await sendAppraisal(month, {
        departmentIds: [...picked],
        leaderName: leaderName.trim(),
        commanderName: commanderName.trim(),
      });
      await mutate();
      setSendOpen(false);
      toast.success(`Đã trình ${picked.size} đơn vị.`);
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Không trình được."));
    } finally {
      setSaving(false);
    }
  };

  /** Số đơn vị theo trạng thái - thay cho một trạng thái chung của cả bảng. */
  const counts = units.reduce(
    (acc, unit) => {
      acc[unit.status ?? "DRAFT"] += 1;
      return acc;
    },
    { DRAFT: 0, PENDING: 0, APPROVED: 0, RETURNED: 0 } as Record<
      TeamReportDayStatus,
      number
    >,
  );
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
                {!data._id ? (
                  <Badge variant="secondary" className="font-normal">
                    Chưa lưu
                  </Badge>
                ) : (
                  (
                    [
                      ["DRAFT", "Chưa trình"],
                      ["RETURNED", "Bị trả lại"],
                      ["PENDING", "Chờ duyệt"],
                      ["APPROVED", "Đã duyệt"],
                    ] as const
                  )
                    .filter(([key]) => counts[key] > 0)
                    .map(([key, label]) => (
                      <Badge
                        key={key}
                        variant="secondary"
                        className={cn(
                          "font-normal tabular-nums",
                          key === "DRAFT" ? "" : DAY_STATUS_CLASS[key],
                        )}
                      >
                        {label} {counts[key]}
                      </Badge>
                    ))
                )}
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
                    disabled={saving || !!sendBlocker || !readyUnits.length}
                    onClick={openSend}
                  >
                    <Send className="size-4" aria-hidden="true" />
                    Trình duyệt
                    {!sendBlocker && readyUnits.length
                      ? ` (${readyUnits.length})`
                      : ""}
                  </Button>
                </div>
              ) : null}
            </div>

            {counts.RETURNED > 0 ? (
              <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                <strong className="font-semibold">
                  {counts.RETURNED} đơn vị bị trả lại
                </strong>{" "}
                - mở từng đơn vị để xem lý do, sửa, lưu rồi trình lại.
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
            <DialogTitle>
              Trình thẩm định {monthLabel(month).toLowerCase()}
            </DialogTitle>
            <DialogDescription>
              Mỗi đơn vị được duyệt / trả lại riêng. Đơn vị đã trình khoá lại
              cho tới khi được duyệt hoặc trả lại; các đơn vị khác vẫn sửa
              được.
            </DialogDescription>
          </DialogHeader>

          {/* Chọn đơn vị trình lần này - chỉ bày đơn vị chưa trình / bị trả
              lại; đơn vị chưa đủ ô thì bày xám kèm lý do, không chọn được. */}
          <fieldset className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <legend className="text-sm font-medium">
                Đơn vị trình lần này{" "}
                <span className="font-normal text-muted-foreground tabular-nums">
                  ({picked.size}/{readyUnits.length})
                </span>
              </legend>
              {readyUnits.length > 1 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7"
                  onClick={() =>
                    setPicked(
                      picked.size === readyUnits.length
                        ? new Set()
                        : new Set(readyUnits.map((unit) => unit.departmentId)),
                    )
                  }
                >
                  {picked.size === readyUnits.length ? "Bỏ chọn hết" : "Chọn hết"}
                </Button>
              ) : null}
            </div>
            <ul className="max-h-64 divide-y overflow-y-auto rounded-md border">
              {pendingUnits.map((unit) => {
                const ready = unitComplete(unit);
                const checked = picked.has(unit.departmentId);
                const inputId = `send-unit-${unit.departmentId}`;
                return (
                  <li
                    key={unit.departmentId}
                    className={cn(
                      "flex items-start gap-2.5 px-3 py-2",
                      !ready && "opacity-60",
                    )}
                  >
                    <Checkbox
                      id={inputId}
                      checked={checked}
                      disabled={!ready}
                      className="mt-0.5"
                      onCheckedChange={(next) => {
                        const copy = new Set(picked);
                        if (next) copy.add(unit.departmentId);
                        else copy.delete(unit.departmentId);
                        setPicked(copy);
                      }}
                    />
                    <label
                      htmlFor={inputId}
                      className="min-w-0 flex-1 cursor-pointer text-sm"
                    >
                      <span className="block font-medium">
                        {unit.departmentName}
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {ready
                          ? `Sau thẩm định ${formatScore(
                              appraisalTotals(unit).finalScore ?? 0,
                            )} · ${unit.proposedRating}`
                          : "Chưa đủ tự chấm / xếp loại - chưa trình được"}
                        {unit.status === "RETURNED" ? " · trình lại" : ""}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </fieldset>

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
                !picked.size ||
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
              Trình {picked.size} đơn vị
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
