"use client";

import { useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import {
  CircleAlert,
  FileSpreadsheet,
  FileText,
  Plus,
  Search,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { SegmentedTabs } from "@/components/common/segmented-tabs";
import {
  fetchTeamReportSummaries,
  fetchTeamReportSummary,
  teamReportKeys,
  type TeamReportSummaryLevel,
} from "@/features/team-report/api";
import { TeamReportSummaryPanel } from "@/features/team-report/components/team-report-summary-panel";
import { TeamReportSummaryWizard } from "@/features/team-report/components/team-report-summary-wizard";
import { DAY_STATUS_CLASS } from "@/features/team-report/status-styles";
import {
  TEAM_REPORT_PERIOD_LABEL,
  TEAM_REPORT_STATUS_LABEL,
  type TeamReportDayStatus,
  type TeamReportSummary,
} from "@/features/team-report/types";
import { getApiErrorMessage } from "@/lib/api-client";
import { formatYmd } from "@/lib/server-time";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 8;

type StatusFilter = TeamReportDayStatus | "ALL";

const STATUS_FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: "ALL", label: "Tất cả" },
  { value: "DRAFT", label: "Nháp" },
  { value: "PENDING", label: "Đã trình" },
  { value: "APPROVED", label: "Đã duyệt" },
  { value: "RETURNED", label: "Trả lại" },
];

const isStatusFilter = (value: string | null): value is StatusFilter =>
  STATUS_FILTERS.some((item) => item.value === value);

const statusLabel = (status: TeamReportDayStatus) =>
  status === "DRAFT" ? "Nháp" : TEAM_REPORT_STATUS_LABEL[status];

/**
 * Báo cáo tổng hợp theo kỳ của đội: danh sách bên trái, bản đang mở bên phải.
 *
 * Cùng bố cục với trang báo cáo tổng hợp của bản nghiệp vụ cũ - người dùng đã
 * quen tay ở đó, đổi kiểu bày chỉ vì đây là feature khác là bắt họ học lại một
 * thứ y hệt.
 *
 * Đứng RIÊNG với bảng ngày: bảng ngày là lượt bắt buộc hằng ngày, đi đúng một
 * đường lên đơn vị cha. Bản tổng hợp là người lập tự chọn kỳ, tự chọn việc, tự
 * chọn trình cho ai.
 */
export function TeamReportSummaryView({
  level = "TEAM",
}: {
  /**
   * `TEAM` = đội gom việc của mình. `UNIT` = phòng gom việc của các đội.
   *
   * Cùng một màn cho cả hai cấp: nghiệp vụ giống hệt nhau, chỉ khác đường gọi
   * và bộ lọc đội. Dựng hai màn song song là mọi lần sửa sau này phải nhớ sửa
   * cả hai chỗ - kiểu gì cũng có lần quên.
   */
  level?: TeamReportSummaryLevel;
}) {
  const unit = level === "UNIT";

  /*
    Trạng thái lọc, trang, từ khoá và bản đang mở nằm trên URL
    (?status=&page=&q=&id=): F5 không mất chỗ đang đứng, và gửi link một bản
    cho người bên cạnh là mở đúng bản đó.
  */
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlStatus = searchParams.get("status");
  const [status, setStatus] = useState<StatusFilter>(
    isStatusFilter(urlStatus) ? urlStatus : "ALL",
  );
  const [page, setPage] = useState(() =>
    Math.max(1, Number(searchParams.get("page")) || 1),
  );
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [search, setSearch] = useState((searchParams.get("q") ?? "").trim());
  const [pickedId, setPickedId] = useState<string | null>(
    searchParams.get("id"),
  );
  const [wizardOpen, setWizardOpen] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const syncUrl = (next: {
    status?: StatusFilter;
    page?: number;
    q?: string;
    id?: string | null;
  }) => {
    const params = new URLSearchParams();
    const s = next.status ?? status;
    const p = next.page ?? page;
    const q = next.q ?? search;
    const id = next.id === undefined ? pickedId : next.id;
    if (s !== "ALL") params.set("status", s);
    if (p > 1) params.set("page", String(p));
    if (q) params.set("q", q);
    if (id) params.set("id", id);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const changeStatus = (next: StatusFilter) => {
    setStatus(next);
    setPage(1);
    syncUrl({ status: next, page: 1 });
  };

  const changePage = (next: number) => {
    setPage(next);
    syncUrl({ page: next });
  };

  const pick = (id: string | null) => {
    setPickedId(id);
    syncUrl({ id });
  };

  /* Tìm ở SERVER (theo tên báo cáo), chờ ngừng gõ 300ms rồi mới gọi - mỗi phím
     một lượt mạng là thừa. Tìm trên trang đang xem thì bỏ sót bản ở trang sau. */
  const changeQuery = (next: string) => {
    setQuery(next);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      const trimmed = next.trim();
      setSearch(trimmed);
      setPage(1);
      syncUrl({ q: trimmed, page: 1 });
    }, 300);
  };

  const clearQuery = () => {
    if (debounce.current) clearTimeout(debounce.current);
    setQuery("");
    setSearch("");
    setPage(1);
    syncUrl({ q: "", page: 1 });
  };

  const list = useSWR(
    teamReportKeys.summaries(status, page, level, search),
    () =>
      fetchTeamReportSummaries({
        status: status === "ALL" ? "" : status,
        page,
        limit: PAGE_SIZE,
        q: search,
        level,
      }),
    { keepPreviousData: true },
  );

  const reports = list.data?.data ?? [];
  const meta = list.data?.meta;
  const statusCounts = list.data?.statusCounts ?? {};
  const totalAll = Object.values(statusCounts).reduce(
    (sum, count) => sum + (count ?? 0),
    0,
  );
  const returnedCount = statusCounts.RETURNED ?? 0;

  /*
    Chưa chọn gì thì mở bản đầu danh sách. Đã chọn (bấm hoặc mở từ link ?id=)
    thì GIỮ bản đó kể cả khi đổi bộ lọc hay sang trang khác: đang đọc dở một
    bản mà đổi lọc là bản đó biến khỏi khung phải thì rất khó chịu. Xoá bản
    đang mở thì `pick(null)` trả về bản đầu.
  */
  const activeId = pickedId ?? reports[0]?._id ?? null;

  const detail = useSWR(
    activeId ? teamReportKeys.summary(activeId, level) : null,
    () => fetchTeamReportSummary(activeId!, level),
  );

  /** Sửa gì cũng nạp lại cả hai cột - đếm và nhãn ở cột trái đọc cùng dữ liệu. */
  const refreshAll = async () => {
    await Promise.all([list.mutate(), detail.mutate()]);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FileText className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 space-y-1">
            <h1 className="text-balance font-display text-2xl font-semibold tracking-tight">
              {unit ? "Tạo báo cáo của đơn vị" : "Tạo báo cáo tổng hợp"}
            </h1>
            <p className="max-w-[70ch] text-sm text-muted-foreground">
              {unit
                ? "Gom nhiệm vụ của các đội trong đơn vị theo kỳ, rồi trình lên cấp trên."
                : "Gom nhiệm vụ đã sẵn sàng theo ngày, tuần hoặc tháng, rồi trình lên cấp trên."}
            </p>
          </div>
        </div>

        <Button
          type="button"
          className="active:scale-[0.98] motion-reduce:active:scale-100"
          onClick={() => setWizardOpen(true)}
        >
          <Plus className="size-4" aria-hidden="true" />
          Lập báo cáo
        </Button>
      </div>

      {/*
        Bản bị trả lại là việc đội ĐANG PHẢI làm - nói ngay trên đầu, không đợi
        người dùng tự lọc mới biết. Bấm vào là lọc luôn.
      */}
      {returnedCount > 0 && status !== "RETURNED" ? (
        <button
          type="button"
          onClick={() => changeStatus("RETURNED")}
          className="flex w-full cursor-pointer items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 text-left text-sm text-amber-900 transition-colors hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100 dark:hover:bg-amber-950/70"
        >
          <CircleAlert className="size-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <strong className="tabular-nums">{returnedCount}</strong> báo cáo
            bị cấp trên trả lại, cần sửa rồi trình lại.
          </span>
          <span className="shrink-0 text-xs font-medium underline-offset-4 hover:underline">
            Xem ngay
          </span>
        </button>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Card className="shadow-sm lg:sticky lg:top-4 lg:self-start">
          <CardContent className="space-y-3 py-4">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="font-display text-sm font-semibold">
                Báo cáo đã lập
              </h2>
              <span className="text-xs text-muted-foreground tabular-nums">
                {meta?.total ?? 0} báo cáo
              </span>
            </div>

            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                type="search"
                name="q"
                aria-label="Tìm báo cáo"
                autoComplete="off"
                spellCheck={false}
                value={query}
                onChange={(event) => changeQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape" && query) {
                    event.preventDefault();
                    clearQuery();
                  }
                }}
                placeholder="Tìm theo tên báo cáo…"
                className="pl-8 pr-8 [&::-webkit-search-cancel-button]:hidden"
              />
              {query ? (
                <button
                  type="button"
                  aria-label="Xoá tìm kiếm"
                  onClick={clearQuery}
                  className="absolute right-1 top-1/2 flex size-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              ) : null}
            </div>

            <SegmentedTabs
              ariaLabel="Lọc theo trạng thái"
              value={status}
              onChange={changeStatus}
              items={STATUS_FILTERS.map((item) => {
                const count =
                  item.value === "ALL"
                    ? totalAll
                    : (statusCounts[item.value] ?? 0);
                return {
                  value: item.value,
                  label: (
                    <span className="tabular-nums">
                      {item.label}{" "}
                      <span
                        className={cn(
                          "text-xs",
                          item.value === "RETURNED" && count > 0
                            ? "font-semibold text-amber-700 dark:text-amber-400"
                            : "text-muted-foreground",
                        )}
                      >
                        {count}
                      </span>
                    </span>
                  ),
                };
              })}
              className="flex-wrap"
            />

            <div
              className="max-h-[32rem] space-y-1.5 overflow-y-auto overscroll-contain"
              aria-busy={list.isLoading}
            >
              {list.isLoading && !reports.length
                ? Array.from({ length: 4 }, (_, index) => (
                    <div
                      key={index}
                      className="space-y-2 rounded-md border p-2.5"
                    >
                      <Skeleton className="h-4 w-4/5" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                  ))
                : null}

              {!list.isLoading && !reports.length ? (
                <div className="space-y-2 py-8 text-center text-sm text-muted-foreground">
                  <p>
                    {search
                      ? `Không có báo cáo nào có tên khớp “${search}”.`
                      : status !== "ALL"
                        ? "Không có báo cáo nào ở trạng thái này."
                        : "Chưa có báo cáo nào."}
                  </p>
                  {search ? (
                    <button
                      type="button"
                      onClick={clearQuery}
                      className="cursor-pointer font-medium text-primary underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none"
                    >
                      Xoá tìm kiếm
                    </button>
                  ) : null}
                </div>
              ) : null}

              {reports.map((report) => (
                <SummaryListRow
                  key={report._id}
                  report={report}
                  active={report._id === activeId}
                  onPick={() => pick(report._id)}
                />
              ))}
            </div>

            {(meta?.totalPages ?? 1) > 1 ? (
              <nav
                aria-label="Phân trang báo cáo"
                className="flex items-center justify-between gap-2 border-t pt-3"
              >
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={page <= 1}
                  onClick={() => changePage(page - 1)}
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
                  disabled={page >= (meta?.totalPages ?? 1)}
                  onClick={() => changePage(page + 1)}
                >
                  Sau
                </Button>
              </nav>
            ) : null}
          </CardContent>
        </Card>

        {list.error ? (
          <Card className="shadow-sm">
            <CardContent
              role="alert"
              className="space-y-3 p-6 text-sm text-destructive"
            >
              <p>
                {getApiErrorMessage(
                  list.error,
                  "Không tải được danh sách báo cáo.",
                )}
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void list.mutate()}
              >
                Thử lại
              </Button>
            </CardContent>
          </Card>
        ) : !activeId && !list.isLoading ? (
          <Card className="shadow-sm">
            <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
              <FileSpreadsheet
                className="size-10 text-muted-foreground"
                aria-hidden="true"
              />
              <p className="text-sm font-medium">Chưa có báo cáo nào để mở</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Lập một báo cáo tổng hợp để gom những nhiệm vụ đã sẵn sàng trong
                kỳ thành một bản trình lên cấp trên.
              </p>
              <Button
                type="button"
                className="mt-2"
                onClick={() => setWizardOpen(true)}
              >
                <Plus className="size-4" aria-hidden="true" />
                Lập báo cáo
              </Button>
            </CardContent>
          </Card>
        ) : detail.error ? (
          <Card className="shadow-sm">
            <CardContent
              role="alert"
              className="space-y-3 p-6 text-sm text-destructive"
            >
              <p>{getApiErrorMessage(detail.error, "Không tải được báo cáo.")}</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void detail.mutate()}
              >
                Thử lại
              </Button>
            </CardContent>
          </Card>
        ) : !detail.data ? (
          <Card className="shadow-sm" aria-busy="true">
            <CardContent className="space-y-4 py-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-6 w-2/3" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
                <Skeleton className="h-8 w-28" />
              </div>
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <span className="sr-only">Đang tải báo cáo…</span>
            </CardContent>
          </Card>
        ) : (
          <TeamReportSummaryPanel
            detail={detail.data}
            level={level}
            onChanged={refreshAll}
            onDeleted={async () => {
              pick(null);
              await refreshAll();
            }}
          />
        )}
      </div>

      <TeamReportSummaryWizard
        open={wizardOpen}
        level={level}
        onOpenChange={setWizardOpen}
        onDone={async (summaryId) => {
          if (summaryId) pick(summaryId);
          await refreshAll();
        }}
      />
    </div>
  );
}

/** Một dòng ở cột trái - đủ để nhận ra bản nào mà không phải mở ra xem. */
function SummaryListRow({
  report,
  active,
  onPick,
}: {
  report: TeamReportSummary;
  active: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      aria-current={active ? "true" : undefined}
      onClick={onPick}
      className={cn(
        /* Góc VUÔNG, bản đang mở có cạnh trái xanh dày 3px - vạch thẳng đứng
           trên góc vuông, không cong theo bo góc. Bản bị trả lại đã có nhãn
           trạng thái màu cam. */
        "w-full cursor-pointer rounded-none border p-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        active
          ? "border-l-[3px] border-l-primary bg-primary/5"
          : "hover:bg-muted/50",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="line-clamp-2 min-w-0 break-words text-sm font-medium">
          {report.title}
        </span>
        <Badge
          variant="secondary"
          className={cn(
            "shrink-0 whitespace-nowrap font-normal",
            DAY_STATUS_CLASS[report.status],
          )}
        >
          {statusLabel(report.status)}
        </Badge>
      </div>
      <div className="mt-1 text-xs text-muted-foreground tabular-nums">
        {formatYmd(report.fromDate)} - {formatYmd(report.toDate)}
      </div>
      <div className="mt-0.5 text-xs text-muted-foreground">
        {TEAM_REPORT_PERIOD_LABEL[report.period]}, {report.rows?.length ?? 0}{" "}
        nhiệm vụ
      </div>
      {report.recipientName ? (
        <div className="mt-0.5 truncate text-xs text-muted-foreground">
          Trình: {report.recipientName}
        </div>
      ) : null}
    </button>
  );
}
