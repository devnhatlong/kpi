"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import {
  ChevronLeft,
  ChevronRight,
  FileDown,
  Loader2,
  Megaphone,
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  commendationKeys,
  commendationRowComplete,
  fetchCommendation,
  saveCommendation,
  sendCommendation,
  type CommendationDepartmentChoice,
  type CommendationRow,
} from "@/features/team-report/commendation";
import {
  exportCommendationToExcel,
  type CommendationExportRow,
} from "@/features/team-report/commendation-excel";
import { CommendationTables } from "@/features/team-report/components/commendation-tables";
import { ApprovalChain } from "@/features/team-report/components/participants-block";
import {
  SummaryRecipientFields,
  hasInactiveUnit,
} from "@/features/team-report/components/summary-recipient-fields";
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
 * Dòng in ra Excel. Đơn vị: phòng in MÃ (PC03), cấp xã giữ tên - như mẫu.
 * Dòng đã lưu dùng tên gọn server trả; dòng chưa lưu tra từ danh mục chọn.
 */
export function commendationExportRows(
  rows: CommendationRow[],
  choices: CommendationDepartmentChoice[],
): CommendationExportRow[] {
  const byId = new Map(choices.map((choice) => [choice.id, choice]));
  return rows.map((row) => ({
    itemId: row.itemId,
    itemName: row.itemName,
    units: row.departmentIds
      .map((id, index) => {
        const choice = byId.get(id);
        if (choice) return choice.group === "Phòng" ? choice.code : choice.name;
        return (
          row.departmentShortNames?.[index] ?? row.departmentNames[index] ?? ""
        );
      })
      .filter(Boolean)
      .join(", "),
    content: row.content,
    evidence: row.evidence,
    note: row.note,
  }));
}

/**
 * "Bảng đề xuất biểu dương, phê bình" tháng của PHÒNG - chỉ trưởng phòng lập
 * (luồng COMMENDATION, cấp xã không có), gửi các đội Phòng Tham mưu theo dõi:
 * một đội chủ trì duyệt / trả lại, các đội khác nhận để biết.
 *
 * Giữ bản nháp trên màn và lưu bằng nút như bảng thẩm định: cả bảng là một
 * văn bản, lưu nửa chừng từng ô là ra một bản không ai định có.
 */
export function TeamReportCommendationView() {
  const { ready } = useServerTime();
  const [pickedMonth, setPickedMonth] = useState<string | null>(null);
  const month = pickedMonth ?? (ready ? serverYmd().slice(0, 7) : "");
  const thisMonth = ready ? serverYmd().slice(0, 7) : "";

  const { data, error, isLoading, mutate } = useSWR(
    month ? commendationKeys.sheet(month) : null,
    () => fetchCommendation(month),
    { revalidateOnFocus: false },
  );

  const [draft, setDraft] = useState<{
    praises: CommendationRow[];
    criticisms: CommendationRow[];
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Đổi tháng là bỏ bản nháp của tháng cũ.
  const [draftMonth, setDraftMonth] = useState(month);
  if (draftMonth !== month) {
    setDraftMonth(month);
    setDraft(null);
  }

  const dirty = draft !== null;
  const praises = draft?.praises ?? data?.praises ?? [];
  const criticisms = draft?.criticisms ?? data?.criticisms ?? [];
  const editable = !!data?.canEdit;

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const save = async () => {
    if (!data) return;
    setSaving(true);
    try {
      await saveCommendation(month, {
        version: data._id ? data.version : undefined,
        praises,
        criticisms,
      });
      setDraft(null);
      await mutate();
      toast.success("Đã lưu bảng biểu dương, phê bình.");
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Không lưu được."));
    } finally {
      setSaving(false);
    }
  };

  /* Dòng đang nhập dở (chưa đơn vị / nội dung) - chặn gửi, nói rõ bao nhiêu. */
  const incomplete =
    praises.filter((row) => !commendationRowComplete(row, true)).length +
    criticisms.filter((row) => !commendationRowComplete(row, false)).length;
  const rowCount = praises.length + criticisms.length;
  const sendBlocker = !rowCount
    ? "Chưa có dòng biểu dương hay phê bình nào."
    : incomplete
      ? `Còn ${incomplete} dòng chưa đủ đơn vị / nội dung.`
      : dirty || !data?._id
        ? "Lưu nháp trước rồi mới gửi."
        : null;

  const send = async () => {
    setSaving(true);
    try {
      await sendCommendation(month);
      await mutate();
      setSendOpen(false);
      toast.success("Đã gửi bảng tới các đội Phòng Tham mưu.");
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Không gửi được."));
    } finally {
      setSaving(false);
    }
  };

  const exportExcel = async () => {
    if (!data) return;
    setExporting(true);
    try {
      await exportCommendationToExcel({
        periodMonth: month,
        unitName: data.departmentName,
        criteria: data.criteria,
        praises: commendationExportRows(praises, data.departmentChoices),
        criticisms: commendationExportRows(criticisms, data.departmentChoices),
      });
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Không xuất được Excel."));
    } finally {
      setExporting(false);
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
              <Megaphone className="size-5" />
            </span>
            <div>
              <h1 className="font-display text-xl font-semibold tracking-tight">
                Đề xuất biểu dương, phê bình
              </h1>
              <p className="text-sm text-muted-foreground">
                Nội dung biểu dương, phê bình, chấn chỉnh Công an các đơn vị,
                địa phương - mỗi tháng một bảng, gửi các đội Phòng Tham mưu theo
                dõi.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="bg-background"
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
              className="bg-background"
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
          {getApiErrorMessage(error, "Không tải được bảng.")}
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
                <span className="text-xs text-muted-foreground">
                  {data.departmentName}
                </span>
                {data.updatedAt && !dirty ? (
                  <span className="text-xs text-muted-foreground">
                    · Lưu lần cuối {formatServerHm(data.updatedAt)}
                  </span>
                ) : null}
                {dirty ? (
                  <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
                    Có thay đổi chưa lưu
                  </span>
                ) : null}
                {editable && leadName ? (
                  <span className="text-xs text-muted-foreground">
                    · Gửi tới{" "}
                    <strong className="font-medium text-foreground">
                      {leadName}
                    </strong>{" "}
                    duyệt
                    {routeUnits && routeUnits.length > 1
                      ? `, ${routeUnits.length - 1} đội theo dõi`
                      : ""}
                  </span>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="bg-background"
                  disabled={exporting || !rowCount}
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
                {editable ? (
                  <>
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
                      className="bg-background"
                      disabled={saving || !dirty}
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
                      onClick={() => setSendOpen(true)}
                    >
                      <Send className="size-4" aria-hidden="true" />
                      {status === "RETURNED" ? "Gửi lại" : "Gửi"}
                    </Button>
                  </>
                ) : null}
              </div>
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
                  ? `Đã gửi ${data.recipientName}${
                      data.sentAt ? ` lúc ${formatServerHm(data.sentAt)}` : ""
                    } - đang chờ duyệt, bảng khoá cho tới khi được duyệt hoặc trả lại.`
                  : `${data.decidedByName || "Đội chủ trì"} đã duyệt${
                      data.decidedAt
                        ? ` lúc ${formatServerHm(data.decidedAt)}`
                        : ""
                    }. Bảng tháng này đã chốt.`}
              </p>
            ) : null}
            {status === "RETURNED" ? (
              <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                <strong className="font-semibold">Bị trả lại:</strong>{" "}
                {data.returnReason || "không nêu lý do"} - sửa, lưu rồi bấm Gửi
                lại.
              </p>
            ) : null}

            <CommendationTables
              praises={praises}
              criticisms={criticisms}
              criteria={data.criteria}
              departmentChoices={data.departmentChoices}
              editable={editable}
              onChange={setDraft}
            />
          </CardContent>
        </Card>
      )}

      <Dialog open={sendOpen} onOpenChange={setSendOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              Gửi bảng biểu dương, phê bình{" "}
              {month ? monthLabel(month).toLowerCase() : ""}
            </DialogTitle>
            <DialogDescription>
              {praises.length} dòng biểu dương · {criticisms.length} dòng phê
              bình. Bảng khoá lại cho tới khi được duyệt hoặc trả lại.
            </DialogDescription>
          </DialogHeader>
          {routeUnits ? (
            <SummaryRecipientFields
              idPrefix="commendation"
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
              Chưa có luồng gửi bảng này cho tài khoản bạn - báo quản trị cấu
              hình ở Luồng trình báo cáo → tab Biểu dương, phê bình.
            </p>
          )}
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
              Gửi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
