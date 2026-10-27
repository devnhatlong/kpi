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
import { Checkbox } from "@/components/ui/checkbox";
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
import { CommendationTeamSheets } from "@/features/team-report/components/commendation-team-sheets";
import { ApprovalChain } from "@/features/team-report/components/participants-block";
import {
  isConflict,
  mergeRows,
  sameFields,
} from "@/features/team-report/merge-rows";
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

type CommendationDraft = {
  praises: CommendationRow[];
  criticisms: CommendationRow[];
  /** "Tháng này không có đề xuất" - chỉ giữ được khi hai bảng rỗng. */
  noProposal: boolean;
};
type CommendationRowsChange = Omit<CommendationDraft, "noProposal"> & {
  noProposal?: boolean;
};
type CommendationBase = CommendationDraft & { version: number };

/** Gộp theo id dòng; so đúng các trường người dùng nhập. */
const mergeCommendationRows = (
  base: CommendationRow[],
  mine: CommendationRow[],
  theirs: CommendationRow[],
) =>
  mergeRows(
    base,
    mine,
    theirs,
    (row) => row._id,
    sameFields((row: CommendationRow) => [
      row.itemId,
      row.departmentIds,
      row.content,
      row.evidence,
      row.note,
      row.sourceRowId ?? null,
    ]),
  );

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
    units: row.noUnit
      ? "Không có đơn vị"
      : row.departmentIds
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

  const [draft, setDraft] = useState<CommendationDraft | null>(null);
  /*
    Bản đã đọc về LÚC BẮT ĐẦU SỬA. `version` của nó lưu kèm để server so -
    không lấy `data.version` lúc bấm lưu: SWR tải lại ngầm thì số đó đã là của
    bản người khác vừa lưu, gửi lên là đè mất bản đó. Nội dung của nó là gốc
    để gộp khi lưu bị 409.
  */
  const [base, setBase] = useState<CommendationBase | null>(null);
  const dirty = draft !== null;

  /* Nhiều người dùng chung tài khoản: chưa sửa gì thì tự làm mới (định kỳ và
     khi quay lại tab) để ai mở ra cũng thấy bản mới nhất. Đang sửa thì thôi -
     bản nháp đã tách khỏi `data`, làm mới chỉ tốn lượt gọi. */
  const { data, error, isLoading, mutate } = useSWR(
    month ? commendationKeys.sheet(month) : null,
    () => fetchCommendation(month),
    { revalidateOnFocus: !dirty, refreshInterval: dirty ? 0 : 20_000 },
  );

  /* Thêm / lấy dòng nào là tự bỏ "Không có đề xuất" - hai thứ không đi cùng
     nhau, server cũng chặn. */
  const edit = (next: CommendationRowsChange) => {
    if (draft === null && data) {
      setBase({
        version: data.version,
        praises: data.praises,
        criticisms: data.criticisms,
        noProposal: !!data.noProposal,
      });
    }
    const hasRows = next.praises.length > 0 || next.criticisms.length > 0;
    setDraft({
      ...next,
      noProposal: !hasRows && (next.noProposal ?? noProposal),
    });
  };
  const [saving, setSaving] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [recipientId, setRecipientId] = useState("");
  const [recipientError, setRecipientError] = useState(false);

  const openSend = () => {
    const choices = data?.route.people ?? [];
    setRecipientId(choices.length === 1 ? choices[0]!.id : "");
    setRecipientError(false);
    setSendOpen(true);
  };

  // Đổi tháng là bỏ bản nháp của tháng cũ.
  const [draftMonth, setDraftMonth] = useState(month);
  if (draftMonth !== month) {
    setDraftMonth(month);
    setDraft(null);
  }

  const praises = draft?.praises ?? data?.praises ?? [];
  const criticisms = draft?.criticisms ?? data?.criticisms ?? [];
  const noProposal = draft?.noProposal ?? !!data?.noProposal;
  const editable = !!data?.canEdit;

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  /*
    Lưu. Bị 409 (người khác vừa lưu) thì không bắt tải lại trang: đọc bản mới,
    gộp theo từng dòng với phần mình sửa rồi lưu lại luôn. Chỉ dừng lại hỏi
    khi hai bên cùng sửa một dòng - lúc đó giữ bản của mình trên màn để xem.
  */
  const save = async () => {
    if (!data) return;
    setSaving(true);
    let current: CommendationBase = base ?? {
      ...data,
      noProposal: !!data.noProposal,
    };
    let mine: CommendationDraft = { praises, criticisms, noProposal };
    try {
      for (let attempt = 0; ; attempt += 1) {
        try {
          await saveCommendation(month, { version: current.version, ...mine });
          setDraft(null);
          setBase(null);
          await mutate();
          toast.success(
            attempt
              ? "Đã gộp với phần người khác vừa lưu và lưu bảng."
              : "Đã lưu bảng biểu dương, phê bình.",
          );
          return;
        } catch (err) {
          if (!isConflict(err) || attempt >= 2) throw err;
          const fresh = await mutate();
          if (!fresh) throw err;
          if (!fresh.canEdit) {
            setDraft(null);
            setBase(null);
            toast.error(
              "Bảng vừa được gửi đi ở nơi khác - không sửa được nữa, đã tải bản mới.",
            );
            return;
          }
          const praiseMerge = mergeCommendationRows(
            current.praises,
            mine.praises,
            fresh.praises,
          );
          const criticismMerge = mergeCommendationRows(
            current.criticisms,
            mine.criticisms,
            fresh.criticisms,
          );
          current = { ...fresh, noProposal: !!fresh.noProposal };
          mine = {
            praises: praiseMerge.rows,
            criticisms: criticismMerge.rows,
            // Bên kia vừa thêm dòng thì "không có đề xuất" của mình hết nghĩa.
            noProposal:
              mine.noProposal &&
              !praiseMerge.rows.length &&
              !criticismMerge.rows.length,
          };
          const conflicts = praiseMerge.conflicts + criticismMerge.conflicts;
          if (conflicts) {
            setBase({
              version: fresh.version,
              praises: fresh.praises,
              criticisms: fresh.criticisms,
              noProposal: !!fresh.noProposal,
            });
            setDraft(mine);
            toast.warning(
              `Người khác vừa lưu bảng, đã gộp phần của họ. Có ${conflicts} dòng cả hai cùng sửa - đang giữ bản của bạn, xem lại rồi bấm Lưu nháp.`,
            );
            return;
          }
        }
      }
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
  const sendBlocker = !rowCount && !noProposal
    ? 'Chưa có dòng nào - không có thì chọn "Không có đề xuất".'
    : incomplete
      ? `Còn ${incomplete} dòng chưa đủ đơn vị / nội dung.`
      : dirty || !data?._id
        ? "Lưu nháp trước rồi mới gửi."
        : null;

  const send = async () => {
    if (!routeUnits && !recipientId) {
      setRecipientError(true);
      return;
    }
    setSaving(true);
    try {
      await sendCommendation(month, routeUnits ? undefined : recipientId);
      await mutate();
      setSendOpen(false);
      toast.success(
        routeUnits
          ? "Đã gửi bảng tới các đội Phòng Tham mưu."
          : "Đã gửi bảng lên trưởng phòng.",
      );
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
        noProposal,
      });
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Không xuất được Excel."));
    } finally {
      setExporting(false);
    }
  };

  const status = data?._id ? data.status : null;
  const routeUnits = data?.route.units ?? null;
  /* Luồng tự chọn: ĐỘI gửi trưởng phòng trực thuộc - thường đúng một người,
     chọn sẵn cho đỡ một cú bấm. */
  const people = data?.route.people ?? null;
  const team = !routeUnits && !!people;
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
                địa phương - mỗi tháng một bảng. Đội gửi trưởng phòng trực
                thuộc; trưởng phòng tổng hợp rồi gửi các đội Phòng Tham mưu.
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
                ) : editable && team ? (
                  <span className="text-xs text-muted-foreground">
                    · Gửi trưởng phòng trực thuộc duyệt
                  </span>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="bg-background"
                  disabled={exporting || (!rowCount && !noProposal)}
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
                      onClick={openSend}
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

            {/* Trưởng phòng: lấy dòng từ bảng các đội trong phòng đã duyệt. */}
            {data.teamSheets?.length ? (
              <CommendationTeamSheets
                sheets={data.teamSheets}
                praises={praises}
                criticisms={criticisms}
                editable={editable}
                onTake={edit}
              />
            ) : null}

            {/* "Không có đề xuất": chỉ chọn được khi bảng chưa có dòng nào -
                có dòng rồi thì ô này vô nghĩa, ẩn đi cho đỡ rối. */}
            {editable && !rowCount ? (
              <label
                htmlFor="commendation-no-proposal"
                className="flex cursor-pointer items-start gap-3 rounded-md border bg-muted/30 px-3 py-2.5"
              >
                <Checkbox
                  id="commendation-no-proposal"
                  checked={noProposal}
                  onCheckedChange={(checked) =>
                    edit({ praises, criticisms, noProposal: checked === true })
                  }
                  className="mt-0.5"
                />
                <span className="space-y-0.5">
                  <span className="block text-sm font-medium">
                    Tháng này không có đề xuất biểu dương, phê bình
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    Vẫn gửi bảng như thường để cấp trên biết đơn vị đã báo cáo -
                    không cần nhập dòng "không có".
                  </span>
                </span>
              </label>
            ) : null}

            {noProposal && !editable ? (
              <p className="rounded-md border bg-muted/30 px-3 py-2.5 text-sm">
                Tháng này không có đề xuất biểu dương, phê bình.
              </p>
            ) : null}
            {/* "Không có đề xuất": vẫn bày bảng cho thấy mẫu, chỉ khoá nhập -
                bỏ tick là nhập lại được. */}
            <div
              aria-disabled={noProposal || undefined}
              className={cn(noProposal && "opacity-60")}
            >
              <CommendationTables
                praises={praises}
                criticisms={criticisms}
                criteria={data.criteria}
                departmentChoices={data.departmentChoices}
                editable={editable && !noProposal}
                onChange={edit}
                /* Bảng của phòng có đội gửi lên: dòng nào cũng ghi nguồn. */
                sourceTags={!!data.teamSheets?.length}
                ownerName={data.departmentName}
              />
            </div>
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
              {noProposal
                ? "Không có đề xuất biểu dương, phê bình."
                : `${praises.length} dòng biểu dương · ${criticisms.length} dòng phê bình.`}{" "}
              Bảng khoá lại cho tới khi được duyệt hoặc trả lại.
            </DialogDescription>
          </DialogHeader>
          {routeUnits || people ? (
            <SummaryRecipientFields
              idPrefix="commendation"
              recipients={people ?? []}
              units={routeUnits}
              finalReviewer={data?.route.finalReviewer}
              recipientId={recipientId}
              onRecipientChange={(id) => {
                setRecipientId(id);
                setRecipientError(false);
              }}
              error={
                recipientError ? "Chọn trưởng phòng nhận bảng." : undefined
              }
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
                (routeUnits
                  ? hasInactiveUnit(routeUnits, data?.route.finalReviewer)
                  : !people?.length)
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
