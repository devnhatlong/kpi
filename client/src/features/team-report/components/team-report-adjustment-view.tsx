"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  History,
  Loader2,
  RefreshCw,
  Scale,
  Send,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";

import { SearchableSelect } from "@/components/common/searchable-select";
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
import { Textarea } from "@/components/ui/textarea";
import {
  addTeamReportAdjustmentEntry,
  fetchTeamReportAdjustments,
  fetchTeamReportRecipients,
  removeTeamReportAdjustmentEntry,
  sendTeamReportAdjustment,
  teamReportKeys,
  updateTeamReportAdjustmentEntry,
} from "@/features/team-report/api";
import {
  ADJUSTMENT_SECTIONS_UI,
  AdjustmentSectionTable,
} from "@/features/team-report/components/team-report-adjustment-table";
import { DAY_STATUS_CLASS } from "@/features/team-report/status-styles";
import {
  TEAM_REPORT_STATUS_LABEL,
  formatScore,
  type TeamReportAdjustmentEntry,
  type TeamReportAdjustmentItem,
  type TeamReportColumn,
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
 * "Bảng đề xuất điểm cộng, điểm trừ và điều chỉnh, khống chế mức xếp loại" -
 * đội tự điền, THÁNG MỘT BẢN, rồi trình lên cấp trên như báo cáo tổng hợp.
 *
 * Bộ cột của từng phần lấy từ mẫu bảng quản trị dựng (mẫu gắn `forAdjustment`).
 * Bảng chi tiết nằm ở `AdjustmentSectionTable`, dùng chung với màn duyệt.
 */
export function TeamReportAdjustmentView() {
  const { ready } = useServerTime();
  const [pickedMonth, setPickedMonth] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [cellErrors, setCellErrors] = useState<Record<string, string>>({});
  const [sendOpen, setSendOpen] = useState(false);
  const [recipientId, setRecipientId] = useState("");
  const [sendNote, setSendNote] = useState("");
  const [sending, setSending] = useState(false);

  const month = pickedMonth ?? (ready ? serverYmd().slice(0, 7) : "");

  const { data, error, isLoading, mutate } = useSWR(
    month ? teamReportKeys.adjustments(month) : null,
    () => fetchTeamReportAdjustments(month),
    { revalidateOnFocus: false, keepPreviousData: true },
  );

  const sheet = data?.sheet;
  const totals = data?.totals;
  const templates = data?.templates;
  const scoreKeys = data?.scoreColumnKeys;
  const catalog = useMemo(() => data?.catalog ?? [], [data]);
  const months = useMemo(() => new Set(data?.months ?? []), [data]);

  const entriesByItem = useMemo(() => {
    const map = new Map<string, TeamReportAdjustmentEntry[]>();
    for (const entry of sheet?.entries ?? []) {
      map.set(entry.itemId, [...(map.get(entry.itemId) ?? []), entry]);
    }
    return map;
  }, [sheet]);

  /* Ghi thẳng kết quả server trả vào cache; danh mục và danh sách tháng thì
     server không gửi lại ở lượt ghi, giữ từ lần đọc. */
  const applyResult = async (
    result: Omit<NonNullable<typeof data>, "catalog" | "months">,
  ) => {
    await mutate(
      {
        ...result,
        catalog,
        months: [...new Set([...(data?.months ?? []), month])],
      },
      { revalidate: false },
    );
    if (result.sheet.updatedAt) {
      setSavedAt(formatServerHm(result.sheet.updatedAt));
    }
  };

  const fail = async (error: unknown, key: string) => {
    const message = getApiErrorMessage(error, "Không lưu được.");
    setCellErrors((prev) => ({ ...prev, [key]: message }));
    toast.error(message);
    if (
      (error as { response?: { status?: number } })?.response?.status === 409
    ) {
      await mutate();
    }
  };

  const clearError = (key: string) =>
    setCellErrors((prev) => {
      if (!(key in prev)) return prev;
      const rest = { ...prev };
      delete rest[key];
      return rest;
    });

  const run = async (key: string, work: () => Promise<void>) => {
    if (!sheet) return;
    setBusyKey(key);
    try {
      await work();
      clearError(key);
    } catch (error) {
      await fail(error, key);
    } finally {
      setBusyKey(null);
    }
  };

  const addLine = (item: TeamReportAdjustmentItem) =>
    run(`add:${item._id}`, async () => {
      await applyResult(
        await addTeamReportAdjustmentEntry(month, {
          version: sheet!.version,
          itemId: item._id,
        }),
      );
    });

  const saveCell = (
    entry: TeamReportAdjustmentEntry,
    column: TeamReportColumn,
    next: string,
  ) =>
    run(`${entry._id}:${column.key}`, async () => {
      await applyResult(
        await updateTeamReportAdjustmentEntry(month, entry._id, {
          version: sheet!.version,
          fieldValues: { [column.key]: next },
        }),
      );
    });

  const removeLine = (entry: TeamReportAdjustmentEntry) =>
    run(`del:${entry._id}`, async () => {
      await applyResult(
        await removeTeamReportAdjustmentEntry(month, entry._id, sheet!.version),
      );
    });

  /*
    Đội chỉ sửa được khi bản còn NHÁP hoặc BỊ TRẢ LẠI - đã trình là cấp trên
    đang cầm, cùng luật với báo cáo tổng hợp. Server chặn y hệt
    (`assertTeamEditable`); ở đây chỉ để khỏi bày ô gõ được rồi bị từ chối.
  */
  const status = sheet?.status ?? "DRAFT";
  const editable = status === "DRAFT" || status === "RETURNED";
  const canSend = editable && (sheet?.entries.length ?? 0) > 0;

  const { data: recipients = [] } = useSWR(
    sendOpen ? teamReportKeys.recipients() : null,
    () => fetchTeamReportRecipients(),
  );

  const send = async () => {
    if (!sheet || !recipientId) return;
    setSending(true);
    try {
      await applyResult(
        await sendTeamReportAdjustment(month, {
          version: sheet.version,
          recipientId,
          note: sendNote.trim() || undefined,
        }),
      );
      setSendOpen(false);
      setSendNote("");
      toast.success("Đã trình bảng lên cấp trên.");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không trình được."));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="shadow-sm">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Scale className="size-5" />
            </span>
            <div>
              <h1 className="font-display text-xl font-semibold tracking-tight">
                Đề xuất điểm cộng, điểm trừ và xếp loại
              </h1>
              <p className="text-sm text-muted-foreground">
                Bảng đề xuất theo tháng - mỗi tháng một bảng, thêm dòng kết quả
                dưới từng mục rồi ghi điểm đề xuất. Mỗi ô tự lưu khi rời ô.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {busyKey ? (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" />
                Đang lưu
              </span>
            ) : savedAt ? (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Check className="size-3 text-emerald-600" />
                Đã lưu lúc {savedAt}
              </span>
            ) : null}
            {sheet?.saved ? (
              <Badge
                variant="secondary"
                className={cn(
                  "whitespace-nowrap font-normal",
                  DAY_STATUS_CLASS[status],
                )}
              >
                {status === "DRAFT" ? "Nháp" : TEAM_REPORT_STATUS_LABEL[status]}
              </Badge>
            ) : null}
            <Button
              type="button"
              variant="outline"
              className="bg-background"
              onClick={() => void mutate()}
            >
              <RefreshCw className="size-4" />
              Làm mới
            </Button>
            {canSend ? (
              <Button
                type="button"
                disabled={busyKey !== null}
                onClick={() => {
                  setRecipientId(sheet?.recipientId ?? "");
                  setSendOpen(true);
                }}
              >
                <Send className="size-4" />
                {status === "RETURNED" ? "Trình lại" : "Trình cấp trên"}
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {/* Bản đang ở đâu và vì sao khoá - đội nhìn là biết, khỏi bấm thử. */}
      {sheet?.saved && status !== "DRAFT" ? (
        <p
          className={cn(
            "rounded-md border px-3 py-2.5 text-sm",
            status === "RETURNED"
              ? "border-destructive/40 bg-destructive/5 text-destructive"
              : "bg-muted/40",
          )}
        >
          {status === "PENDING"
            ? `Đã trình ${sheet.recipientName ?? "cấp trên"}${
                sheet.sentAt ? ` lúc ${formatServerHm(sheet.sentAt)}` : ""
              } - đang chờ duyệt, bảng khoá cho tới khi được duyệt hoặc trả lại.`
            : status === "APPROVED"
              ? `${sheet.decidedByName || "Cấp trên"} đã duyệt${
                  sheet.decidedAt
                    ? ` lúc ${formatServerHm(sheet.decidedAt)}`
                    : ""
                }. Bảng tháng này đã chốt.`
              : `Cấp trên trả lại: ${
                  sheet.returnReason || "không nêu lý do"
                } - sửa rồi bấm Trình lại.`}
        </p>
      ) : null}

      <Card className="shadow-sm">
        <CardContent className="space-y-5 py-4">
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
            <div className="min-w-[10rem] rounded-md border bg-background px-3 py-2 text-center text-sm font-medium tabular-nums">
              {month ? monthLabel(month) : "…"}
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="bg-background"
              disabled={!month}
              onClick={() => setPickedMonth(shiftMonth(month, 1))}
              aria-label="Tháng sau"
            >
              <ChevronRight className="size-4" />
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={!ready}
              onClick={() => setPickedMonth(null)}
            >
              Tháng này
            </Button>
            {sheet ? (
              <Badge variant="secondary" className="font-normal">
                {sheet.saved
                  ? `${sheet.entries.length} dòng · sửa lần cuối ${
                      sheet.updatedAt ? formatServerHm(sheet.updatedAt) : ""
                    }`
                  : "Tháng này chưa nhập"}
              </Badge>
            ) : null}

            {totals ? (
              <div className="ml-auto flex flex-wrap items-center gap-2 text-sm tabular-nums">
                <span className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
                  Cộng <strong>+{formatScore(totals.bonus)}</strong>
                </span>
                <span className="rounded-md border border-rose-300 bg-rose-50 px-3 py-1.5 text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
                  Trừ <strong>−{formatScore(totals.penalty)}</strong>
                </span>
                <span className="rounded-md border bg-muted/40 px-3 py-1.5">
                  Chênh lệch{" "}
                  <strong>
                    {totals.net > 0 ? "+" : ""}
                    {formatScore(totals.net)}
                  </strong>
                </span>
              </div>
            ) : null}
          </div>

          {months.size ? (
            <p className="text-xs text-muted-foreground">
              Đã nhập:{" "}
              {[...months]
                .sort()
                .reverse()
                .slice(0, 12)
                .map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setPickedMonth(item)}
                    className={cn(
                      "mr-1.5 cursor-pointer rounded border px-1.5 py-0.5 tabular-nums hover:bg-muted/60",
                      item === month && "border-primary text-primary",
                    )}
                  >
                    {item.slice(5)}/{item.slice(0, 4)}
                  </button>
                ))}
            </p>
          ) : null}

          {error ? (
            /* 403 là chuyện thường ở đây: ai được nhập do quản trị đặt. Nói
               thẳng lý do server trả, không phải "không tải được". */
            <p className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              <TriangleAlert className="size-4 shrink-0" />
              {getApiErrorMessage(error, "Không mở được bảng này.")}
            </p>
          ) : isLoading && !data ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Đang tải...
            </p>
          ) : !catalog.length ? (
            <p className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              <TriangleAlert className="size-4 shrink-0" />
              Danh mục điểm cộng, trừ &amp; xếp loại đang trống - quản trị cần
              khai ở Cấu hình form nhiệm vụ trước.
            </p>
          ) : (
            ADJUSTMENT_SECTIONS_UI.map((section) => (
              <AdjustmentSectionTable
                key={section.key}
                section={section}
                template={templates?.[section.key] ?? null}
                scoreKey={scoreKeys?.[section.key] ?? null}
                items={catalog.filter((item) => item.section === section.key)}
                entriesByItem={entriesByItem}
                sheetVersion={sheet?.version ?? 0}
                sectionTotal={
                  section.key === "BONUS"
                    ? (totals?.bonus ?? 0)
                    : section.key === "PENALTY"
                      ? (totals?.penalty ?? 0)
                      : null
                }
                busyKey={busyKey}
                cellErrors={cellErrors}
                onAdd={addLine}
                onSave={saveCell}
                onRemove={removeLine}
                mode={editable ? "edit" : "read"}
                catalogs={{ department: data?.departmentChoices ?? [] }}
              />
            ))
          )}

          {sheet?.edits?.length ? (
            <div className="space-y-2">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <History className="size-4" />
                Nhật ký thay đổi
                <Badge variant="secondary" className="font-normal">
                  {sheet.edits.length} lượt
                </Badge>
              </h3>
              <ul className="max-h-64 divide-y overflow-y-auto rounded-md border text-sm">
                {[...sheet.edits].reverse().map((edit, index) => (
                  <li
                    key={`${edit.at}-${index}`}
                    className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2"
                  >
                    <span className="font-medium">{edit.byName}</span>
                    <span className="min-w-0 flex-1 break-words text-muted-foreground">
                      {edit.field}:{" "}
                      {edit.from ? (
                        <>
                          <span className="line-through">{edit.from}</span>
                          {" → "}
                        </>
                      ) : null}
                      <strong className="text-foreground">{edit.to}</strong>
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {formatServerHm(edit.at)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={sendOpen} onOpenChange={setSendOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Trình bảng {month ? monthLabel(month).toLowerCase() : ""}
            </DialogTitle>
            <DialogDescription>
              {sheet?.entries.length ?? 0} dòng · cộng +
              {formatScore(totals?.bonus ?? 0)} · trừ −
              {formatScore(totals?.penalty ?? 0)}
              {status === "RETURNED" ? (
                <>
                  {" · "}
                  <span className="text-destructive">
                    đã bị trả lại: {sheet?.returnReason || "không nêu lý do"}
                  </span>
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <p className="text-sm font-medium">
                Trình lên <span className="text-destructive">*</span>
              </p>
              <SearchableSelect
                value={recipientId}
                onValueChange={setRecipientId}
                options={recipients.map((person) => ({
                  value: person.id,
                  label: person.departmentName
                    ? `${person.fullName} - ${person.departmentName}`
                    : person.fullName,
                }))}
                placeholder={
                  recipients.length
                    ? "Chọn cấp trên..."
                    : "Chưa tìm được cấp trên nào có quyền duyệt"
                }
              />
            </div>
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Ghi chú gửi kèm</p>
              <Textarea
                value={sendNote}
                onChange={(event) => setSendNote(event.target.value)}
                rows={3}
                placeholder="Không bắt buộc"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Trình xong bảng khoá lại cho tới khi được duyệt hoặc trả lại -
              cùng luật với báo cáo tổng hợp.
            </p>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setSendOpen(false)}>
              Huỷ
            </Button>
            <Button
              disabled={sending || !recipientId}
              onClick={() => void send()}
            >
              <Send className="size-4" />
              Trình cấp trên
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
