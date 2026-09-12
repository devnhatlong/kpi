"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import {
  Check,
  FileSpreadsheet,
  History,
  Inbox,
  Loader2,
  Scale,
  Search,
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SegmentedTabs } from "@/components/common/segmented-tabs";
import {
  decideTeamReportAdjustment,
  fetchIncomingTeamReportAdjustment,
  fetchTeamReportAdjustmentInbox,
  reviewTeamReportAdjustmentEntry,
  teamReportKeys,
} from "@/features/team-report/api";
import {
  ADJUSTMENT_SECTIONS_UI,
  AdjustmentSectionTable,
} from "@/features/team-report/components/team-report-adjustment-table";
import { DAY_STATUS_CLASS } from "@/features/team-report/status-styles";
import {
  TEAM_REPORT_STATUS_LABEL,
  formatScore,
  refName,
  type TeamReportAdjustmentData,
  type TeamReportAdjustmentEntry,
  type TeamReportAdjustmentInboxRow,
  type TeamReportColumn,
  type TeamReportDayStatus,
} from "@/features/team-report/types";
import { getApiErrorMessage } from "@/lib/api-client";
import { formatServerHm } from "@/lib/server-time";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 8;

type StatusFilter = TeamReportDayStatus | "ALL";

function monthLabel(month: string): string {
  const [y, m] = month.split("-");
  return `Tháng ${m}/${y}`;
}

/**
 * Hộp đến "Bảng đề xuất điểm cộng, điểm trừ & xếp loại" của cấp trên - danh
 * sách bên trái, bản đang mở bên phải, dựng cùng khuôn với hộp đến bản tổng
 * hợp. Tách hộp riêng vì bảng này tháng một bản và không chung collection
 * với bản tổng hợp theo kỳ.
 */
export function TeamReportAdjustmentInboxView() {
  const [status, setStatus] = useState<StatusFilter>("PENDING");
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [pickedId, setPickedId] = useState<string | null>(null);

  const list = useSWR(teamReportKeys.adjustmentInbox(status, page), () =>
    fetchTeamReportAdjustmentInbox({
      status: status === "ALL" ? "" : status,
      page,
      limit: PAGE_SIZE,
    }),
  );

  const all = list.data?.data ?? [];
  const meta = list.data?.meta;

  const term = query.trim().toLowerCase();
  const rows = term
    ? all.filter(
        (row) =>
          row.periodMonth.includes(term) ||
          (refName(row.department) ?? "").toLowerCase().includes(term) ||
          row.sentByName.toLowerCase().includes(term),
      )
    : all;

  const activeId =
    pickedId && rows.some((row) => row._id === pickedId)
      ? pickedId
      : (rows[0]?._id ?? null);

  const detail = useSWR(
    activeId ? teamReportKeys.adjustmentIncoming(activeId) : null,
    () => fetchIncomingTeamReportAdjustment(activeId!),
  );

  const refreshAll = async () => {
    await Promise.all([list.mutate(), detail.mutate()]);
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
                Duyệt điểm cộng, trừ &amp; xếp loại
              </h1>
              <p className="text-sm text-muted-foreground">
                Bảng đề xuất theo tháng các đội trình lên - đọc, chỉnh lại điểm
                nếu cần, rồi duyệt hoặc trả lại kèm lý do.
              </p>
            </div>
          </div>

          <Badge variant="secondary" className="whitespace-nowrap font-normal">
            {meta?.total ?? 0} bảng
          </Badge>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Card className="shadow-sm lg:sticky lg:top-4 lg:self-start">
          <CardContent className="space-y-3 py-4">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Tìm theo đội, tháng, người trình..."
                className="bg-background pl-8"
              />
            </div>

            <SegmentedTabs
              ariaLabel="Lọc theo trạng thái"
              value={status}
              onChange={(next) => {
                setStatus(next);
                setPage(1);
              }}
              items={[
                { value: "PENDING" as const, label: "Chờ duyệt" },
                { value: "APPROVED" as const, label: "Đã duyệt" },
                { value: "RETURNED" as const, label: "Đã trả lại" },
                { value: "ALL" as const, label: "Tất cả" },
              ]}
              className="flex-wrap"
            />

            <div className="max-h-[32rem] space-y-1.5 overflow-y-auto">
              {list.isLoading && !rows.length ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Đang tải...
                </p>
              ) : null}

              {!list.isLoading && !rows.length ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {term
                    ? "Không có bảng nào khớp."
                    : "Chưa có bảng nào ở mục này."}
                </p>
              ) : null}

              {rows.map((row) => (
                <InboxRow
                  key={row._id}
                  row={row}
                  active={row._id === activeId}
                  onPick={() => setPickedId(row._id)}
                />
              ))}
            </div>

            {(meta?.totalPages ?? 1) > 1 ? (
              <div className="flex items-center justify-between gap-2 border-t pt-3">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="bg-background"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => current - 1)}
                >
                  Trước
                </Button>
                <span className="text-xs text-muted-foreground tabular-nums">
                  Trang {meta?.page ?? page}/{meta?.totalPages ?? 1}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="bg-background"
                  disabled={page >= (meta?.totalPages ?? 1)}
                  onClick={() => setPage((current) => current + 1)}
                >
                  Sau
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {list.error ? (
          <Card className="shadow-sm">
            <CardContent className="p-4 text-sm text-destructive">
              {getApiErrorMessage(list.error, "Không tải được danh sách.")}
            </CardContent>
          </Card>
        ) : !activeId ? (
          <Card className="shadow-sm">
            <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
              <FileSpreadsheet className="size-10 text-muted-foreground" />
              <p className="text-sm font-medium">Chưa có bảng nào trình lên</p>
              <p className="max-w-sm text-xs text-muted-foreground">
                Đội trình bảng điểm cộng, trừ &amp; xếp loại lên thì nó nằm ở
                đây, chờ bạn duyệt hoặc trả lại.
              </p>
            </CardContent>
          </Card>
        ) : detail.error ? (
          <Card className="shadow-sm">
            <CardContent className="p-4 text-sm text-destructive">
              {getApiErrorMessage(detail.error, "Không tải được bảng.")}
            </CardContent>
          </Card>
        ) : !detail.data ? (
          <Card className="shadow-sm">
            <CardContent className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Đang tải bảng...
            </CardContent>
          </Card>
        ) : (
          <ReviewPanel
            id={activeId}
            data={detail.data}
            onApply={(next) => detail.mutate(next, { revalidate: false })}
            onChanged={refreshAll}
          />
        )}
      </div>
    </div>
  );
}

/** Dòng ở cột trái - thấy ngay đội nào, tháng nào, ai trình, đang ở đâu. */
function InboxRow({
  row,
  active,
  onPick,
}: {
  row: TeamReportAdjustmentInboxRow;
  active: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      className={cn(
        "w-full cursor-pointer rounded-md border p-2.5 text-left transition-colors",
        active ? "border-primary bg-primary/5" : "hover:bg-muted/60",
      )}
    >
      <div className="break-words text-sm font-medium">
        {refName(row.department) || "Không rõ đội"}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted-foreground tabular-nums">
          {monthLabel(row.periodMonth)}
        </span>
        <Badge
          variant="secondary"
          className={cn(
            "whitespace-nowrap font-normal",
            DAY_STATUS_CLASS[row.status],
          )}
        >
          {TEAM_REPORT_STATUS_LABEL[row.status]}
        </Badge>
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        {row.sentByName} trình
        {row.sentAt ? ` lúc ${formatServerHm(row.sentAt)}` : ""}
      </div>
    </button>
  );
}

/**
 * Bản đang mở: ba bảng I / II / III của đội. Đang chờ duyệt thì cấp trên gõ
 * thẳng vào ô điểm được (mỗi lượt ghi nhật ký, đội thấy sau), rồi duyệt hoặc
 * trả lại. Đã quyết rồi thì chỉ đọc.
 */
function ReviewPanel({
  id,
  data,
  onApply,
  onChanged,
}: {
  id: string;
  data: TeamReportAdjustmentData;
  onApply: (next: TeamReportAdjustmentData) => Promise<unknown>;
  onChanged: () => Promise<void>;
}) {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [cellErrors, setCellErrors] = useState<Record<string, string>>({});
  const [returnOpen, setReturnOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [deciding, setDeciding] = useState(false);

  const { sheet, totals, templates, scoreColumnKeys } = data;
  const catalog = useMemo(() => data.catalog ?? [], [data.catalog]);
  const pending = sheet.status === "PENDING";

  const entriesByItem = useMemo(() => {
    const map = new Map<string, TeamReportAdjustmentEntry[]>();
    for (const entry of sheet.entries) {
      map.set(entry.itemId, [...(map.get(entry.itemId) ?? []), entry]);
    }
    return map;
  }, [sheet]);

  /* Lượt ghi server không gửi lại danh mục - giữ từ lần đọc. */
  const apply = async (
    result: Omit<TeamReportAdjustmentData, "catalog" | "months">,
  ) => {
    await onApply({ ...result, catalog, department: data.department });
  };

  const saveCell = async (
    entry: TeamReportAdjustmentEntry,
    column: TeamReportColumn,
    next: string,
  ) => {
    const key = `${entry._id}:${column.key}`;
    setBusyKey(key);
    try {
      await apply(
        await reviewTeamReportAdjustmentEntry(id, entry._id, {
          version: sheet.version,
          fieldValues: { [column.key]: next },
        }),
      );
      setCellErrors((prev) => {
        if (!(key in prev)) return prev;
        const rest = { ...prev };
        delete rest[key];
        return rest;
      });
    } catch (error) {
      const message = getApiErrorMessage(error, "Không lưu được.");
      setCellErrors((prev) => ({ ...prev, [key]: message }));
      toast.error(message);
      if (
        (error as { response?: { status?: number } })?.response?.status === 409
      ) {
        await onChanged();
      }
    } finally {
      setBusyKey(null);
    }
  };

  const decide = async (decision: "APPROVE" | "RETURN") => {
    if (decision === "RETURN" && !reason.trim()) {
      toast.error("Trả lại thì phải ghi lý do để đội biết chữa chỗ nào.");
      return;
    }
    setDeciding(true);
    try {
      await apply(
        await decideTeamReportAdjustment(id, {
          decision,
          reason: decision === "RETURN" ? reason.trim() : undefined,
        }),
      );
      setReturnOpen(false);
      setReason("");
      toast.success(
        decision === "APPROVE" ? "Đã duyệt bảng." : "Đã trả lại cho đội.",
      );
      await onChanged();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không thực hiện được."));
    } finally {
      setDeciding(false);
    }
  };

  const noop = () => undefined;

  return (
    <Card className="shadow-sm">
      <CardContent className="space-y-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Scale className="size-5" />
            </span>
            <div>
              <h2 className="font-display text-lg font-semibold tracking-tight">
                {data.department?.name || "Đội"} ·{" "}
                {monthLabel(sheet.periodMonth)}
              </h2>
              <p className="text-sm text-muted-foreground">
                {sheet.sentByName} trình
                {sheet.sentAt ? ` lúc ${formatServerHm(sheet.sentAt)}` : ""}
                {sheet.note ? ` · ghi chú: ${sheet.note}` : ""}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {busyKey ? (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" />
                Đang lưu
              </span>
            ) : null}
            <Badge
              variant="secondary"
              className={cn(
                "whitespace-nowrap font-normal",
                DAY_STATUS_CLASS[sheet.status],
              )}
            >
              {TEAM_REPORT_STATUS_LABEL[sheet.status]}
            </Badge>
            {pending ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  className="bg-background"
                  disabled={deciding || busyKey !== null}
                  onClick={() => setReturnOpen(true)}
                >
                  <Undo2 className="size-4" />
                  Trả lại
                </Button>
                <Button
                  type="button"
                  disabled={deciding || busyKey !== null}
                  onClick={() => void decide("APPROVE")}
                >
                  <Check className="size-4" />
                  Duyệt
                </Button>
              </>
            ) : null}
          </div>
        </div>

        {sheet.status === "RETURNED" ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
            Đã trả lại
            {sheet.decidedAt
              ? ` lúc ${formatServerHm(sheet.decidedAt)}`
              : ""}: {sheet.returnReason || "không nêu lý do"}
          </p>
        ) : sheet.status === "APPROVED" ? (
          <p className="rounded-md border bg-muted/40 px-3 py-2.5 text-sm">
            {sheet.decidedByName || "Đã"} duyệt
            {sheet.decidedAt ? ` lúc ${formatServerHm(sheet.decidedAt)}` : ""}.
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 text-sm tabular-nums">
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
          {pending ? (
            <span className="text-xs text-muted-foreground">
              Gõ thẳng vào ô để chỉnh - mỗi lượt sửa được ghi nhật ký.
            </span>
          ) : null}
        </div>

        {ADJUSTMENT_SECTIONS_UI.map((section) => (
          <AdjustmentSectionTable
            key={section.key}
            section={section}
            template={templates?.[section.key] ?? null}
            scoreKey={scoreColumnKeys?.[section.key] ?? null}
            items={catalog.filter((item) => item.section === section.key)}
            entriesByItem={entriesByItem}
            sheetVersion={sheet.version}
            sectionTotal={
              section.key === "BONUS"
                ? totals.bonus
                : section.key === "PENALTY"
                  ? totals.penalty
                  : null
            }
            busyKey={busyKey}
            cellErrors={cellErrors}
            onAdd={noop}
            onSave={saveCell}
            onRemove={noop}
            mode={pending ? "review" : "read"}
            catalogs={{ department: data.departmentChoices ?? [] }}
          />
        ))}

        {sheet.edits?.length ? (
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

      <Dialog open={returnOpen} onOpenChange={setReturnOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Trả lại bảng cho đội</DialogTitle>
            <DialogDescription>
              {data.department?.name} · {monthLabel(sheet.periodMonth)}. Đội sẽ
              sửa theo lý do bạn ghi rồi trình lại.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={4}
            placeholder="Lý do trả lại (bắt buộc)"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReturnOpen(false)}>
              Huỷ
            </Button>
            <Button
              variant="destructive"
              disabled={deciding || !reason.trim()}
              onClick={() => void decide("RETURN")}
            >
              <Undo2 className="size-4" />
              Trả lại
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
