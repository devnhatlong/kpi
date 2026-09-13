"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  CircleDashed,
  FileStack,
  Inbox,
  ListChecks,
  RefreshCw,
  Undo2,
} from "lucide-react";
import useSWR from "swr";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { useServerTime } from "@/hooks/use-server-time";
import { getApiErrorMessage } from "@/lib/api-client";
import { formatServerHm, formatYmd, serverYmd } from "@/lib/server-time";
import { cn } from "@/lib/utils";

const RANGES = [
  { value: "7", label: "7 ngày gần nhất" },
  { value: "30", label: "30 ngày gần nhất" },
  { value: "90", label: "90 ngày gần nhất" },
] as const;

const chartConfig = {
  created: { label: "Nhiệm vụ mới", color: "var(--chart-1)" },
  closed: { label: "Đã đóng", color: "var(--chart-2)" },
} satisfies ChartConfig;

function shiftYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + days)).toISOString().slice(0, 10);
}

/**
 * Trang Thống kê cho tài khoản dùng bản báo cáo ngày cấp đội.
 *
 * Số liệu lấy đúng của TÀI KHOẢN đang đăng nhập: đội thấy đơn vị mình; phòng /
 * xã / tỉnh thấy gộp cả cấp dưới kèm bảng từng đơn vị. Không có ô nào từ bản
 * nghiệp vụ cũ, nên đội trưởng không còn gặp "không có quyền".
 */
export function TeamReportDashboardView() {
  const { ready } = useServerTime();
  const [range, setRange] = useState<(typeof RANGES)[number]["value"]>("30");
  const toDate = ready ? serverYmd() : "";
  const fromDate = toDate ? shiftYmd(toDate, -(Number(range) - 1)) : "";

  const { data, error, isLoading, mutate, isValidating } = useSWR(
    toDate ? ["team-report", "dashboard", fromDate, toDate] : null,
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            Thống kê
          </h1>
          <p className="text-sm text-muted-foreground">
            {data?.departmentName ? `${data.departmentName} · ` : ""}
            {fromDate && toDate
              ? `${formatYmd(fromDate)} - ${formatYmd(toDate)}`
              : "Đang đồng bộ giờ server..."}
            {unit ? " · gộp cả đơn vị cấp dưới" : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={range}
            onValueChange={(v) => setRange(v as typeof range)}
          >
            <SelectTrigger className="w-44 bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANGES.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            className="bg-background"
            onClick={() => void mutate()}
          >
            <RefreshCw
              className={cn("size-4", isValidating && "animate-spin")}
            />
            Làm mới
          </Button>
        </div>
      </div>

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
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  Theo đơn vị cấp dưới
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Chỉ liệt kê đơn vị có việc hoặc có báo cáo trong khoảng này.
                </p>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
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
                    {data.units.map((row) => (
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
