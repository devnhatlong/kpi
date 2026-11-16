"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  ClipboardList,
  FileCheck2,
  Search,
} from "lucide-react";
import useSWR from "swr";
import { toast } from "sonner";

import { SearchableSelect } from "@/components/common/searchable-select";
import { TablePagination } from "@/components/common/table-pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useAuth } from "@/features/auth/auth-provider";
import { isSuperAdmin } from "@/features/auth/types";
import { StatTile } from "@/features/statistics/components/stat-tile";
import {
  fetchOverviewSettings,
  fetchTeamReportOverview,
  saveOverviewSettings,
  type OverviewMonthStatus,
  type OverviewUnit,
  type OverviewUnitFilter,
  type TeamReportOverview,
} from "@/features/team-report/overview-api";
import {
  TEAM_REPORT_PERIOD_LABEL,
  type TeamReportPeriod,
} from "@/features/team-report/types";
import { getApiErrorMessage } from "@/lib/api-client";
import { formatYmd } from "@/lib/server-time";
import { cn } from "@/lib/utils";

const PERIOD_ORDER: TeamReportPeriod[] = [
  "MONTH",
  "WEEK",
  "QUARTER",
  "YEAR",
  "CUSTOM",
  "DAY",
];

const ALL_UNITS = "__all__";

const STATUS_LABEL: Record<OverviewMonthStatus, string> = {
  ON_TIME: "Đúng hạn",
  LATE: "Trễ hạn",
  MISSING: "Chưa trình",
  NOT_DUE: "Chưa tới hạn",
};

const STATUS_CLASS: Record<OverviewMonthStatus, string> = {
  ON_TIME:
    "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
  LATE: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  MISSING: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400",
  NOT_DUE: "bg-muted text-muted-foreground",
};

const nf = new Intl.NumberFormat("vi-VN");
const pf = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 });

/**
 * Số liệu cho văn bản báo cáo: số nhiệm vụ khai trong kỳ, số báo cáo đã trình,
 * tỷ lệ đơn vị trình báo cáo tháng đúng hạn - kèm câu báo cáo điền sẵn số.
 *
 * Quản trị xem toàn bộ, chọn được đơn vị bất kỳ; tài khoản khác chỉ thấy đơn
 * vị mình + cấp dưới (server khoá, màn chỉ bày đúng danh sách server trả).
 */
export function ReportOverviewView({
  fromDate,
  toDate,
}: {
  fromDate: string;
  toDate: string;
}) {
  const { user } = useAuth();
  const admin = isSuperAdmin(user);

  const [unit, setUnit] = useState<string>(ALL_UNITS);
  const [periods, setPeriods] = useState<TeamReportPeriod[]>(["MONTH"]);

  // Bảng từng đơn vị: phân trang, tìm, lọc đều ở server.
  const [limit, setLimit] = useState(10);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<OverviewUnitFilter | "">("");
  useEffect(() => {
    // Gõ xong 300ms mới gọi - không bắn một request cho mỗi phím.
    const timer = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  /* Trang gắn với bộ lọc: đổi kỳ, đơn vị, loại báo cáo, chữ tìm, tình trạng
     hay số dòng thì tự về trang 1 - không phải nhớ gọi tay ở từng chỗ. */
  const filterKey = [fromDate, toDate, unit, periods.join(","), q, status, limit]
    .map(String)
    .join("|");
  const [pageState, setPageState] = useState({ key: filterKey, page: 1 });
  const page = pageState.key === filterKey ? pageState.page : 1;
  const setPage = (next: number) =>
    setPageState({ key: filterKey, page: next });

  const rangeValid = Boolean(fromDate && toDate && fromDate <= toDate);

  const params = {
    fromDate,
    toDate,
    departmentId: unit === ALL_UNITS ? undefined : unit,
    periods,
    page,
    limit,
    q: q || undefined,
    status: status || undefined,
  };
  const { data, error, isLoading, isValidating, mutate } = useSWR(
    rangeValid && periods.length
      ? [
          "team-report",
          "overview",
          fromDate,
          toDate,
          unit,
          periods.join(","),
          page,
          limit,
          q,
          status,
        ]
      : null,
    () => fetchTeamReportOverview(params),
    { revalidateOnFocus: false, keepPreviousData: true },
  );

  /* Giữ danh sách đơn vị lần nạp gần nhất: đang tải lại thì ô chọn không trống
     đi rồi nhảy về "Toàn bộ". */
  const departmentOptions = data?.departmentOptions;
  const unitOptions = useMemo(
    () => [
      {
        value: ALL_UNITS,
        label: admin ? "Toàn bộ đơn vị" : "Đơn vị mình và cấp dưới",
      },
      ...(departmentOptions ?? []).map((o) => ({
        value: o.id,
        label: o.name,
        depth: o.depth,
      })),
    ],
    [admin, departmentOptions],
  );

  return (
    <div className="space-y-4">
      {/* Lọc riêng của phần này - kỳ đã chọn ở đầu trang. */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 py-4">
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">
              Đơn vị
            </div>
            <SearchableSelect
              value={unit}
              onValueChange={setUnit}
              options={unitOptions}
              searchPlaceholder="Tìm đơn vị (gõ không dấu cũng được)..."
              emptyText="Không có đơn vị nào khớp."
              triggerClassName="w-80 bg-background"
              className="w-[26rem]"
              aria-label="Đơn vị"
            />
          </div>

          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">
              Loại báo cáo được đếm
            </div>
            <ToggleGroup
              type="multiple"
              variant="outline"
              size="sm"
              value={periods}
              onValueChange={(v) => {
                // Giữ ít nhất một loại - bỏ hết thì không có gì để đếm.
                if (!v.length) return;
                setPeriods(v as TeamReportPeriod[]);
              }}
              className="flex-wrap justify-start"
            >
              {PERIOD_ORDER.map((p) => (
                <ToggleGroupItem key={p} value={p} className="px-2.5">
                  {TEAM_REPORT_PERIOD_LABEL[p].replace("Báo cáo ", "")}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

        </CardContent>
      </Card>

      {error ? (
        <Card>
          <CardContent className="py-6 text-center text-sm text-destructive">
            {getApiErrorMessage(error, "Không tải được số liệu.")}
          </CardContent>
        </Card>
      ) : isLoading && !data ? (
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : data ? (
        <div
          className={cn(
            "space-y-4",
            isValidating && "opacity-60 transition-opacity",
          )}
        >
          <div className="grid items-center gap-4 md:grid-cols-3">
            <StatTile
              label="Nhiệm vụ, kết quả công tác được cập nhật"
              value={nf.format(data.tasks.total)}
              hint="Việc có ngày khai nằm trong kỳ"
              icon={ClipboardList}
              tone="info"
            />
            <StatTile
              label="Báo cáo tự đánh giá đã trình"
              value={nf.format(data.summaries.total)}
              hint={
                PERIOD_ORDER.filter((p) => data.summaries.byPeriod[p])
                  .map(
                    (p) =>
                      `${TEAM_REPORT_PERIOD_LABEL[p].replace("Báo cáo ", "")}: ${nf.format(data.summaries.byPeriod[p] ?? 0)}`,
                  )
                  .join(" · ") || "Chưa có bản nào"
              }
              icon={FileCheck2}
              tone="success"
            />
            <StatTile
              label="Đơn vị trình báo cáo tháng đúng hạn"
              value={
                data.onTime.rate === null
                  ? "-"
                  : `${pf.format(data.onTime.rate)}%`
              }
              hint={
                data.onTime.periods.length === 0
                  ? "Khoảng này không chứa ngày 14 nào"
                  : data.onTime.due === 0
                    ? "Kỳ chưa tới hạn"
                    : `${nf.format(data.onTime.ON_TIME)}/${nf.format(data.onTime.due)} đúng hạn · ${nf.format(data.onTime.LATE)} trễ · ${nf.format(data.onTime.MISSING)} chưa trình`
              }
              icon={CalendarClock}
              tone={
                data.onTime.rate === null
                  ? "neutral"
                  : data.onTime.rate >= 100
                    ? "success"
                    : "warning"
              }
            />
          </div>

          {/* Luật đúng hạn phải đọc được ngay cạnh con số - tài khoản đơn vị
              không thấy ô cài đặt của quản trị. */}
          <p className="text-xs text-muted-foreground">
            Hạn trình báo cáo tháng: ngày 14 + {data.onTime.graceDays} ngày
            {data.onTime.periods.length
              ? ` (kỳ này hạn hết ngày ${data.onTime.periods
                  .map((p) => formatYmd(p.deadline))
                  .join(", ")})`
              : ""}
            . Mốc là lần trình đầu, trình lại sau khi bị trả không tính trễ.
          </p>

          {admin ? <GraceDaysSetting onSaved={() => void mutate()} /> : null}

          <UnitsTable
            units={data.units}
            meta={data.unitsMeta}
            counts={data.unitStatusCounts}
            inScope={data.unitsInScope}
            search={search}
            onSearchChange={setSearch}
            status={status}
            onStatusChange={setStatus}
            onPageChange={setPage}
            onLimitChange={setLimit}
            busy={isValidating}
          />
        </div>
      ) : null}
    </div>
  );
}

const FILTERS: Array<{ value: OverviewUnitFilter | ""; label: string }> = [
  { value: "", label: "Tất cả" },
  { value: "ON_TIME", label: STATUS_LABEL.ON_TIME },
  { value: "LATE", label: STATUS_LABEL.LATE },
  { value: "MISSING", label: STATUS_LABEL.MISSING },
  { value: "NOT_DUE", label: STATUS_LABEL.NOT_DUE },
  { value: "NOT_REQUIRED", label: "Không phải trình" },
];

function UnitsTable({
  units,
  meta,
  counts,
  inScope,
  search,
  onSearchChange,
  status,
  onStatusChange,
  onPageChange,
  onLimitChange,
  busy,
}: {
  units: OverviewUnit[];
  meta: TeamReportOverview["unitsMeta"];
  counts: TeamReportOverview["unitStatusCounts"];
  inScope: number;
  search: string;
  onSearchChange: (value: string) => void;
  status: OverviewUnitFilter | "";
  onStatusChange: (value: OverviewUnitFilter | "") => void;
  onPageChange: (page: number) => void;
  onLimitChange: (limit: number) => void;
  busy: boolean;
}) {
  const filtering = Boolean(search.trim() || status);

  return (
    <Card>
      <CardHeader className="space-y-3 pb-3">
        <div>
          <CardTitle className="text-base">Theo từng đơn vị</CardTitle>
          <p className="text-xs text-muted-foreground">
            Đơn vị phải trình = đơn vị có tài khoản lập báo cáo tổng hợp (đội /
            tổ, trưởng / phó phòng, xã). Đơn vị khác chỉ hiện khi có số liệu.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Tìm tên đơn vị..."
              className="h-8 w-64 bg-background pl-8"
            />
          </div>
          {FILTERS.map((f) => {
            const n = f.value ? counts[f.value] : inScope;
            const active = status === f.value;
            return (
              <Button
                key={f.value || "all"}
                type="button"
                size="sm"
                variant={active ? "secondary" : "outline"}
                className={cn("h-8", !active && "bg-background")}
                aria-pressed={active}
                onClick={() => onStatusChange(f.value)}
              >
                {f.label}
                <span className="tabular-nums text-muted-foreground">
                  {nf.format(n)}
                </span>
              </Button>
            );
          })}
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {units.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {filtering
              ? "Không có đơn vị nào khớp bộ lọc."
              : "Không có đơn vị nào trong phạm vi này."}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Đơn vị</TableHead>
                <TableHead className="text-right">Nhiệm vụ</TableHead>
                <TableHead className="text-right">Báo cáo đã trình</TableHead>
                <TableHead>Báo cáo tháng</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {units.map((u) => (
                <TableRow key={u.departmentId}>
                  <TableCell className="align-middle font-medium">
                    {u.name}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {nf.format(u.tasks)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {nf.format(u.summaries)}
                  </TableCell>
                  <TableCell>
                    {!u.mustSubmit ? (
                      <span className="text-xs text-muted-foreground">
                        Không phải trình
                      </span>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {u.months.map((m) => (
                          <Badge
                            key={m.toDate}
                            variant="secondary"
                            className={cn(
                              "whitespace-nowrap font-normal",
                              STATUS_CLASS[m.status],
                            )}
                            title={`Kỳ ${formatYmd(m.fromDate)} - ${formatYmd(m.toDate)}, hạn ${formatYmd(m.deadline)}`}
                          >
                            {STATUS_LABEL[m.status]}
                            {m.submittedDate
                              ? ` · ${formatYmd(m.submittedDate).slice(0, 5)}`
                              : ""}
                          </Badge>
                        ))}
                        {u.months.length === 0 ? (
                          <span className="text-xs text-muted-foreground">
                            -
                          </span>
                        ) : null}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {meta.total ? (
          <div className="mt-3">
            <TablePagination
              page={meta.page}
              limit={meta.limit}
              total={meta.total}
              totalPages={meta.totalPages}
              onPageChange={onPageChange}
              onLimitChange={onLimitChange}
              disabled={busy}
            />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** Quản trị đặt N: hạn trình báo cáo tháng = ngày 14 + N ngày. */
function GraceDaysSetting({ onSaved }: { onSaved: () => void }) {
  const { data, mutate } = useSWR(
    ["team-report", "overview", "settings"],
    fetchOverviewSettings,
    { revalidateOnFocus: false },
  );
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const value = draft ?? String(data?.monthSubmitGraceDays ?? "");
  const n = Number(value);
  const valid = value !== "" && Number.isInteger(n) && n >= 0 && n <= 60;
  const dirty = data !== undefined && valid && n !== data.monthSubmitGraceDays;

  const save = async () => {
    setSaving(true);
    try {
      await saveOverviewSettings(n);
      await mutate();
      setDraft(null);
      onSaved();
      toast.success("Đã lưu hạn trình báo cáo tháng.");
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Không lưu được."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-3 py-4 text-sm">
        <span className="font-medium">Hạn trình báo cáo tháng:</span>
        <span>ngày 14 +</span>
        <Input
          type="number"
          min={0}
          max={60}
          className="w-20 bg-background"
          value={value}
          onChange={(e) => setDraft(e.target.value)}
        />
        <span>ngày</span>
        <Button
          type="button"
          size="sm"
          disabled={!dirty || saving}
          onClick={() => void save()}
        >
          Lưu
        </Button>
        <span className="text-xs text-muted-foreground">
          Áp cho mọi đơn vị.
          {data?.updatedByName ? ` Lần cuối do ${data.updatedByName} đặt.` : ""}
        </span>
      </CardContent>
    </Card>
  );
}
