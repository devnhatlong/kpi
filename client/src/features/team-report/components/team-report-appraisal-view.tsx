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
  unitSaved,
  type AppraisalUnit,
} from "@/features/team-report/appraisal";
import { AppraisalWorkspace } from "@/features/team-report/components/appraisal-workspace";
import {
  SummaryRecipientFields,
  hasInactiveUnit,
} from "@/features/team-report/components/summary-recipient-fields";
import { Checkbox } from "@/components/ui/checkbox";
import {
  isConflict,
  mergeRows,
  sameFields,
} from "@/features/team-report/merge-rows";
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

type AppraisalBase = { version: number; units: AppraisalUnit[] };

/**
 * Gộp theo đơn vị; so đúng các ô người thẩm định nhập. Đơn vị bên kia đã
 * trình đi thì lấy bản bên kia - server cũng không nhận sửa đơn vị đã trình.
 */
function mergeAppraisalUnits(
  base: AppraisalUnit[],
  mine: AppraisalUnit[],
  theirs: AppraisalUnit[],
) {
  const merged = mergeRows(
    base,
    mine,
    theirs,
    (unit) => unit.departmentId,
    sameFields((unit: AppraisalUnit) => [
      unit.bonuses.map((bonus) => [bonus.itemId, bonus.score, bonus.evidence]),
      unit.penalties.map((penalty) => [
        penalty.itemId,
        penalty.content,
        penalty.score,
      ]),
      unit.upgradeNote,
      unit.proposedRating,
      unit.ratingNote,
    ]),
  );
  const sent = new Map(
    theirs
      .filter((unit) => !unitEditable(unit))
      .map((unit) => [unit.departmentId, unit]),
  );
  return {
    rows: merged.rows.map((unit) => sent.get(unit.departmentId) ?? unit),
    conflicts: merged.conflicts,
  };
}

/**
 * "Phụ lục theo dõi, thẩm định tháng" của đội PV01 - tài khoản duyệt của đội
 * thẩm định lại kết quả tự chấm của các đơn vị mình theo dõi, tháng một bản,
 * rồi trình theo luồng (mặc định về Đội CNTT duyệt).
 *
 * Giữ bản nháp ở màn hình và lưu bằng nút, không tự lưu từng ô (cả đội dùng
 * chung tài khoản - tự lưu liên tục là đè nhau). Lưu và trình theo TỪNG ĐƠN
 * VỊ ở cuối khối đơn vị (user chốt 2026-10-18); đầu bảng chỉ còn thao tác
 * hàng loạt "Lưu tất cả" / "Trình nhiều đơn vị".
 */
export function TeamReportAppraisalView() {
  const { ready } = useServerTime();
  const [pickedMonth, setPickedMonth] = useState<string | null>(null);
  const month = pickedMonth ?? (ready ? serverYmd().slice(0, 7) : "");
  const thisMonth = ready ? serverYmd().slice(0, 7) : "";

  const [draft, setDraft] = useState<AppraisalUnit[] | null>(null);
  /*
    Bản đã đọc về LÚC BẮT ĐẦU SỬA. `version` của nó lưu kèm để server so -
    không lấy `data.version` lúc bấm lưu: SWR tải lại ngầm thì số đó đã là của
    bản người khác vừa lưu, gửi lên là đè mất bản đó. Các đơn vị của nó là gốc
    để gộp khi lưu bị 409.
  */
  const [base, setBase] = useState<AppraisalBase | null>(null);
  const dirty = draft !== null;

  /* Nhiều người dùng chung tài khoản: chưa sửa gì thì tự làm mới (định kỳ và
     khi quay lại tab) để ai mở ra cũng thấy bản mới nhất. Đang sửa thì thôi -
     bản nháp đã tách khỏi `data`, làm mới chỉ tốn lượt gọi. */
  const { data, error, isLoading, mutate } = useSWR(
    month ? appraisalKeys.sheet(month) : null,
    () => fetchAppraisal(month),
    { revalidateOnFocus: !dirty, refreshInterval: dirty ? 0 : 20_000 },
  );

  const edit = (next: AppraisalUnit[]) => {
    if (draft === null && data) {
      setBase({ version: data.version, units: data.units });
    }
    setDraft(next);
  };
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

  /*
    Lưu. Bị 409 (người khác vừa lưu) thì không bắt tải lại trang: đọc bản mới,
    gộp theo từng đơn vị với phần mình sửa rồi lưu lại luôn. Chỉ dừng lại hỏi
    khi hai bên cùng sửa một đơn vị - lúc đó giữ bản của mình trên màn để xem.
  */
  const save = async () => {
    if (!data) return;
    setSaving(true);
    let current: AppraisalBase = base ?? data;
    let mine = units;
    try {
      for (let attempt = 0; ; attempt += 1) {
        try {
          await saveAppraisal(month, {
            version: current.version,
            leaderName: data.leaderName,
            commanderName: data.commanderName,
            units: mine,
          });
          setDraft(null);
          setBase(null);
          await mutate();
          toast.success(
            attempt
              ? "Đã gộp với phần người khác vừa lưu và lưu bảng thẩm định."
              : "Đã lưu bảng thẩm định.",
          );
          return;
        } catch (err) {
          if (!isConflict(err) || attempt >= 2) throw err;
          const fresh = await mutate();
          if (!fresh) throw err;
          const merged = mergeAppraisalUnits(current.units, mine, fresh.units);
          current = fresh;
          mine = merged.rows;
          if (merged.conflicts) {
            setBase({ version: fresh.version, units: fresh.units });
            setDraft(mine);
            toast.warning(
              `Người khác vừa lưu bảng, đã gộp phần của họ. Có ${merged.conflicts} đơn vị cả hai cùng sửa - đang giữ bản của bạn, xem lại rồi bấm Lưu nháp.`,
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

  /*
    Sau khi lưu / trình MỘT đơn vị: đơn vị đó lấy bản server vừa trả, các đơn
    vị khác giữ nguyên phần đang sửa dở. Hết chỗ nào khác bản lưu thì thoát
    chế độ sửa.
  */
  const settle = (fresh: AppraisalBase, ids: string[]) => {
    const next = units.map(
      (unit) =>
        (ids.includes(unit.departmentId)
          ? fresh.units.find((item) => item.departmentId === unit.departmentId)
          : undefined) ?? unit,
    );
    const clean =
      next.length === fresh.units.length &&
      next.every((unit) => unitSaved(unit, fresh.units));
    if (clean) {
      setDraft(null);
      setBase(null);
    } else {
      setDraft(next);
      setBase({ version: fresh.version, units: fresh.units });
    }
  };

  /*
    Lưu MỘT đơn vị: gửi bản đang lưu trên server, chỉ thay đúng đơn vị này
    bằng bản trên màn - phần đang sửa dở ở đơn vị khác không đi theo. Bị 409
    thì đọc lại và thử lại; chỉ dừng khi người khác cũng vừa sửa CHÍNH đơn vị
    này (lúc đó giữ bản của mình trên màn để xem).
  */
  const saveUnit = async (departmentId: string) => {
    if (!data) return;
    const mine = units.find((unit) => unit.departmentId === departmentId);
    if (!mine) return;
    setSaving(true);
    const before = (base ?? data).units.find(
      (unit) => unit.departmentId === departmentId,
    );
    let current: AppraisalBase = base ?? data;
    try {
      for (let attempt = 0; ; attempt += 1) {
        const others = current.units.filter(
          (unit) => unit.departmentId !== departmentId,
        );
        try {
          await saveAppraisal(month, {
            version: current.version,
            leaderName: data.leaderName,
            commanderName: data.commanderName,
            units: current.units.some(
              (unit) => unit.departmentId === departmentId,
            )
              ? current.units.map((unit) =>
                  unit.departmentId === departmentId ? mine : unit,
                )
              : [...others, mine],
          });
          const fresh = await mutate();
          if (fresh) settle(fresh, [departmentId]);
          toast.success(`Đã lưu ${mine.departmentName}.`);
          return;
        } catch (err) {
          if (!isConflict(err) || attempt >= 2) throw err;
          const fresh = await mutate();
          if (!fresh) throw err;
          const theirs = fresh.units.find(
            (unit) => unit.departmentId === departmentId,
          );
          if (before && theirs && !unitSaved(before, [theirs])) {
            setBase({ version: fresh.version, units: fresh.units });
            toast.warning(
              `Người khác vừa lưu ${mine.departmentName}. Đang giữ bản của bạn trên màn - xem lại rồi bấm Lưu lần nữa để ghi đè.`,
            );
            return;
          }
          current = fresh;
        }
      }
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Không lưu được."));
    } finally {
      setSaving(false);
    }
  };

  /*
    Trình RIÊNG từng đơn vị. Đơn vị trình được = còn sửa được (chưa trình / bị
    trả lại), ĐÃ LƯU (bản trình đi là bản trên server, không phải bản trên màn)
    VÀ đủ ô bắt buộc (tự chấm + xếp loại).
  */
  const isSaved = (unit: AppraisalUnit) =>
    !!data?._id && unitSaved(unit, data.units);
  const pendingUnits = units.filter(unitEditable);
  const readyUnits = pendingUnits.filter(
    (unit) => unitComplete(unit) && isSaved(unit),
  );
  const [picked, setPicked] = useState<Set<string>>(new Set());
  /** Hộp trình đang mở theo kiểu HÀNG LOẠT (nút đầu bảng) hay một đơn vị. */
  const [batch, setBatch] = useState(false);

  /** Mở hộp trình - `only` = trình riêng đơn vị đó, không thì chọn hết. */
  const openSend = (only?: string) => {
    setBatch(!only);
    setLeaderName(data?.leaderName ?? "");
    setCommanderName(data?.commanderName ?? "");
    setNameError(false);
    setPicked(
      new Set(only ? [only] : readyUnits.map((unit) => unit.departmentId)),
    );
    setSendOpen(true);
  };

  /** Lý do một đơn vị chưa trình được - nói ngay cạnh nút trình của nó. */
  const unitSendBlocker = (unit: AppraisalUnit) =>
    !unitEditable(unit)
      ? null
      : !isSaved(unit)
        ? "Lưu đơn vị này trước rồi mới trình."
        : unit.selfScore === null
          ? "Chưa có điểm tự chấm - cần báo cáo tháng được duyệt."
          : !unit.proposedRating
            ? "Chọn đề xuất mức xếp loại để trình."
            : null;
  const unsavedCount = units.filter((unit) => !isSaved(unit)).length;

  const send = async () => {
    if (!leaderName.trim() || !commanderName.trim()) {
      setNameError(true);
      return;
    }
    // Chỉ đơn vị ĐÃ LƯU và đủ thông tin - lọc lại lúc gửi cho chắc.
    const ids = [...picked].filter((id) =>
      readyUnits.some((unit) => unit.departmentId === id),
    );
    if (!ids.length) return;
    setSaving(true);
    try {
      await sendAppraisal(month, {
        departmentIds: ids,
        leaderName: leaderName.trim(),
        commanderName: commanderName.trim(),
      });
      const fresh = await mutate();
      if (fresh && draft !== null) settle(fresh, ids);
      setSendOpen(false);
      toast.success(`Đã trình ${ids.length} đơn vị.`);
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
                      ["RETURNED", "Thẩm định bị trả lại"],
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
                  {/* Lưu / trình THƯỜNG NGÀY nằm ở cuối từng đơn vị. Ở đây
                      chỉ còn thao tác HÀNG LOẠT: lưu hết các đơn vị đang sửa
                      dở, trình một lượt nhiều đơn vị. */}
                  {dirty && unsavedCount > 1 ? (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={saving}
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
                      Lưu tất cả ({unsavedCount})
                    </Button>
                  ) : null}
                  {readyUnits.length > 1 ? (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={saving}
                      onClick={() => openSend()}
                    >
                      <Send className="size-4" aria-hidden="true" />
                      Trình nhiều đơn vị ({readyUnits.length})
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>

            <AppraisalWorkspace
              units={units}
              criteria={data.criteria}
              editable={editable}
              hints={data.selfScoreHints}
              suggestedUnits={data.suggestedUnits}
              newlyApprovedIds={data.newlyApprovedIds}
              commendations={data.commendationHints}
              selfClaims={data.selfClaims ?? {}}
              savedUnits={data._id ? data.units : []}
              onChange={edit}
              unitActions={
                editable
                  ? {
                      busy: saving,
                      onSave: (id) => void saveUnit(id),
                      onSend: (id) => openSend(id),
                      sendBlocker: unitSendBlocker,
                    }
                  : undefined
              }
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
              Đơn vị đã trình khoá lại cho tới khi được duyệt hoặc trả lại.
            </DialogDescription>
          </DialogHeader>

          {/* Trình hàng loạt: cảnh báo trước - một lượt bấm là nhiều đơn vị
              khoá lại cùng lúc. Chỉ đơn vị ĐÃ LƯU mới chọn được; nêu rõ đơn
              vị nào bị bỏ ra và vì sao. */}
          {batch ? (
            <div
              role="alert"
              className="space-y-1 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
            >
              <p>
                <strong className="font-semibold">
                  Trình cùng lúc {picked.size} đơn vị.
                </strong>{" "}
                Các đơn vị này sẽ khoá lại cho tới khi được duyệt hoặc trả lại.
                Bản trình đi là bản ĐÃ LƯU - xem lại điểm và mức xếp loại từng
                đơn vị bên dưới trước khi trình.
              </p>
              {pendingUnits.length > readyUnits.length ? (
                <p>
                  {pendingUnits.length - readyUnits.length} đơn vị chưa lưu hoặc
                  chưa đủ thông tin sẽ{" "}
                  <strong className="font-semibold">không được trình</strong> -
                  lý do ghi ở từng dòng.
                </p>
              ) : null}
            </div>
          ) : null}

          {/* Chọn đơn vị trình lần này - chỉ bày đơn vị chưa trình / bị trả
              lại; đơn vị chưa đủ ô thì bày xám kèm lý do, không chọn được. */}
          {batch ? (
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
                  const blocker = unitSendBlocker(unit);
                  const ready = !blocker;
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
                            : blocker}
                          {unit.status === "RETURNED" ? " · trình lại" : ""}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
          ) : (
            /* Trình RIÊNG một đơn vị (nút ở cuối khối đơn vị): chỉ nói đơn vị
               đó, không bày các đơn vị khác trong bảng - chúng không đi theo. */
            (() => {
              const unit = pendingUnits.find((item) =>
                picked.has(item.departmentId),
              );
              if (!unit) return null;
              return (
                <div className="rounded-md border px-3 py-2 text-sm">
                  <span className="block font-medium">
                    {unit.departmentName}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    Sau thẩm định{" "}
                    {formatScore(appraisalTotals(unit).finalScore ?? 0)} ·{" "}
                    {unit.proposedRating}
                    {unit.status === "RETURNED" ? " · trình lại" : ""}
                  </span>
                </div>
              );
            })()
          )}

          {/* Luồng chỉ có MỘT nơi nhận (chủ trì, không phối hợp / nhận để biết)
              thì nói gọn một dòng - bảng đủ ba cột vai với hai cột trống làm
              người ta tưởng đang gửi thêm cho nơi khác. */}
          {routeUnits &&
          routeUnits.length === 1 &&
          routeUnits[0]!.role === "LEAD" &&
          routeUnits[0]!.isActive ? (
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
              <span className="text-muted-foreground">Trình tới </span>
              <strong className="font-semibold">
                {routeUnits[0]!.fullName}
              </strong>
              {data?.route.finalReviewer ? (
                <>
                  <span className="text-muted-foreground">
                    {" "}
                    → duyệt cuối{" "}
                  </span>
                  <strong className="font-semibold">
                    {data.route.finalReviewer.fullName}
                  </strong>
                </>
              ) : null}
              <span className="text-muted-foreground">
                {" "}
                - duyệt hoặc trả lại. Không gửi cho nơi nào khác.
              </span>
            </div>
          ) : routeUnits ? (
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
