"use client";

import { useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  CircleDashed,
  FileDown,
  Loader2,
  Plus,
  Save,
  Search,
  Send,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CountBadge } from "@/components/common/count-badge";
import { SearchableSelect } from "@/components/common/searchable-select";
import { SegmentedTabs } from "@/components/common/segmented-tabs";
import {
  appraisalTotals,
  hintText,
  unitComplete,
  unitEditable,
  unitSaved,
  type AppraisalCommendationHint,
  type AppraisalCommendationHints,
  type AppraisalComposerData,
  type AppraisalCriterion,
  type AppraisalSelfClaim,
  type AppraisalSelfClaims,
  type AppraisalUnit,
} from "@/features/team-report/appraisal";
import {
  exportAppraisalToExcel,
  type AppraisalExportInput,
} from "@/features/team-report/appraisal-excel";
import { getApiErrorMessage } from "@/lib/api-client";
import {
  TEAM_REPORT_RATINGS,
  formatScore,
  stagedStatusLabel,
  type TeamReportRating,
} from "@/features/team-report/types";
import { DAY_STATUS_CLASS } from "@/features/team-report/status-styles";
import { Badge } from "@/components/ui/badge";
import { formatServerHm } from "@/lib/server-time";
import { cn } from "@/lib/utils";

type Filter = "ALL" | "TODO" | "SAVED" | "COMMENDED";

type UnitActions = {
  busy: boolean;
  onSave: (departmentId: string) => void;
  onSend: (departmentId: string) => void;
  /** Lý do chưa trình được; null = trình được (hoặc đã trình). */
  sendBlocker: (unit: AppraisalUnit) => string | null;
};
type Mode = "UNIT" | "TABLE";

const fmt = (value: number | null | undefined) =>
  value === null || value === undefined ? "-" : formatScore(value);

/**
 * Bàn làm việc của bảng thẩm định - dùng chung cho đội lập (sửa được) và nơi
 * duyệt (chỉ đọc).
 *
 * Một tháng có thể tới vài chục đơn vị, mỗi đơn vị mười mấy dòng: trải hết ra
 * như bản giấy là cuộn mỏi tay mà không biết còn đơn vị nào chưa làm. Nên bày
 * hai chế độ:
 * - TỪNG ĐƠN VỊ: danh sách bên trái (tìm, lọc "chưa xong", tiến độ), bên phải
 *   chỉ một đơn vị đang chọn - đủ chỗ cho ô minh chứng dài.
 * - BẢNG TỔNG: mỗi đơn vị một dòng với các con số chốt - để soát cả bảng
 *   trước khi trình / trước khi duyệt; bấm dòng là nhảy vào đơn vị đó.
 */
export function AppraisalWorkspace({
  units,
  criteria,
  editable,
  onChange,
  hints = {},
  suggestedUnits = [],
  newlyApprovedIds = [],
  exportInfo,
  commendations = {},
  selfClaims,
  savedUnits,
  unitActions,
}: {
  units: AppraisalUnit[];
  criteria: AppraisalCriterion[];
  editable: boolean;
  onChange?: (next: AppraisalUnit[]) => void;
  hints?: AppraisalComposerData["selfScoreHints"];
  suggestedUnits?: AppraisalComposerData["suggestedUnits"];
  newlyApprovedIds?: string[];
  /** Có thì bày nút xuất Excel (tổng hợp + riêng từng đơn vị). */
  exportInfo?: Omit<AppraisalExportInput, "units" | "criteria">;
  /** Biểu dương / phê bình các phòng gửi cùng tháng, theo id đơn vị. */
  commendations?: AppraisalCommendationHints;
  /** Đơn vị tự nhận (Trục 2) - không truyền thì bảng không có cột đó. */
  selfClaims?: AppraisalSelfClaims;
  /** Đơn vị trong bản đã lưu - để lọc "Đã lưu" và đánh dấu "Chưa lưu". */
  savedUnits?: AppraisalUnit[];
  /** Lưu / trình RIÊNG đơn vị đang mở - bày ở cuối khối đơn vị. */
  unitActions?: UnitActions;
}) {
  const [mode, setMode] = useState<Mode>("UNIT");
  const [exporting, setExporting] = useState(false);

  /* Xuất ĐÚNG thứ đang thấy trên màn - kể cả thay đổi chưa lưu: người dùng
     bấm xuất là muốn bản in khớp cái họ đang nhìn. */
  const runExport = async (picked: AppraisalUnit[], single: boolean) => {
    if (!exportInfo) return;
    setExporting(true);
    try {
      await exportAppraisalToExcel(
        { ...exportInfo, criteria, units: picked, selfClaims },
        { single },
      );
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không xuất được Excel."));
    } finally {
      setExporting(false);
    }
  };
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const rows = useMemo(
    () =>
      units.map((unit) => ({
        unit,
        totals: appraisalTotals(unit),
        saved: savedUnits ? unitSaved(unit, savedUnits) : true,
      })),
    [units, savedUnits],
  );
  const doneCount = rows.filter((row) => unitComplete(row.unit)).length;
  const savedCount = rows.filter((row) => row.saved).length;
  /** Đơn vị được nêu trong bảng biểu dương / phê bình cùng tháng. */
  const commended = (departmentId: string) => {
    const hint = commendations[departmentId];
    return !!hint && (hint.praises.length > 0 || hint.criticisms.length > 0);
  };
  const commendedCount = rows.filter((row) =>
    commended(row.unit.departmentId),
  ).length;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(({ unit, saved }) => {
      if (q && !unit.departmentName.toLowerCase().includes(q)) return false;
      if (filter === "TODO") return !unitComplete(unit);
      if (filter === "SAVED") return saved;
      if (filter === "COMMENDED") {
        const hint = commendations[unit.departmentId];
        return !!hint && (hint.praises.length > 0 || hint.criticisms.length > 0);
      }
      return true;
    });
  }, [rows, query, filter, commendations]);

  const selected =
    rows.find((row) => row.unit.departmentId === selectedId) ??
    visible[0] ??
    rows[0] ??
    null;
  const position = selected
    ? visible.findIndex(
        (row) => row.unit.departmentId === selected.unit.departmentId,
      )
    : -1;

  const patchUnit = (departmentId: string, next: AppraisalUnit) =>
    onChange?.(
      units.map((unit) => (unit.departmentId === departmentId ? next : unit)),
    );

  // Đơn vị đã duyệt báo cáo tháng đứng đầu ô chọn - thường là thứ cần chấm.
  const missingSuggestions = suggestedUnits
    .filter((item) => !units.some((unit) => unit.departmentId === item.id))
    .sort((a, b) => Number(b.approved) - Number(a.approved));
  const pendingApproved = newlyApprovedIds.filter(
    (id) => !units.some((unit) => unit.departmentId === id),
  );

  const blank = (found: { id: string; name: string }): AppraisalUnit => ({
    departmentId: found.id,
    departmentName: found.name,
    selfScore: hints[found.id]?.score ?? null,
    bonuses: criteria.map((item) => ({
      itemId: item.id,
      itemName: item.name,
      maxScore: item.maxScore,
      score: null,
      evidence: "",
    })),
    penalties: [],
    upgradeNote: "",
    proposedRating: "",
    ratingNote: "",
  });

  const addApproved = () => {
    if (!onChange) return;
    const adds = suggestedUnits.filter((item) =>
      pendingApproved.includes(item.id),
    );
    onChange([...units, ...adds.map(blank)]);
  };

  const addUnit = (id: string) => {
    const found = suggestedUnits.find((item) => item.id === id);
    if (!found || !onChange) return;
    onChange([
      ...units,
      {
        departmentId: found.id,
        departmentName: found.name,
        selfScore: hints[found.id]?.score ?? null,
        bonuses: criteria.map((item) => ({
          itemId: item.id,
          itemName: item.name,
          maxScore: item.maxScore,
          score: null,
          evidence: "",
        })),
        penalties: [],
        upgradeNote: "",
        proposedRating: "",
        ratingNote: "",
      },
    ]);
    setSelectedId(found.id);
    setMode("UNIT");
  };

  if (!units.length) {
    return (
      <div className="mx-auto max-w-xl space-y-3 rounded-lg border border-dashed px-4 py-10 text-center">
        <p className="font-medium">Chưa có đơn vị nào để thẩm định</p>
        <p className="text-sm text-muted-foreground">
          Đơn vị tự vào bảng khi có{" "}
          <strong className="text-foreground">
            báo cáo tháng do chính tài khoản này duyệt
          </strong>
          . Tháng này chưa có đơn vị nào như vậy.
        </p>
        {editable && missingSuggestions.length ? (
          <AddUnitPicker options={missingSuggestions} onPick={addUnit} />
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {editable && pendingApproved.length ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-sky-300 bg-sky-50 px-3 py-2 text-sm text-sky-950 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-100">
          <span>
            <strong className="font-semibold">{pendingApproved.length}</strong>{" "}
            đơn vị mới có báo cáo tháng bạn vừa duyệt, chưa có trong bảng.
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 bg-background"
            onClick={addApproved}
          >
            <Plus className="size-3.5" aria-hidden="true" />
            Thêm vào bảng
          </Button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-[14rem] flex-1 space-y-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Đã thẩm định</span>
            <span className="font-medium tabular-nums">
              {doneCount}/{units.length} đơn vị
            </span>
          </div>
          <Progress
            value={units.length ? (doneCount / units.length) * 100 : 0}
            aria-label="Tiến độ thẩm định"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedTabs
            ariaLabel="Cách xem"
            value={mode}
            onChange={setMode}
            items={[
              { value: "UNIT" as const, label: "Từng đơn vị" },
              { value: "TABLE" as const, label: "Bảng tổng" },
            ]}
          />
          {exportInfo ? (
            <Button
              type="button"
              variant="outline"
              className="bg-background"
              disabled={exporting}
              onClick={() => void runExport(units, false)}
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
          ) : null}
        </div>
      </div>

      {mode === "TABLE" ? (
        <SummaryTable
          rows={rows}
          onOpen={(id) => {
            setSelectedId(id);
            setMode("UNIT");
          }}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(16rem,20rem)_1fr]">
          {/* ---------------------------------------------- danh sách đơn vị */}
          <div className="space-y-2">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Tìm đơn vị…"
                aria-label="Tìm đơn vị"
                className="pl-8"
              />
            </div>
            <SegmentedTabs
              ariaLabel="Lọc đơn vị"
              value={filter}
              onChange={setFilter}
              className="w-full"
              items={[
                { value: "ALL" as const, label: "Tất cả", count: units.length },
                {
                  value: "TODO" as const,
                  label: "Chưa xong",
                  count: units.length - doneCount,
                },
                ...(savedUnits
                  ? [
                      {
                        value: "SAVED" as const,
                        label: "Đã lưu",
                        count: savedCount,
                      },
                    ]
                  : []),
                {
                  value: "COMMENDED" as const,
                  label: "Có biểu dương, phê bình",
                  count: commendedCount,
                },
              ].map((item) => ({
                value: item.value,
                label: (
                  // Huy hiệu đỏ như các hộp đến; số 0 thì ẩn.
                  <span className="inline-flex items-center">
                    {item.label}
                    <CountBadge
                      count={item.count}
                      label={`${item.count} đơn vị ${item.label.toLowerCase()}`}
                    />
                  </span>
                ),
              }))}
            />
            <ul
              className="max-h-[32rem] divide-y overflow-y-auto rounded-md border lg:max-h-[calc(100vh-18rem)]"
              aria-label="Đơn vị"
            >
              {visible.length === 0 ? (
                <li className="px-3 py-6 text-center text-xs text-muted-foreground">
                  Không có đơn vị nào khớp.
                </li>
              ) : null}
              {visible.map(({ unit, totals, saved }) => {
                const active =
                  selected?.unit.departmentId === unit.departmentId;
                const complete = unitComplete(unit);
                return (
                  <li key={unit.departmentId}>
                    <button
                      type="button"
                      aria-current={active ? "true" : undefined}
                      onClick={() => setSelectedId(unit.departmentId)}
                      className={cn(
                        "flex w-full items-center gap-2 border-l-2 px-3 py-2.5 text-left transition-colors",
                        active
                          ? "border-l-primary bg-primary/5"
                          : "border-l-transparent hover:bg-muted/60",
                      )}
                    >
                      {complete ? (
                        <CircleCheck
                          className="size-4 shrink-0 text-emerald-600"
                          aria-label="Đã xong"
                        />
                      ) : (
                        <CircleDashed
                          className="size-4 shrink-0 text-amber-500"
                          aria-label="Chưa xong"
                        />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-2 text-sm font-medium">
                          {unit.departmentName}
                        </span>
                        <UnitStatusBadge unit={unit} className="mt-1" />
                        {/* Sửa rồi mà chưa bấm Lưu nháp - nhắc ngay ở danh
                            sách, khỏi phải nhớ đã đụng vào đơn vị nào. */}
                        {editable && !saved ? (
                          <span className="mt-1 block text-xs font-medium text-amber-700 dark:text-amber-400">
                            Chưa lưu
                          </span>
                        ) : null}
                        <CommendationCount
                          hint={commendations[unit.departmentId]}
                        />
                        <span className="mt-0.5 block text-xs text-muted-foreground tabular-nums">
                          {fmt(unit.selfScore)}
                          {totals.bonusTotal ? (
                            <span className="text-emerald-700 dark:text-emerald-400">
                              {" "}
                              +{formatScore(totals.bonusTotal)}
                            </span>
                          ) : null}
                          {totals.penaltyTotal ? (
                            <span className="text-rose-700 dark:text-rose-400">
                              {" "}
                              −{formatScore(totals.penaltyTotal)}
                            </span>
                          ) : null}
                        </span>
                      </span>
                      <span className="shrink-0 text-sm font-semibold tabular-nums">
                        {fmt(totals.finalScore)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {editable && missingSuggestions.length ? (
              <AddUnitPicker options={missingSuggestions} onPick={addUnit} />
            ) : null}
          </div>

          {/* ------------------------------------------- đơn vị đang chọn */}
          {selected ? (
            <UnitEditor
              key={selected.unit.departmentId}
              unit={selected.unit}
              criteria={criteria}
              /* Từng đơn vị khoá riêng: đã trình (chờ / đã duyệt) thì chỉ đọc,
                 các đơn vị khác trong bảng vẫn sửa bình thường. */
              editable={editable && unitEditable(selected.unit)}
              hint={hints[selected.unit.departmentId]}
              commendation={commendations[selected.unit.departmentId]}
              saved={selected.saved}
              actions={unitActions}
              showClaims={selfClaims !== undefined}
              claims={selfClaims?.[selected.unit.departmentId]}
              onChange={(next) => patchUnit(selected.unit.departmentId, next)}
              /* Không có nút bỏ đơn vị: đơn vị vào bảng TỰ ĐỘNG theo báo cáo
                 tháng đã duyệt (user chốt 2026-10-19), bỏ ra là lần mở sau
                 nó quay lại. */
              onPrev={
                position > 0
                  ? () =>
                      setSelectedId(visible[position - 1]!.unit.departmentId)
                  : undefined
              }
              onNext={
                position >= 0 && position < visible.length - 1
                  ? () =>
                      setSelectedId(visible[position + 1]!.unit.departmentId)
                  : undefined
              }
              positionLabel={
                position >= 0 ? `${position + 1}/${visible.length}` : ""
              }
              onExport={
                exportInfo && !exporting
                  ? () => void runExport([selected.unit], true)
                  : undefined
              }
            />
          ) : null}
        </div>
      )}
    </div>
  );
}

/** Một dòng gợi ý: phòng nào đề xuất, nội dung, căn cứ, trạng thái bảng. */
function HintText({
  hint,
  label,
}: {
  hint: AppraisalCommendationHint;
  label?: string;
}) {
  return (
    <span className="min-w-0 flex-1 text-xs">
      <span className="text-muted-foreground">
        {label ? `${label} · ` : ""}
        <strong className="font-medium text-foreground">{hint.fromName}</strong>
        {/* Không ghi "chưa duyệt": đề xuất đã gửi lên là dùng để đối chiếu
            được, trạng thái duyệt bảng của phòng không liên quan tới việc thẩm
            định. Chỉ báo khi bảng bị trả lại - nội dung có thể còn đổi. */}
        {hint.status === "RETURNED" ? (
          <span className="ml-1 text-amber-700 dark:text-amber-400">
            (phòng đang sửa lại)
          </span>
        ) : null}
        :{" "}
      </span>
      <span className="whitespace-pre-wrap break-words">{hint.content}</span>
      {hint.evidence ? (
        <span className="block text-muted-foreground">
          Căn cứ: {hint.evidence}
        </span>
      ) : null}
      {/* Ghi chú thường là mức phòng đề xuất ("đề nghị trừ 1 điểm") - nổi bật
          hơn căn cứ vì đó là con số người thẩm định cân nhắc để chấm. */}
      {hint.note?.trim() ? (
        <span className="mt-0.5 block font-medium text-foreground">
          Ghi chú: {hint.note}
        </span>
      ) : null}
    </span>
  );
}

/** "2 biểu dương · 1 phê bình" ở danh sách - biết đơn vị nào có gì để soi. */
function CommendationCount({
  hint,
}: {
  hint?: AppraisalCommendationHints[string];
}) {
  if (!hint || (!hint.praises.length && !hint.criticisms.length)) return null;
  return (
    <span className="mt-1 flex flex-wrap gap-x-2 text-xs">
      {hint.praises.length ? (
        <span className="text-emerald-700 dark:text-emerald-400">
          {hint.praises.length} biểu dương
        </span>
      ) : null}
      {hint.criticisms.length ? (
        <span className="text-rose-700 dark:text-rose-400">
          {hint.criticisms.length} phê bình
        </span>
      ) : null}
    </span>
  );
}

/** Nhãn trạng thái của một đơn vị - nháp chưa trình thì không bày cho đỡ rối. */
export function UnitStatusBadge({
  unit,
  className,
}: {
  unit: AppraisalUnit;
  className?: string;
}) {
  if (!unit.status || unit.status === "DRAFT") return null;
  return (
    <Badge
      variant="secondary"
      className={cn(
        "whitespace-nowrap font-normal",
        DAY_STATUS_CLASS[unit.status],
        className,
      )}
    >
      {/* Ghi rõ CÁI GÌ bị trả lại - "Trả lại" trơn dễ hiểu nhầm thành báo
          cáo tháng của đơn vị bị trả. */}
      {unit.status === "RETURNED"
        ? "Thẩm định bị trả lại"
        : stagedStatusLabel({
            status: unit.status,
            stage: unit.stage ?? "FIRST",
            finalRecipientName: unit.finalRecipientName ?? "",
          })}
    </Badge>
  );
}

function AddUnitPicker({
  options,
  onPick,
}: {
  options: Array<{ id: string; name: string; approved: boolean }>;
  onPick: (id: string) => void;
}) {
  return (
    <SearchableSelect
      value=""
      onValueChange={(id) => id && onPick(id)}
      options={options.map((item) => ({
        value: item.id,
        label: item.name,
      }))}
      placeholder={`Thêm lại đơn vị đã bỏ (${options.length})…`}
      searchPlaceholder="Tìm đơn vị…"
      triggerClassName="bg-background"
    />
  );
}

/* ---------------------------------------------------------------- bảng tổng */

function SummaryTable({
  rows,
  onOpen,
}: {
  rows: Array<{
    unit: AppraisalUnit;
    totals: ReturnType<typeof appraisalTotals>;
  }>;
  onOpen: (departmentId: string) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full min-w-[48rem] text-sm">
        <thead className="bg-muted/50 text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="w-10 px-2 py-2 text-center font-medium">
              TT
            </th>
            <th scope="col" className="px-3 py-2 text-left font-medium">
              Đơn vị
            </th>
            <th scope="col" className="w-24 px-2 py-2 text-right font-medium">
              Tự chấm
            </th>
            <th scope="col" className="w-20 px-2 py-2 text-right font-medium">
              Cộng
            </th>
            <th scope="col" className="w-20 px-2 py-2 text-right font-medium">
              Trừ
            </th>
            <th scope="col" className="w-28 px-2 py-2 text-right font-medium">
              Sau thẩm định
            </th>
            <th scope="col" className="w-52 px-3 py-2 text-left font-medium">
              Đề xuất xếp loại
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map(({ unit, totals }, index) => (
            <tr
              key={unit.departmentId}
              className="cursor-pointer hover:bg-muted/50"
              onClick={() => onOpen(unit.departmentId)}
            >
              <td className="px-2 py-2 text-center tabular-nums text-muted-foreground">
                {String(index + 1).padStart(2, "0")}
              </td>
              <td className="px-3 py-2">
                <button
                  type="button"
                  className="text-left font-medium hover:underline"
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpen(unit.departmentId);
                  }}
                >
                  {unit.departmentName}
                </button>
              </td>
              <td className="px-2 py-2 text-right tabular-nums">
                {fmt(unit.selfScore)}
              </td>
              <td className="px-2 py-2 text-right tabular-nums text-emerald-700 dark:text-emerald-400">
                {totals.bonusTotal ? `+${formatScore(totals.bonusTotal)}` : "-"}
              </td>
              <td className="px-2 py-2 text-right tabular-nums text-rose-700 dark:text-rose-400">
                {totals.penaltyTotal
                  ? `−${formatScore(totals.penaltyTotal)}`
                  : "-"}
              </td>
              <td className="px-2 py-2 text-right font-semibold tabular-nums">
                {fmt(totals.finalScore)}
              </td>
              <td className="px-3 py-2">
                {unit.proposedRating || (
                  <span className="text-xs italic text-muted-foreground">
                    Chưa chọn
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------ một đơn vị */

/* Cột cố định cho từng loại dòng - ô điểm và ô chữ cùng cao 36px, thẳng hàng
   với nút xoá; ô chữ tự giãn khi gõ dài (field-sizing). */
const PENALTY_GRID = "sm:grid-cols-[1fr_8rem_2.25rem]";
/* Ô CHỈ ĐỌC (đơn vị đã trình, nơi duyệt xem) vẫn là dữ liệu cần đọc - không
   để mờ 50% như kiểu "khoá" mặc định; chỉ đổi nền và con trỏ cho biết không
   sửa được. */
const READONLY =
  "disabled:cursor-default disabled:opacity-100 disabled:bg-muted/30 disabled:text-foreground";
/* Ô trống: cao đúng 36px như ô điểm (placeholder dài không được kéo ô ra hai
   dòng); có chữ rồi mới tự giãn theo nội dung. */
const TEXT_CELL = `min-h-9 resize-none overflow-hidden py-[7px] leading-5 [field-sizing:content] placeholder-shown:h-9 placeholder-shown:[field-sizing:fixed] placeholder:truncate ${READONLY}`;


/**
 * Chỉ giữ chữ số và MỘT dấu thập phân ("," hoặc ".") - gõ chữ (kể cả bộ gõ
 * tiếng Việt) là bị lọc ngay, không chờ báo đỏ. Không dùng type="number" vì
 * kiểu đó không nhận "1,5".
 */
function onlyDecimal(raw: string): string {
  const cleaned = raw.replace(/[^0-9.,]/g, "");
  const at = cleaned.search(/[.,]/);
  if (at < 0) return cleaned;
  return cleaned.slice(0, at + 1) + cleaned.slice(at + 1).replace(/[.,]/g, "");
}

/** Ô số giữ chuỗi đang gõ ("1," giữa chừng), chốt số khi rời ô. */
function ScoreInput({
  id,
  value,
  onCommit,
  disabled,
  max,
  label,
  className,
}: {
  id?: string;
  value: number | null;
  onCommit: (next: number | null) => void;
  disabled?: boolean;
  max?: number | null;
  label: string;
  className?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown =
    draft ?? (value === null ? "" : String(value).replace(".", ","));
  const parsed = Number(shown.trim().replace(",", "."));
  const invalid =
    shown.trim() !== "" &&
    (!Number.isFinite(parsed) ||
      parsed < 0 ||
      (max !== null && max !== undefined && parsed > max));
  return (
    // Đuôi "điểm" ngay trong ô: ô số trơn đứng một mình không ai biết gõ gì.
    <div className={cn("relative", className)}>
      <Input
        id={id}
        value={shown}
        disabled={disabled}
        inputMode="decimal"
        placeholder="0"
        aria-label={label}
        aria-invalid={invalid}
        className={cn(
          "h-9 pr-11 text-right tabular-nums",
          READONLY,
          invalid && "border-destructive",
        )}
        onChange={(event) => setDraft(onlyDecimal(event.target.value))}
        onBlur={() => {
          if (draft === null) return;
          const text = draft.trim();
          setDraft(null);
          if (!text) return onCommit(null);
          const number = Number(text.replace(",", "."));
          if (!Number.isFinite(number) || number < 0) return;
          onCommit(
            max !== null && max !== undefined ? Math.min(number, max) : number,
          );
        }}
      />
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
        điểm
      </span>
    </div>
  );
}

function RemoveRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-9"
      aria-label={label}
      onClick={onClick}
    >
      <Trash2 className="size-4 text-muted-foreground" />
    </Button>
  );
}

function AddRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-8 bg-background"
      onClick={onClick}
    >
      <Plus className="size-3.5" aria-hidden="true" />
      {label}
    </Button>
  );
}

function PenaltyRow({
  label,
  penalty,
  editable,
  onPatch,
  onRemove,
}: {
  label: string;
  penalty: AppraisalUnit["penalties"][number];
  editable: boolean;
  onPatch: (patch: Partial<AppraisalUnit["penalties"][number]>) => void;
  /** Không có = dòng trống bày sẵn, không xoá được. */
  onRemove?: () => void;
}) {
  return (
    <div className={cn("grid items-start gap-2", PENALTY_GRID)}>
      <Textarea
        value={penalty.content}
        disabled={!editable}
        rows={1}
        aria-label={`Nội dung trừ - ${label}`}
        placeholder="VD: Chậm tiến độ, bị phê bình tại Thông báo số…"
        className={cn(TEXT_CELL, "bg-background")}
        onChange={(event) => onPatch({ content: event.target.value })}
      />
      <ScoreInput
        label={`Điểm trừ - ${label}`}
        value={penalty.score}
        disabled={!editable}
        onCommit={(score) => onPatch({ score })}
      />
      {editable && onRemove ? (
        <RemoveRow label="Bỏ dòng trừ điểm" onClick={onRemove} />
      ) : editable ? (
        <span aria-hidden="true" />
      ) : null}
    </div>
  );
}

/** Ô "Tiêu chí cộng điểm" - gộp dọc hết các dòng con của tiêu chí. */
function GroupHead({
  group,
  rowSpan,
}: {
  group: { name: string; maxScore: number | null };
  rowSpan: number;
}) {
  return (
    <td rowSpan={rowSpan} className="border-r px-2.5 py-2">
      <p className="text-pretty font-medium leading-snug">{group.name}</p>
      {group.maxScore !== null ? (
        <p className="mt-0.5 text-xs text-muted-foreground">
          Tối đa {formatScore(group.maxScore)} điểm
        </p>
      ) : null}
    </td>
  );
}

/**
 * Ô "Đơn vị tự nhận": các việc đơn vị khai ở Trục 2 đúng nội dung này, mỗi
 * việc kèm điểm tự chấm; dưới cùng là tổng tự nhận (đã chặn trần tiêu chí).
 * Chỉ đọc - người thẩm định đối chiếu rồi ghi kết quả công nhận bên cạnh.
 */
function ClaimCell({
  claim,
  rowSpan,
}: {
  claim?: AppraisalSelfClaim;
  rowSpan: number;
}) {
  return (
    <td rowSpan={rowSpan} className="border-r bg-muted/20 px-2.5 py-2">
      {claim?.lines.length ? (
        <div className="space-y-2">
          <ul className="space-y-1.5">
            {claim.lines.map((line, index) => (
              // Chỉ sản phẩm - tên nhiệm vụ không cần cho người thẩm định.
              <li key={index} className="break-words text-xs leading-snug">
                {line.product.trim() || (
                  <span className="italic text-muted-foreground">
                    (chưa ghi sản phẩm)
                  </span>
                )}
              </li>
            ))}
          </ul>
          <p className="border-t pt-1.5 text-xs font-semibold tabular-nums">
            Tự chấm{" "}
            <span className="text-emerald-700 dark:text-emerald-400">
              +{formatScore(claim.total)}
            </span>
          </p>
        </div>
      ) : (
        <p className="text-xs italic text-muted-foreground">Không nhận.</p>
      )}
    </td>
  );
}

function UnitEditor({
  unit,
  criteria,
  editable,
  hint,
  onChange,
  onRemove,
  onPrev,
  onNext,
  positionLabel,
  onExport,
  commendation,
  showClaims = false,
  claims,
  saved,
  actions,
}: {
  saved: boolean;
  actions?: UnitActions;
  unit: AppraisalUnit;
  criteria: AppraisalCriterion[];
  editable: boolean;
  hint?: { score: number; maxScore: number; title: string };
  /** Biểu dương / phê bình cùng tháng nhắc tới đơn vị này. */
  commendation?: AppraisalCommendationHints[string];
  /** Bày cột "Đơn vị tự nhận" (chỉ bên lập bảng có dữ liệu này). */
  showClaims?: boolean;
  /** Đơn vị tự nhận theo id tiêu chí. */
  claims?: Record<string, AppraisalSelfClaim>;
  onChange: (next: AppraisalUnit) => void;
  onRemove?: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  positionLabel: string;
  /** Xuất riêng đơn vị này ra Excel. */
  onExport?: () => void;
}) {
  const totals = appraisalTotals(unit);
  const set = (patch: Partial<AppraisalUnit>) =>
    onChange({ ...unit, ...patch });
  // null = báo cáo tháng không có dòng Trục 2 nào khớp tiêu chí.
  const claimList = Object.values(claims ?? {});
  const claimTotal = claimList.length
    ? claimList.reduce((sum, claim) => sum + claim.total, 0)
    : null;

  /* Tiêu chí theo danh mục, cộng thêm tiêu chí cũ chỉ còn trong bản đã lưu
     (danh mục đổi sau khi lập) - không để mất dòng nào. */
  const groups = useMemo(() => {
    const list = criteria.map((item) => ({
      id: item.id,
      name: item.name,
      maxScore: item.maxScore,
    }));
    for (const row of [...unit.bonuses, ...unit.penalties]) {
      if (row.itemId && !list.some((item) => item.id === row.itemId)) {
        list.push({
          id: row.itemId,
          name: row.itemName,
          maxScore: "maxScore" in row ? row.maxScore : null,
        });
      }
    }
    return list;
  }, [criteria, unit.bonuses, unit.penalties]);

  /* Dòng trừ cũ chưa gắn tiêu chí (bản lập trước khi tách theo tiêu chí) -
     vẫn bày ở nhóm riêng để không mất. */
  const loosePenalties = unit.penalties
    .map((penalty, index) => ({ penalty, index }))
    .filter(({ penalty }) => !penalty.itemId);

  /* index = -1 là DÒNG TRỐNG bày sẵn khi tiêu chí chưa có dòng nào: gõ vào
     đó thì mới thêm thật vào dữ liệu - để bảng không đầy dòng rỗng. */
  const patchBonus = (
    index: number,
    patch: Partial<AppraisalUnit["bonuses"][number]>,
    group?: { id: string; name: string; maxScore: number | null },
  ) =>
    set({
      bonuses:
        index < 0 && group
          ? [
              ...unit.bonuses,
              {
                itemId: group.id,
                itemName: group.name,
                maxScore: group.maxScore,
                score: null,
                evidence: "",
                ...patch,
              },
            ]
          : unit.bonuses.map((bonus, i) =>
              i === index ? { ...bonus, ...patch } : bonus,
            ),
    });

  const patchPenalty = (
    index: number,
    patch: Partial<AppraisalUnit["penalties"][number]>,
    group?: { id: string; name: string },
  ) =>
    set({
      penalties:
        index < 0 && group
          ? [
              ...unit.penalties,
              {
                itemId: group.id,
                itemName: group.name,
                content: "",
                score: null,
                ...patch,
              },
            ]
          : unit.penalties.map((penalty, i) =>
              i === index ? { ...penalty, ...patch } : penalty,
            ),
    });

  /* ---------------------------------------- soi chiếu biểu dương, phê bình */

  /** Đã đưa vào rồi: có dòng mang đúng nội dung đó (so cả chữ, bỏ khoảng). */
  const usedText = (text: string, rows: string[]) => {
    const needle = text.trim();
    return !!needle && rows.some((row) => row.includes(needle));
  };
  const bonusUsed = (h: AppraisalCommendationHint) =>
    usedText(
      h.content,
      unit.bonuses.map((bonus) => bonus.evidence),
    );
  const penaltyUsed = (h: AppraisalCommendationHint) =>
    usedText(
      h.content,
      unit.penalties.map((penalty) => penalty.content),
    );
  const [criticismsOpen, setCriticismsOpen] = useState(false);
  const criticismsPending = (commendation?.criticisms ?? []).filter(
    (h) => !penaltyUsed(h),
  ).length;

  /**
   * Đưa một dòng biểu dương vào điểm cộng ĐÚNG tiêu chí của nó. Tiêu chí còn
   * dòng trống (chưa điểm, chưa minh chứng) thì điền vào đó, không đẻ thêm
   * dòng rỗng. Điểm để trống - người thẩm định tự chấm.
   */
  const addBonusFromHint = (
    h: AppraisalCommendationHint,
    group: { id: string; name: string; maxScore: number | null },
  ) => {
    const text = hintText(h);
    const empty = unit.bonuses.findIndex(
      (bonus) =>
        bonus.itemId === group.id &&
        bonus.score === null &&
        !bonus.evidence.trim(),
    );
    set({
      bonuses:
        empty >= 0
          ? unit.bonuses.map((bonus, i) =>
              i === empty ? { ...bonus, evidence: text } : bonus,
            )
          : [
              ...unit.bonuses,
              {
                itemId: group.id,
                itemName: group.name,
                maxScore: group.maxScore,
                score: null,
                evidence: text,
              },
            ],
    });
  };

  /** Đưa một dòng phê bình vào điểm trừ ở tiêu chí người thẩm định chọn. */
  const addPenaltyFromHint = (
    h: AppraisalCommendationHint,
    group: { id: string; name: string },
  ) =>
    set({
      penalties: [
        ...unit.penalties,
        {
          itemId: group.id,
          itemName: group.name,
          content: hintText(h),
          score: null,
        },
      ],
    });

  const removeBonus = (index: number) =>
    set({ bonuses: unit.bonuses.filter((_, i) => i !== index) });
  const removePenalty = (index: number) =>
    set({ penalties: unit.penalties.filter((_, i) => i !== index) });

  return (
    <div className="min-w-0 space-y-5 rounded-lg border p-4">
      {/* -------------------------------------------------------- đầu khối */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <h3 className="text-pretty break-words font-display text-base font-semibold">
            {unit.departmentName}
          </h3>
          <UnitStatusBadge unit={unit} />
        </div>
        <div className="flex items-center gap-1">
          {positionLabel ? (
            <span className="mr-1 text-xs text-muted-foreground tabular-nums">
              {positionLabel}
            </span>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-8"
            disabled={!onPrev}
            onClick={onPrev}
            aria-label="Đơn vị trước"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-8"
            disabled={!onNext}
            onClick={onNext}
            aria-label="Đơn vị sau"
          >
            <ChevronRight className="size-4" />
          </Button>
          {onExport ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 bg-background"
              onClick={onExport}
              title="Xuất riêng đơn vị này ra Excel"
            >
              <FileDown className="size-3.5" aria-hidden="true" />
              Xuất riêng
            </Button>
          ) : null}
          {onRemove ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={onRemove}
              aria-label={`Bỏ ${unit.departmentName} khỏi bảng`}
              title="Bỏ đơn vị khỏi bảng"
            >
              <Trash2 className="size-4 text-destructive" />
            </Button>
          ) : null}
        </div>
      </div>

      {/* Đơn vị này đang ở đâu - nói ngay đầu khối, khỏi bấm thử ô khoá. */}
      {unit.status === "PENDING" || unit.status === "APPROVED" ? (
        <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
          {unit.status === "PENDING"
            ? `Đã trình ${unit.recipientName || "cấp trên"}${
                unit.sentAt ? ` lúc ${formatServerHm(unit.sentAt)}` : ""
              } - đang chờ duyệt, đơn vị này khoá cho tới khi được duyệt hoặc trả lại.`
            : `${unit.decidedByName || "Cấp trên"} đã duyệt${
                unit.decidedAt ? ` lúc ${formatServerHm(unit.decidedAt)}` : ""
              }. Đơn vị này đã chốt.`}
        </p>
      ) : unit.status === "RETURNED" ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          <strong className="font-semibold">Thẩm định bị trả lại:</strong>{" "}
          {unit.returnReason || "không nêu lý do"} - sửa, lưu rồi trình lại đơn
          vị này.
        </p>
      ) : null}

      {/* ---------------------------------------------- dải công thức điểm */}
      <div className="grid grid-cols-2 items-center gap-2 sm:grid-cols-4">
        {[
          { label: "Tự chấm", value: fmt(unit.selfScore), tone: "" },
          {
            label: "Điểm cộng",
            value: `+${formatScore(totals.bonusTotal)}`,
            tone: "text-emerald-700 dark:text-emerald-400",
          },
          {
            label: "Điểm trừ",
            value: `−${formatScore(totals.penaltyTotal)}`,
            tone: "text-rose-700 dark:text-rose-400",
          },
          {
            label: "Sau thẩm định",
            value: fmt(totals.finalScore),
            tone: "text-primary",
          },
        ].map((tile) => (
          <div
            key={tile.label}
            className="rounded-md border bg-muted/30 px-3 py-2 text-center"
          >
            <p className="text-xs text-muted-foreground">{tile.label}</p>
            <p
              className={cn(
                "font-display text-lg font-semibold tabular-nums",
                tile.tone,
              )}
            >
              {tile.value}
            </p>
          </div>
        ))}
      </div>

      {/* ---------------------------------------------------- tự chấm */}
      <section className="space-y-1.5">
        <p className="text-sm font-medium">Tổng điểm tự chấm</p>
        {/* CHỈ ĐỌC: là tổng điểm trên báo cáo tháng đơn vị đã trình - người
            thẩm định cộng / trừ trên đó, không sửa con số gốc. Server cũng
            tự lấy lại từ báo cáo, không nhận số client gửi. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <output className="flex h-9 w-36 items-center justify-end gap-1 rounded-md border border-dashed bg-muted/40 px-3 text-sm font-semibold tabular-nums">
            {fmt(unit.selfScore)}
            <span className="text-xs font-normal text-muted-foreground">
              điểm
            </span>
          </output>
          <p className="text-xs text-muted-foreground">
            {hint ? (
              <>
                Lấy từ báo cáo tháng đơn vị đã trình{" "}
                <span className="text-foreground">
                  &quot;{hint.title}&quot;
                </span>
                {hint.maxScore ? (
                  <>
                    {" "}
                    - trên tổng{" "}
                    <strong className="text-foreground tabular-nums">
                      {formatScore(hint.maxScore)}
                    </strong>
                  </>
                ) : null}
                . Không sửa ở đây; cần điều chỉnh thì cộng / trừ bên dưới.
              </>
            ) : (
              /* Chỉ còn gặp ở đơn vị ĐÃ TRÌNH mà báo cáo tháng sau đó bị trả
                 lại - đơn vị chưa trình thì đã tự rời bảng. */
              "Báo cáo tháng của đơn vị hiện không còn ở trạng thái bạn đã duyệt (có thể vừa bị trả lại) - giữ điểm tự chấm đã lưu; duyệt lại báo cáo tháng thì điểm tự cập nhật."
            )}
          </p>
        </div>
      </section>

      {/* ----------------------------------- soi chiếu: bị đề xuất phê bình */}
      {commendation?.criticisms.length ? (
        <section className="rounded-md border border-rose-200 bg-rose-50/40 dark:border-rose-900/60 dark:bg-rose-950/10">
          {/* Mặc định THU GỌN: một đơn vị có thể bị nhiều phòng đề xuất,
              bày hết ra là đẩy phần chấm điểm xuống tận dưới. Tiêu đề nói
              đủ số lượng và còn bao nhiêu chưa đưa vào để biết có nên mở. */}
          <button
            type="button"
            aria-expanded={criticismsOpen}
            onClick={() => setCriticismsOpen((open) => !open)}
            className="flex w-full cursor-pointer items-center gap-2 px-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <ChevronRight
              className={cn(
                "size-4 shrink-0 text-rose-800 transition-transform dark:text-rose-300",
                criticismsOpen && "rotate-90",
              )}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1 font-display text-sm font-semibold text-rose-900 dark:text-rose-200">
              Bị đề xuất phê bình, chấn chỉnh
            </span>
            <span className="shrink-0 rounded-full border border-rose-300 bg-background px-2 py-0.5 text-xs font-medium tabular-nums text-rose-800 dark:border-rose-900 dark:text-rose-300">
              {commendation.criticisms.length} đề xuất
            </span>
            {criticismsPending > 0 ? (
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {criticismsPending} chưa đưa vào
              </span>
            ) : (
              <span className="shrink-0 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                Đã đưa vào hết
              </span>
            )}
          </button>
          {criticismsOpen ? (
            <div className="space-y-2 border-t border-rose-200 px-3 pb-3 pt-2 dark:border-rose-900/60">
              <p className="text-xs text-muted-foreground">
                Từ bảng biểu dương, phê bình các phòng gửi tháng này. Phê bình
                không gắn tiêu chí - chọn tiêu chí để đưa vào điểm trừ, rồi nhập
                điểm.
              </p>
              <ul className="space-y-2">
                {commendation.criticisms.map((h) => {
                  const used = penaltyUsed(h);
                  return (
                    <li
                      key={h.rowId}
                      className="flex flex-wrap items-start justify-between gap-2 rounded-md border bg-background px-3 py-2"
                    >
                      <HintText hint={h} />
                      {used ? (
                        <span className="shrink-0 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                          Đã đưa vào điểm trừ
                        </span>
                      ) : editable ? (
                        <Select
                          value=""
                          onValueChange={(id) => {
                            const group = groups.find((item) => item.id === id);
                            if (group) addPenaltyFromHint(h, group);
                          }}
                        >
                          <SelectTrigger className="h-8 w-60 shrink-0 bg-background text-xs">
                            <SelectValue placeholder="Đưa vào điểm trừ ở tiêu chí…" />
                          </SelectTrigger>
                          <SelectContent>
                            {groups.map((group) => (
                              <SelectItem key={group.id} value={group.id}>
                                {group.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* ------------------------------------------- cộng / trừ theo tiêu chí */}
      <section className="space-y-2">
        <div>
          <h4 className="font-display text-sm font-semibold">
            Cộng điểm và trừ điểm theo tiêu chí
          </h4>
          <p className="text-xs text-muted-foreground">
            Bố cục như phụ lục giấy. Cột &quot;Đơn vị tự nhận&quot; lấy từ Trục
            2 của báo cáo tháng, chỉ đọc. Mỗi thành tích / vi phạm một dòng; điểm
            cộng của một tiêu chí chỉ tính tới mức tối đa, điểm trừ không trần.
          </p>
        </div>
        {/* Bảng rộng hơn khung trên màn nhỏ thì cuộn ngang TRONG khung, không
            đẩy cả trang. */}
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-[60rem] border-collapse text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th
                  rowSpan={2}
                  className="w-[15%] border-b border-r px-2.5 py-2 text-left font-medium"
                >
                  Tiêu chí cộng điểm
                </th>
                <th
                  colSpan={showClaims ? 3 : 2}
                  className="border-b border-r px-2.5 py-1.5 text-center font-semibold text-emerald-800 dark:text-emerald-300"
                >
                  Cộng điểm
                </th>
                <th
                  colSpan={2}
                  className="border-b px-2.5 py-1.5 text-center font-semibold text-rose-800 dark:text-rose-300"
                >
                  Trừ điểm
                </th>
              </tr>
              <tr>
                {showClaims ? (
                  <th className="w-[19%] border-b border-r px-2.5 py-1.5 text-left font-medium">
                    Đơn vị tự nhận
                  </th>
                ) : null}
                <th className="border-b border-r px-2.5 py-1.5 text-left font-medium">
                  Kết quả thẩm định, công nhận
                </th>
                <th className="w-32 border-b border-r px-2.5 py-1.5 text-left font-medium">
                  Điểm cộng sau thẩm định
                </th>
                <th className="border-b border-r px-2.5 py-1.5 text-left font-medium">
                  Cụ thể nội dung trừ điểm
                </th>
                <th className="w-32 border-b px-2.5 py-1.5 text-left font-medium">
                  Điểm trừ
                </th>
              </tr>
            </thead>
            {groups.map((group) => {
              const bonuses = unit.bonuses
                .map((bonus, index) => ({ bonus, index }))
                .filter(({ bonus }) => bonus.itemId === group.id);
              const penalties = unit.penalties
                .map((penalty, index) => ({ penalty, index }))
                .filter(({ penalty }) => penalty.itemId === group.id);
              /* Đang sửa mà tiêu chí chưa có dòng nào thì bày sẵn MỘT dòng
                 trống (index -1) ở cả hai bên - gõ vào là thành dòng thật. */
              const shownBonuses: Array<{
                bonus: AppraisalUnit["bonuses"][number] | null;
                index: number;
              }> = editable
                ? bonuses.length
                  ? bonuses
                  : [
                      {
                        bonus: {
                          itemId: group.id,
                          itemName: group.name,
                          maxScore: group.maxScore,
                          score: null,
                          evidence: "",
                        },
                        index: -1,
                      },
                    ]
                : bonuses.filter(
                    ({ bonus }) => bonus.score !== null || bonus.evidence.trim(),
                  );
              const shownPenalties: Array<{
                penalty: AppraisalUnit["penalties"][number] | null;
                index: number;
              }> =
                editable && !penalties.length
                  ? [
                      {
                        penalty: {
                          itemId: group.id,
                          itemName: group.name,
                          content: "",
                          score: null,
                        },
                        index: -1,
                      },
                    ]
                  : penalties;
              const used = bonuses.reduce(
                (sum, { bonus }) => sum + (bonus.score ?? 0),
                0,
              );
              const over = group.maxScore !== null && used > group.maxScore;
              const praises = (commendation?.praises ?? []).filter(
                (h) => h.itemId === group.id,
              );
              const claim = claims?.[group.id];
              /* Dòng con = dòng cộng thứ i ghép với dòng trừ thứ i, như phụ lục
                 giấy - hai bên dài ngắn khác nhau thì ô thiếu để trống. */
              const lineCount = Math.max(
                shownBonuses.length,
                shownPenalties.length,
                1,
              );
              const span =
                lineCount + (praises.length ? 1 : 0) + (editable ? 1 : 0);
              return (
                <tbody
                  key={group.id}
                  className="border-b last:border-b-0 [&_td]:align-top"
                >
                  {praises.length ? (
                    <tr>
                      <GroupHead group={group} rowSpan={span} />
                      {showClaims ? (
                        <ClaimCell claim={claim} rowSpan={span} />
                      ) : null}
                      <td colSpan={2} className="border-r px-2 pt-2">
                        <div className="space-y-1.5">
                          {praises.map((h) => (
                            <div
                              key={h.rowId}
                              className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-dashed border-emerald-300 bg-emerald-50/40 px-2.5 py-2 dark:border-emerald-900 dark:bg-emerald-950/10"
                            >
                              <HintText hint={h} label="Đề xuất biểu dương" />
                              {bonusUsed(h) ? (
                                <span className="shrink-0 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                                  Đã đưa vào
                                </span>
                              ) : editable ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-7 shrink-0 bg-background"
                                  onClick={() => addBonusFromHint(h, group)}
                                >
                                  <Plus
                                    className="size-3.5"
                                    aria-hidden="true"
                                  />
                                  Đưa vào điểm cộng
                                </Button>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      </td>
                      <td colSpan={2} />
                    </tr>
                  ) : null}
                  {Array.from({ length: lineCount }, (_, line) => {
                    const b = shownBonuses[line];
                    const p = shownPenalties[line];
                    const first = line === 0 && !praises.length;
                    return (
                      <tr key={line}>
                        {first ? (
                          <>
                            <GroupHead group={group} rowSpan={span} />
                            {showClaims ? (
                              <ClaimCell claim={claim} rowSpan={span} />
                            ) : null}
                          </>
                        ) : null}
                        <td className="border-r px-2 py-1.5">
                          {b?.bonus ? (
                            <Textarea
                              value={b.bonus.evidence}
                              disabled={!editable}
                              rows={1}
                              aria-label={`Kết quả thẩm định, công nhận - ${group.name}`}
                              placeholder={
                                line === 0
                                  ? "Nội dung công nhận / minh chứng…"
                                  : undefined
                              }
                              className={cn(TEXT_CELL, "bg-background")}
                              onChange={(event) =>
                                patchBonus(
                                  b.index,
                                  { evidence: event.target.value },
                                  group,
                                )
                              }
                            />
                          ) : null}
                        </td>
                        <td className="border-r px-2 py-1.5">
                          {b?.bonus ? (
                            <div className="flex items-start gap-1">
                              <ScoreInput
                                className="min-w-0 flex-1"
                                label={`Điểm cộng - ${group.name}`}
                                value={b.bonus.score}
                                /* Trần là của CẢ TIÊU CHÍ: dòng này chỉ được
                                   phần còn lại sau các dòng khác. */
                                max={
                                  group.maxScore === null
                                    ? null
                                    : Math.max(
                                        0,
                                        group.maxScore -
                                          (used - (b.bonus.score ?? 0)),
                                      )
                                }
                                disabled={!editable}
                                onCommit={(score) =>
                                  patchBonus(b.index, { score }, group)
                                }
                              />
                              {editable && b.index >= 0 ? (
                                <RemoveRow
                                  label="Bỏ dòng cộng điểm"
                                  onClick={() => removeBonus(b.index)}
                                />
                              ) : null}
                            </div>
                          ) : null}
                        </td>
                        <td className="border-r px-2 py-1.5">
                          {p?.penalty ? (
                            <Textarea
                              value={p.penalty.content}
                              disabled={!editable}
                              rows={1}
                              aria-label={`Nội dung trừ - ${group.name}`}
                              placeholder={
                                line === 0
                                  ? "VD: Chậm tiến độ, bị phê bình tại Thông báo số…"
                                  : undefined
                              }
                              className={cn(TEXT_CELL, "bg-background")}
                              onChange={(event) =>
                                patchPenalty(
                                  p.index,
                                  { content: event.target.value },
                                  group,
                                )
                              }
                            />
                          ) : null}
                        </td>
                        <td className="px-2 py-1.5">
                          {p?.penalty ? (
                            <div className="flex items-start gap-1">
                              <ScoreInput
                                className="min-w-0 flex-1"
                                label={`Điểm trừ - ${group.name}`}
                                value={p.penalty.score}
                                disabled={!editable}
                                onCommit={(score) =>
                                  patchPenalty(p.index, { score }, group)
                                }
                              />
                              {editable && p.index >= 0 ? (
                                <RemoveRow
                                  label="Bỏ dòng trừ điểm"
                                  onClick={() => removePenalty(p.index)}
                                />
                              ) : null}
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                  {editable ? (
                    <tr>
                      <td colSpan={2} className="border-r px-2 pb-2 pt-0.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <AddRow
                            label="Thêm dòng cộng"
                            onClick={() =>
                              set({
                                bonuses: [
                                  ...unit.bonuses,
                                  {
                                    itemId: group.id,
                                    itemName: group.name,
                                    maxScore: group.maxScore,
                                    score: null,
                                    evidence: "",
                                  },
                                ],
                              })
                            }
                          />
                          {group.maxScore !== null ? (
                            <span
                              className={cn(
                                "text-xs tabular-nums",
                                over
                                  ? "text-destructive"
                                  : "text-muted-foreground",
                              )}
                            >
                              {over
                                ? `Vượt tối đa - chỉ tính ${formatScore(group.maxScore)}`
                                : `Còn ${formatScore(Math.max(0, group.maxScore - used))} / ${formatScore(group.maxScore)}`}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td colSpan={2} className="px-2 pb-2 pt-0.5">
                        <AddRow
                          label="Thêm dòng trừ"
                          onClick={() =>
                            set({
                              penalties: [
                                ...unit.penalties,
                                {
                                  itemId: group.id,
                                  itemName: group.name,
                                  content: "",
                                  score: null,
                                },
                              ],
                            })
                          }
                        />
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              );
            })}

            {loosePenalties.length ? (
              <tbody className="border-t [&_td]:align-top">
                {loosePenalties.map(({ penalty, index }, line) => (
                  <tr key={index}>
                    {line === 0 ? (
                      <td
                        rowSpan={loosePenalties.length}
                        colSpan={showClaims ? 4 : 3}
                        className="border-r px-2.5 py-2 text-sm font-semibold"
                      >
                        Trừ điểm khác
                      </td>
                    ) : null}
                    <td colSpan={2} className="px-2 py-1.5">
                      <PenaltyRow
                        label="Trừ điểm khác"
                        penalty={penalty}
                        editable={editable}
                        onPatch={(patch) => patchPenalty(index, patch)}
                        onRemove={() => removePenalty(index)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            ) : null}

            {/* Dòng tổng như phụ lục giấy. */}
            <tfoot className="border-t-2 bg-muted/40 text-sm font-semibold tabular-nums">
              <tr>
                <td className="border-r px-2.5 py-2">Tổng điểm cộng / trừ</td>
                {showClaims ? (
                  <td className="border-r px-2.5 py-2 text-muted-foreground">
                    {claimTotal !== null ? (
                      <>
                        Tự nhận{" "}
                        <span className="text-emerald-700 dark:text-emerald-400">
                          +{formatScore(claimTotal)}
                        </span>
                      </>
                    ) : null}
                  </td>
                ) : null}
                <td className="border-r" />
                <td className="border-r px-2.5 py-2 text-right text-emerald-700 dark:text-emerald-400">
                  +{formatScore(totals.bonusTotal)}
                </td>
                <td className="border-r" />
                <td className="px-2.5 py-2 text-right text-rose-700 dark:text-rose-400">
                  −{formatScore(totals.penaltyTotal)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* ------------------------------------------------------ xếp loại */}
      <section className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`rating-${unit.departmentId}`}>
            Đề xuất mức xếp loại <span className="text-destructive">*</span>
          </Label>
          <Select
            value={unit.proposedRating || undefined}
            disabled={!editable}
            onValueChange={(next) =>
              set({ proposedRating: next as TeamReportRating })
            }
          >
            <SelectTrigger
              id={`rating-${unit.departmentId}`}
              className={cn("w-full", READONLY)}
            >
              <SelectValue placeholder="Chọn mức xếp loại" />
            </SelectTrigger>
            <SelectContent>
              {TEAM_REPORT_RATINGS.map((rating) => (
                <SelectItem key={rating} value={rating}>
                  {rating}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`rating-note-${unit.departmentId}`}>
            Lý do / ghi chú xếp loại
          </Label>
          <Textarea
            id={`rating-note-${unit.departmentId}`}
            value={unit.ratingNote}
            disabled={!editable}
            rows={1}
            className={TEXT_CELL}
            placeholder="VD: Mức điểm cao, tuy nhiên khống chế mức xếp loại do…"
            onChange={(event) => set({ ratingNote: event.target.value })}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={`upgrade-${unit.departmentId}`}>
            Đề nghị nâng mức xếp loại{" "}
            <span className="font-normal text-muted-foreground">(nếu có)</span>
          </Label>
          <Textarea
            id={`upgrade-${unit.departmentId}`}
            value={unit.upgradeNote}
            disabled={!editable}
            rows={1}
            className={TEXT_CELL}
            placeholder="Đề nghị nâng mức xếp loại… do: …"
            onChange={(event) => set({ upgradeNote: event.target.value })}
          />
        </div>
      </section>

      {/* ------------------------------------- lưu / trình RIÊNG đơn vị này */}
      {actions && editable ? (
        <UnitActionBar
          unit={unit}
          saved={saved}
          actions={actions}
          finalScore={totals.finalScore}
        />
      ) : null}
    </div>
  );
}

/**
 * Thanh cuối khối đơn vị: Lưu và Trình CHỈ đơn vị đang mở. Dính đáy màn khi
 * cuộn - bảng tiêu chí dài, kéo xuống tận cuối mới thấy nút là bất tiện.
 */
function UnitActionBar({
  unit,
  saved,
  actions,
  finalScore,
}: {
  unit: AppraisalUnit;
  saved: boolean;
  actions: UnitActions;
  finalScore: number | null;
}) {
  const blocker = actions.sendBlocker(unit);
  return (
    <div className="sticky bottom-0 z-10 -mx-4 -mb-4 flex flex-wrap items-center justify-between gap-2 rounded-b-lg border-t bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <p className="min-w-0 flex-1 text-xs">
        {!saved ? (
          <span className="font-medium text-amber-700 dark:text-amber-400">
            Đơn vị này có thay đổi chưa lưu.
          </span>
        ) : blocker ? (
          <span className="text-muted-foreground">{blocker}</span>
        ) : (
          <span className="text-muted-foreground">
            Đã lưu - sau thẩm định{" "}
            <strong className="text-foreground tabular-nums">
              {fmt(finalScore)}
            </strong>
            {unit.proposedRating ? ` · ${unit.proposedRating}` : ""}. Sẵn sàng
            trình.
          </span>
        )}
      </p>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={actions.busy || saved}
          onClick={() => actions.onSave(unit.departmentId)}
        >
          {actions.busy ? (
            <Loader2
              className="size-4 motion-safe:animate-spin"
              aria-hidden="true"
            />
          ) : (
            <Save className="size-4" aria-hidden="true" />
          )}
          {saved ? "Đã lưu" : "Lưu"}
        </Button>
        <Button
          type="button"
          disabled={actions.busy || !!blocker}
          onClick={() => actions.onSend(unit.departmentId)}
        >
          <Send className="size-4" aria-hidden="true" />
          {unit.status === "RETURNED" ? "Trình lại" : "Trình duyệt"}
        </Button>
      </div>
    </div>
  );
}
