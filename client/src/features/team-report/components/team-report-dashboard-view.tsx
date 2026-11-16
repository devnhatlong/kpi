"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  CircleDashed,
  FileStack,
  Inbox,
  ListChecks,
  Search,
  Undo2,
} from "lucide-react";
import useSWR from "swr";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { TablePagination } from "@/components/common/table-pagination";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AxisScoreMeters } from "@/features/statistics/components/axis-score-meters";
import { StatTile } from "@/features/statistics/components/stat-tile";
import { fetchTeamReportDashboard } from "@/features/team-report/api";
import { DAY_STATUS_CLASS } from "@/features/team-report/status-styles";
import {
  TEAM_REPORT_PERIOD_LABEL,
  TEAM_REPORT_STATUS_LABEL,
} from "@/features/team-report/types";
import { getApiErrorMessage } from "@/lib/api-client";
import {
  formatServerHm,
  formatYmd,
} from "@/lib/server-time";
import { cn } from "@/lib/utils";

const chartConfig = {
  created: { label: "Nhiệm vụ mới", color: "var(--chart-1)" },
  closed: { label: "Đã đóng", color: "var(--chart-2)" },
} satisfies ChartConfig;

/** Bỏ dấu, chữ thường - gõ "canh sat" vẫn ra "Cảnh sát khu vực". */
function foldVi(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Trang Thống kê cho tài khoản dùng bản báo cáo ngày cấp đội.
 *
 * Số liệu lấy đúng của TÀI KHOẢN đang đăng nhập: đội thấy đơn vị mình; phòng /
 * xã / tỉnh thấy gộp cả cấp dưới kèm bảng từng đơn vị. Không có ô nào từ bản
 * nghiệp vụ cũ, nên đội trưởng không còn gặp "không có quyền".
 */
export function TeamReportDashboardView({
  fromDate,
  toDate,
}: {
  fromDate: string;
  toDate: string;
}) {
  // Bảng đơn vị phân trang phía máy - server trả đủ, chỉ cắt lúc bày.
  // Trang gắn với kỳ: đổi kỳ thì tự về trang 1.
  const rangeKey = `${fromDate}|${toDate}`;
  const [pageState, setPageState] = useState({ key: rangeKey, page: 1 });
  const page = pageState.key === rangeKey ? pageState.page : 1;
  const setPage = (next: number) => setPageState({ key: rangeKey, page: next });
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(10);

  const { data, error, isLoading } = useSWR(
    fromDate && toDate ? ["team-report", "dashboard", fromDate, toDate] : null,
    () => fetchTeamReportDashboard({ fromDate, toDate }),
    { revalidateOnFocus: false, keepPreviousData: true },
  );

  /* Đổi sang hình dạng của thẻ đo điểm cũ để dùng lại nguyên thẻ. */
  const axes = useMemo(
    () =>
      (data?.axisScores ?? []).map((axis) => ({
        axisId: axis.axisId,
        axisCode: "",
        axisName: axis.axisName,
        axisMaxScore: axis.maxScore,
        axisScore: axis.axisScore,
        convertedScore: axis.convertedScore,
        hasFormula: axis.formula !== null,
        taskCount: axis.taskCount,
      })),
    [data],
  );
  const daily = useMemo(
    () =>
      (data?.daily ?? []).map((point) => ({
        ...point,
        label: point.date.slice(8, 10) + "/" + point.date.slice(5, 7),
      })),
    [data],
  );
  const tickGap = Math.max(1, Math.ceil(daily.length / 12));
  const hasDaily = daily.some((row) => row.created || row.closed);
  const unit = data?.level === "UNIT";
  // Vài chục đơn vị con - lọc ngay trên máy, không cần hỏi lại server.
  const needle = foldVi(search);
  const unitRows = (data?.units ?? []).filter(
    (row) => !needle || foldVi(row.name).includes(needle),
  );
  const totalPages = Math.max(1, Math.ceil(unitRows.length / limit));
  const safePage = Math.min(page, totalPages);
  const pagedUnits = unitRows.slice(
    (safePage - 1) * limit,
    safePage * limit,
  );

  return (
    <div className="space-y-4">
      {data?.departmentName ? (
        <p className="text-sm text-muted-foreground">
          {data.departmentName}
          {unit ? " · gộp cả đơn vị cấp dưới" : ""}
        </p>
      ) : null}

      {error ? (
        <Card>
          <CardContent className="py-6 text-center text-sm text-destructive">
            {getApiErrorMessage(error, "Không tải được số liệu.")}
          </CardContent>
        </Card>
      ) : isLoading && !data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile
              label="Nhiệm vụ đang mở"
              value={data.tiles.openTasks}
              hint={
                data.tiles.unclassified
                  ? `${data.tiles.unclassified} chưa phân loại`
                  : "Đã phân loại hết"
              }
              icon={ListChecks}
              tone={data.tiles.unclassified ? "warning" : "success"}
            />
            <StatTile
              label="Nhiệm vụ mới trong kỳ"
              value={data.tiles.createdInPeriod}
              icon={CircleDashed}
            />
            <StatTile
              label="Đã đóng trong kỳ"
              value={data.tiles.closedInPeriod}
              icon={CheckCircle2}
              tone="success"
            />
            <StatTile
              label={unit ? "Báo cáo chờ duyệt" : "Báo cáo tổng hợp"}
              value={
                unit
                  ? data.tiles.summaries.PENDING
                  : data.tiles.summaries.PENDING +
                    data.tiles.summaries.APPROVED +
                    data.tiles.summaries.RETURNED
              }
              hint={`${data.tiles.summaries.APPROVED} đã duyệt · ${data.tiles.summaries.RETURNED} trả lại · ${data.tiles.summaries.DRAFT} nháp`}
              icon={unit ? Inbox : FileStack}
              tone={data.tiles.summaries.RETURNED ? "warning" : "neutral"}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Nhiệm vụ theo ngày</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Số việc khai mới và số việc đánh dấu xong mỗi ngày.
                </p>
              </CardHeader>
              <CardContent>
                {!hasDaily ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    Chưa có nhiệm vụ nào trong khoảng này.
                  </p>
                ) : (
                  <ChartContainer
                    config={chartConfig}
                    className="aspect-auto h-[260px] w-full"
                  >
                    <AreaChart
                      data={daily}
                      margin={{ left: 4, right: 12, top: 8 }}
                    >
                      <defs>
                        {(["created", "closed"] as const).map((key) => (
                          <linearGradient
                            key={key}
                            id={`fill-${key}`}
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="0%"
                              stopColor={`var(--color-${key})`}
                              stopOpacity={0.28}
                            />
                            <stop
                              offset="100%"
                              stopColor={`var(--color-${key})`}
                              stopOpacity={0.02}
                            />
                          </linearGradient>
                        ))}
                      </defs>
                      <CartesianGrid vertical={false} strokeOpacity={0.5} />
                      <XAxis
                        dataKey="label"
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                        interval={tickGap - 1}
                        minTickGap={16}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        width={32}
                        allowDecimals={false}
                      />
                      <ChartTooltip
                        cursor={{ strokeOpacity: 0.4 }}
                        content={<ChartTooltipContent indicator="line" />}
                      />
                      <ChartLegend content={<ChartLegendContent />} />
                      <Area
                        dataKey="created"
                        type="monotone"
                        stroke="var(--color-created)"
                        strokeWidth={2}
                        fill="url(#fill-created)"
                      />
                      <Area
                        dataKey="closed"
                        type="monotone"
                        stroke="var(--color-closed)"
                        strokeWidth={2}
                        fill="url(#fill-closed)"
                      />
                    </AreaChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>

            <AxisScoreMeters axes={axes} />
          </div>

          {unit && data.units.length ? (
            <Card>
              <CardHeader className="flex flex-row flex-wrap items-end justify-between gap-3 pb-3">
                <div>
                  <CardTitle className="text-base">
                    Theo đơn vị cấp dưới
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Chỉ liệt kê đơn vị có việc hoặc có báo cáo trong khoảng
                    này.
                  </p>
                </div>
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(1);
                    }}
                    placeholder="Tìm tên đơn vị..."
                    aria-label="Tìm tên đơn vị"
                    className="h-8 w-64 bg-background pl-8"
                  />
                </div>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {unitRows.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    Không có đơn vị nào khớp &quot;{search.trim()}&quot;.
                  </p>
                ) : null}
                <Table className={cn(unitRows.length === 0 && "hidden")}>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Đơn vị</TableHead>
                      <TableHead className="text-right">Đang mở</TableHead>
                      <TableHead className="text-right">
                        Chưa phân loại
                      </TableHead>
                      <TableHead className="text-right">
                        Đóng trong kỳ
                      </TableHead>
                      <TableHead className="text-right">Chờ duyệt</TableHead>
                      <TableHead className="text-right">Đã duyệt</TableHead>
                      <TableHead className="text-right">Trả lại</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagedUnits.map((row) => (
                      <TableRow key={row.departmentId}>
                        <TableCell className="font-medium">
                          {row.name}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.openTasks}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right tabular-nums",
                            row.unclassified &&
                              "text-amber-700 dark:text-amber-400",
                          )}
                        >
                          {row.unclassified}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.closedInPeriod}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.summaries.PENDING}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.summaries.APPROVED}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right tabular-nums",
                            row.summaries.RETURNED && "text-destructive",
                          )}
                        >
                          {row.summaries.RETURNED}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="mt-3">
                  <TablePagination
                    page={safePage}
                    limit={limit}
                    total={unitRows.length}
                    totalPages={totalPages}
                    onPageChange={setPage}
                    onLimitChange={(next) => {
                      setLimit(next);
                      setPage(1);
                    }}
                  />
                </div>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-3">
              <div>
                <CardTitle className="text-base">
                  Báo cáo tổng hợp gần đây
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Bản của {unit ? "các đơn vị trong phạm vi" : "đơn vị mình"} có
                  kỳ giao với khoảng đang xem.
                </p>
              </div>
              <Button
                asChild
                variant="outline"
                size="sm"
                className="bg-background"
              >
                <Link
                  href={
                    unit
                      ? "/team-report/summary/incoming"
                      : "/team-report/summary"
                  }
                >
                  <FileStack className="size-4" />
                  {unit ? "Mở hộp duyệt" : "Mở báo cáo tổng hợp"}
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              {data.recentSummaries.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Chưa có báo cáo tổng hợp nào trong khoảng này.
                </p>
              ) : (
                <ul className="divide-y">
                  {data.recentSummaries.map((item) => (
                    <li
                      key={item.id}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm"
                    >
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {item.title}
                      </span>
                      {unit ? (
                        <span className="text-xs text-muted-foreground">
                          {item.departmentName}
                        </span>
                      ) : null}
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {TEAM_REPORT_PERIOD_LABEL[item.period]} ·{" "}
                        {formatYmd(item.fromDate)} - {formatYmd(item.toDate)} ·{" "}
                        {item.rowCount} nhiệm vụ
                      </span>
                      <Badge
                        variant="secondary"
                        className={cn(
                          "whitespace-nowrap font-normal",
                          DAY_STATUS_CLASS[item.status],
                        )}
                      >
                        {item.status === "RETURNED" ? (
                          <Undo2 className="mr-1 size-3" />
                        ) : null}
                        {TEAM_REPORT_STATUS_LABEL[item.status]}
                      </Badge>
                      {item.sentAt ? (
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {formatServerHm(item.sentAt)}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
