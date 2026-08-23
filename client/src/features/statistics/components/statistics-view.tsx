"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CheckCheck,
  ClipboardList,
  Clock,
  TriangleAlert,
  Undo2,
  Users,
} from "lucide-react";
import useSWR from "swr";

import { Button } from "@/components/ui/button";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  fetchStatistics,
  statisticsKeys,
  type StatisticsScope,
} from "@/features/statistics/api";
import { AxisScoreMeters } from "@/features/statistics/components/axis-score-meters";
import { DailyTrendChart } from "@/features/statistics/components/daily-trend-chart";
import { DepartmentPerformance } from "@/features/statistics/components/department-performance";
import { KpiLeaderboard } from "@/features/statistics/components/kpi-leaderboard";
import { StatTile } from "@/features/statistics/components/stat-tile";
import { getApiErrorMessage } from "@/lib/api-client";
import { cn } from "@/lib/utils";

const RANGE_OPTIONS = [
  { value: "7", label: "7 ngày gần nhất" },
  { value: "30", label: "30 ngày gần nhất" },
  { value: "90", label: "90 ngày gần nhất (1 quý)" },
  { value: "365", label: "365 ngày gần nhất" },
] as const;

/** Lùi n ngày từ hôm nay theo giờ máy người dùng, trả về YYYY-MM-DD. */
function shiftToday(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

export function StatisticsView() {
  const [rangeDays, setRangeDays] = useState<string>("30");
  const [scope, setScope] = useState<StatisticsScope>("mine");

  const params = {
    fromDate: shiftToday(Number(rangeDays) - 1),
    scope,
  };
  const { data, error, isLoading } = useSWR(
    statisticsKeys.view(params),
    () => fetchStatistics(params),
    // Giữ số cũ mờ đi khi đổi bộ lọc, không nháy khung xám rồi nhảy bố cục.
    { keepPreviousData: true },
  );

  const totals = data?.totals;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            Thống kê
          </h1>
          <p className="text-sm text-muted-foreground">
            {data
              ? `${data.scopeLabel} · ${data.range.fromDate} → ${data.range.toDate}`
              : "Số liệu tổng hợp từ nhiệm vụ KPI đã ghi nhận."}
          </p>
        </div>

        {/* Một hàng lọc duy nhất, đặt trên mọi thẻ - không nhét bộ lọc riêng
            vào từng biểu đồ, để các thẻ luôn nói về cùng một lát dữ liệu. */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Nút hành động dẫn sang màn nhập, không dựng lối nhập thứ hai ở
              đây - trang này chỉ để đọc số. */}
          <Button asChild variant="outline" className="bg-background">
            <Link href="/kpi/personal">Nhập KPI cá nhân</Link>
          </Button>
          {data?.canViewUnit ? (
            <Select
              value={scope}
              onValueChange={(value) => setScope(value as StatisticsScope)}
            >
              <SelectTrigger className="w-[210px] bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mine">Nhiệm vụ cá nhân</SelectItem>
                <SelectItem value="unit">Toàn đơn vị</SelectItem>
              </SelectContent>
            </Select>
          ) : null}
          <Select value={rangeDays} onValueChange={setRangeDays}>
            <SelectTrigger className="w-[180px] bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANGE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {error ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-destructive">
            {getApiErrorMessage(error, "Không tải được số liệu thống kê.")}
          </CardContent>
        </Card>
      ) : null}

      {isLoading && !data ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-[92px]" />
            ))}
          </div>
          <Skeleton className="h-[360px]" />
        </div>
      ) : null}

      {data && totals ? (
        <div
          className={cn(
            "space-y-4",
            // Đang tải lát mới thì làm mờ chứ không tháo ra dựng lại.
            isLoading && "opacity-60 transition-opacity",
          )}
        >
          {data.truncated ? (
            <Card className="border-amber-500/40 bg-amber-500/5">
              <CardContent className="flex items-start gap-2 py-3 text-sm">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-500" />
                <span>
                  Khoảng đang xem có quá nhiều nhiệm vụ, điểm và bảng xếp hạng
                  chỉ tính trên phần đã nạp. Thu hẹp khoảng ngày để có số đầy
                  đủ.
                </span>
              </CardContent>
            </Card>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <StatTile
              label="Cán bộ có báo cáo"
              value={totals.staffCount}
              icon={Users}
              tone="info"
              current={totals.staffCount}
              previous={data.previousTotals.staffCount}
            />
            <StatTile
              label="Tổng nhiệm vụ"
              value={totals.tasks}
              icon={ClipboardList}
              current={totals.tasks}
              previous={data.previousTotals.tasks}
            />
            <StatTile
              label="Hoàn thành"
              value={totals.completed}
              icon={CheckCheck}
              tone="success"
              current={totals.completed}
              previous={data.previousTotals.completed}
            />
            <StatTile
              label="Chờ duyệt"
              value={totals.pending}
              icon={Clock}
              tone="warning"
              current={totals.pending}
              previous={data.previousTotals.pending}
              higherIsBetter={false}
            />
            <StatTile
              label="Bị trả lại"
              value={totals.returned}
              icon={Undo2}
              tone="danger"
              current={totals.returned}
              previous={data.previousTotals.returned}
              higherIsBetter={false}
            />
          </div>

          {/* Bảng xếp hạng là thứ người dùng vào đây để xem, cho nó khoảng
              rộng nhất; thanh hiệu suất đơn vị đứng cạnh làm ngữ cảnh. */}
          <div className="grid gap-4 xl:grid-cols-3">
            <div className="xl:col-span-2">
              <KpiLeaderboard
                rows={data.leaderboard}
                showDepartment={data.scope === "unit"}
              />
            </div>
            {data.scope === "unit" ? (
              <DepartmentPerformance
                departments={data.departments}
                totalMaxScore={data.totalMaxScore}
              />
            ) : (
              <AxisScoreMeters axes={data.axes} />
            )}
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <DailyTrendChart daily={data.daily} />

            {data.scope === "unit" ? (
              <AxisScoreMeters axes={data.axes} />
            ) : (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">
                    Nội dung công việc nhiều nhiệm vụ nhất
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Tối đa 10 nội dung, xếp theo số nhiệm vụ.
                  </p>
                </CardHeader>
                <CardContent>
                  {data.workContents.length === 0 ? (
                    <p className="py-10 text-center text-sm text-muted-foreground">
                      Chưa có nhiệm vụ nào trong khoảng này.
                    </p>
                  ) : (
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-12">#</TableHead>
                            <TableHead>Nội dung công việc</TableHead>
                            <TableHead className="w-24 text-right">
                              Nhiệm vụ
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {data.workContents.map((content, index) => (
                            <TableRow key={content.workContentId}>
                              <TableCell className="text-muted-foreground tabular-nums">
                                {index + 1}
                              </TableCell>
                              <TableCell>
                                <div className="font-medium">
                                  {content.name}
                                </div>
                                {content.code ? (
                                  <div className="text-xs text-muted-foreground">
                                    {content.code}
                                  </div>
                                ) : null}
                              </TableCell>
                              <TableCell className="text-right font-medium tabular-nums">
                                {content.taskCount}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {data.scope === "unit" ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  Nội dung công việc nhiều nhiệm vụ nhất
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Tối đa 10 nội dung, xếp theo số nhiệm vụ.
                </p>
              </CardHeader>
              <CardContent>
                {data.workContents.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    Chưa có nhiệm vụ nào trong khoảng này.
                  </p>
                ) : (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12">#</TableHead>
                          <TableHead>Nội dung công việc</TableHead>
                          <TableHead className="w-24 text-right">
                            Nhiệm vụ
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.workContents.map((content, index) => (
                          <TableRow key={content.workContentId}>
                            <TableCell className="text-muted-foreground tabular-nums">
                              {index + 1}
                            </TableCell>
                            <TableCell>
                              <div className="font-medium">{content.name}</div>
                              {content.code ? (
                                <div className="text-xs text-muted-foreground">
                                  {content.code}
                                </div>
                              ) : null}
                            </TableCell>
                            <TableCell className="text-right font-medium tabular-nums">
                              {content.taskCount}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
