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
  Search,
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
  type AppraisalCommendationHint,
  type AppraisalCommendationHints,
  type AppraisalComposerData,
  type AppraisalCriterion,
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

type Filter = "ALL" | "TODO" | "ADJUSTED";
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
        { ...exportInfo, criteria, units: picked },
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
    () => units.map((unit) => ({ unit, totals: appraisalTotals(unit) })),
    [units],
  );
  const doneCount = rows.filter((row) => unitComplete(row.unit)).length;
  const adjustedCount = rows.filter(
    ({ totals }) => totals.bonusTotal > 0 || totals.penaltyTotal > 0,
  ).length;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(({ unit, totals }) => {
      if (q && !unit.departmentName.toLowerCase().includes(q)) return false;
      if (filter === "TODO") return !unitComplete(unit);
      if (filter === "ADJUSTED") {
        return totals.bonusTotal > 0 || totals.penaltyTotal > 0;
      }
      return true;
    });
  }, [rows, query, filter]);

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

  const removeUnit = (id: string) => {
    if (!onChange) return;
    const index = units.findIndex((unit) => unit.departmentId === id);
    const next = units.filter((unit) => unit.departmentId !== id);
    onChange(next);
    setSelectedId(next[Math.min(index, next.length - 1)]?.departmentId ?? null);
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
          , hoặc được{" "}
          <strong className="text-foreground">
            nêu tên trong bảng biểu dương, phê bình
          </strong>{" "}
          các phòng gửi tới bạn tháng này. Tháng này chưa có đơn vị nào như
          vậy.
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
            đơn vị mới (có báo cáo tháng bạn vừa duyệt, hoặc được nêu trong
            bảng biểu dương, phê bình), chưa có trong bảng.
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
                {
                  value: "ADJUSTED" as const,
                  label: "Có cộng/trừ",
                  count: adjustedCount,
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
              {visible.map(({ unit, totals }) => {
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
              onChange={(next) => patchUnit(selected.unit.departmentId, next)}
              onRemove={
                // Đã trình một lần thì không bỏ khỏi bảng được nữa.
                editable && !selected.unit.sentAt
                  ? () => removeUnit(selected.unit.departmentId)
                  : undefined
              }
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
      {stagedStatusLabel({
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
const BONUS_GRID = "sm:grid-cols-[1fr_8rem_2.25rem]";
const PENALTY_GRID = "sm:grid-cols-[1fr_8rem_2.25rem]";
/* Ô trống: cao đúng 36px như ô điểm (placeholder dài không được kéo ô ra hai
   dòng); có chữ rồi mới tự giãn theo nội dung. */
const TEXT_CELL =
  "min-h-9 resize-none overflow-hidden py-[7px] leading-5 [field-sizing:content] placeholder-shown:h-9 placeholder-shown:[field-sizing:fixed] placeholder:truncate";

/** Tiêu đề cột của một nhóm dòng - ô trống không nhãn thì không ai biết gõ gì. */
function RowHeads({
  columns,
  template,
  trailing,
}: {
  columns: string[];
  template: string;
  trailing: boolean;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "hidden gap-2 text-xs font-medium text-muted-foreground sm:grid",
        template,
      )}
    >
      {columns.map((title) => (
        <span key={title}>{title}</span>
      ))}
      {trailing ? <span /> : null}
    </div>
  );
}

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
}: {
  unit: AppraisalUnit;
  criteria: AppraisalCriterion[];
  editable: boolean;
  hint?: { score: number; maxScore: number; title: string };
  /** Biểu dương / phê bình cùng tháng nhắc tới đơn vị này. */
  commendation?: AppraisalCommendationHints[string];
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
          <strong className="font-semibold">Bị trả lại:</strong>{" "}
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
              /* Đơn vị vào bảng từ bảng biểu dương, phê bình - chưa có báo cáo
                 tháng được duyệt nên chưa có điểm tự chấm. */
              "Chưa có báo cáo tháng được duyệt - điểm tự chấm sẽ tự điền khi bạn duyệt báo cáo tháng của đơn vị. Có thể chuẩn bị cộng / trừ trước; trình được khi đã có điểm tự chấm."
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
            Như phụ lục giấy: mỗi tiêu chí có hai cột độc lập - cùng một tiêu
            chí vừa cộng vừa trừ được. Mỗi thành tích / vi phạm một dòng. Điểm
            cộng của một tiêu chí chỉ tính tới mức tối đa; điểm trừ không trần.
          </p>
        </div>
        <div className="divide-y rounded-md border">
          {groups.map((group) => {
            const bonuses = unit.bonuses
              .map((bonus, index) => ({ bonus, index }))
              .filter(({ bonus }) => bonus.itemId === group.id);
            const penalties = unit.penalties
              .map((penalty, index) => ({ penalty, index }))
              .filter(({ penalty }) => penalty.itemId === group.id);
            /* Đang sửa mà tiêu chí chưa có dòng nào thì bày sẵn MỘT dòng trống
               (index -1) ở cả hai bên - gõ vào là thành dòng thật. */
            const shownBonuses = editable
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
            const shownPenalties =
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
            const minus = penalties.reduce(
              (sum, { penalty }) => sum + (penalty.score ?? 0),
              0,
            );
            const over = group.maxScore !== null && used > group.maxScore;
            return (
              <div key={group.id} className="space-y-3 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 text-sm font-semibold">
                    {group.name}
                    {group.maxScore !== null ? (
                      <span className="font-normal text-muted-foreground">
                        {" "}
                        (tối đa {formatScore(group.maxScore)} điểm)
                      </span>
                    ) : null}
                  </p>
                  <span className="flex shrink-0 items-center gap-1.5 text-xs tabular-nums">
                    <span
                      className={cn(
                        "rounded-full border px-2 py-0.5",
                        over
                          ? "border-destructive text-destructive"
                          : "border-emerald-300 text-emerald-800 dark:border-emerald-900 dark:text-emerald-300",
                      )}
                      title={
                        over
                          ? "Vượt mức tối đa - chỉ tính tới mức tối đa của tiêu chí"
                          : undefined
                      }
                    >
                      +{formatScore(used)}
                    </span>
                    <span className="rounded-full border border-rose-300 px-2 py-0.5 text-rose-800 dark:border-rose-900 dark:text-rose-300">
                      −{formatScore(minus)}
                    </span>
                  </span>
                </div>

                <div className="grid gap-3 xl:grid-cols-2">
                  {/* ---------------------------------------------- cộng */}
                  <div className="space-y-2 rounded-md border border-emerald-200 bg-emerald-50/40 p-2.5 dark:border-emerald-900/60 dark:bg-emerald-950/10">
                    <p className="flex flex-wrap items-baseline justify-between gap-x-2 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                      Điểm cộng
                      {group.maxScore !== null ? (
                        <span
                          className={cn(
                            "font-normal tabular-nums",
                            over ? "text-destructive" : "text-muted-foreground",
                          )}
                        >
                          {over
                            ? `Vượt tối đa - chỉ tính ${formatScore(group.maxScore)} điểm`
                            : `Tổng các dòng tối đa ${formatScore(group.maxScore)} · còn ${formatScore(
                                Math.max(0, group.maxScore - used),
                              )}`}
                        </span>
                      ) : null}
                    </p>
                    {/* Soi chiếu: các phòng đề xuất biểu dương đơn vị này ở
                        đúng nhóm nội dung = tiêu chí này. */}
                    {(commendation?.praises ?? [])
                      .filter((h) => h.itemId === group.id)
                      .map((h) => {
                        const taken = bonusUsed(h);
                        return (
                          <div
                            key={h.rowId}
                            className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-dashed border-emerald-300 bg-background px-2.5 py-2 dark:border-emerald-900"
                          >
                            <HintText hint={h} label="Đề xuất biểu dương" />
                            {taken ? (
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
                                <Plus className="size-3.5" aria-hidden="true" />
                                Đưa vào điểm cộng
                              </Button>
                            ) : null}
                          </div>
                        );
                      })}
                    {shownBonuses.length === 0 ? (
                      <p className="text-xs italic text-muted-foreground">
                        Không cộng.
                      </p>
                    ) : (
                      <RowHeads
                        columns={["Cụ thể nội dung minh chứng", "Điểm cộng"]}
                        template={BONUS_GRID}
                        trailing={editable}
                      />
                    )}
                    {shownBonuses.map(({ bonus, index }) => (
                      <div
                        key={index}
                        className={cn("grid items-start gap-2", BONUS_GRID)}
                      >
                        <Textarea
                          value={bonus.evidence}
                          disabled={!editable}
                          rows={1}
                          aria-label={`Minh chứng cộng - ${group.name}`}
                          placeholder="VD: Hoàn thành 17/27 giao dịch đáng ngờ, vượt mức dẫn đầu cụm thi đua…"
                          className={cn(TEXT_CELL, "bg-background")}
                          onChange={(event) =>
                            patchBonus(
                              index,
                              { evidence: event.target.value },
                              group,
                            )
                          }
                        />
                        <ScoreInput
                          label={`Điểm cộng - ${group.name}`}
                          value={bonus.score}
                          /* Trần là của CẢ TIÊU CHÍ: dòng này chỉ được phần
                             còn lại sau các dòng khác cùng tiêu chí. */
                          max={
                            group.maxScore === null
                              ? null
                              : Math.max(
                                  0,
                                  group.maxScore - (used - (bonus.score ?? 0)),
                                )
                          }
                          disabled={!editable}
                          onCommit={(score) =>
                            patchBonus(index, { score }, group)
                          }
                        />
                        {editable && index >= 0 ? (
                          <RemoveRow
                            label="Bỏ dòng cộng điểm"
                            onClick={() => removeBonus(index)}
                          />
                        ) : null}
                      </div>
                    ))}
                    {editable ? (
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
                    ) : null}
                  </div>

                  {/* ----------------------------------------------- trừ */}
                  <div className="space-y-2 rounded-md border border-rose-200 bg-rose-50/40 p-2.5 dark:border-rose-900/60 dark:bg-rose-950/10">
                    <p className="flex flex-wrap items-baseline justify-between gap-x-2 text-xs font-semibold text-rose-800 dark:text-rose-300">
                      Điểm trừ
                      <span className="font-normal text-muted-foreground">
                        Không giới hạn
                      </span>
                    </p>
                    {shownPenalties.length === 0 ? (
                      <p className="text-xs italic text-muted-foreground">
                        Không trừ.
                      </p>
                    ) : (
                      <RowHeads
                        columns={["Cụ thể nội dung trừ điểm", "Điểm trừ"]}
                        template={PENALTY_GRID}
                        trailing={editable}
                      />
                    )}
                    {shownPenalties.map(({ penalty, index }) => (
                      <PenaltyRow
                        key={index}
                        label={group.name}
                        penalty={penalty}
                        editable={editable}
                        onPatch={(patch) => patchPenalty(index, patch, group)}
                        onRemove={
                          index >= 0 ? () => removePenalty(index) : undefined
                        }
                      />
                    ))}
                    {editable ? (
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
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}

          {loosePenalties.length ? (
            <div className="space-y-2 p-3">
              <p className="text-sm font-semibold">Trừ điểm khác</p>
              <RowHeads
                columns={["Cụ thể nội dung trừ điểm", "Điểm trừ"]}
                template={PENALTY_GRID}
                trailing={editable}
              />
              {loosePenalties.map(({ penalty, index }) => (
                <PenaltyRow
                  key={index}
                  label="Trừ điểm khác"
                  penalty={penalty}
                  editable={editable}
                  onPatch={(patch) => patchPenalty(index, patch)}
                  onRemove={() => removePenalty(index)}
                />
              ))}
            </div>
          ) : null}
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
              className="w-full"
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
    </div>
  );
}
