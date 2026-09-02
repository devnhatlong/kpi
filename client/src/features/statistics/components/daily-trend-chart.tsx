"use client";

import { useMemo, useState } from "react";
import { Table as TableIcon, LineChart as LineChartIcon } from "lucide-react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { StatisticsDailyPoint } from "@/features/statistics/api";

const chartConfig = {
  sent: { label: "Nhiệm vụ gửi lên", color: "var(--chart-1)" },
  completed: { label: "Đã hoàn thành", color: "var(--chart-2)" },
} satisfies ChartConfig;

/** "2026-08-13" -> "13/08" - trục ngày chỉ cần ngày và tháng. */
function shortDate(ymd: string) {
  const [, month, day] = ymd.split("-");
  return `${day}/${month}`;
}

export function DailyTrendChart({ daily }: { daily: StatisticsDailyPoint[] }) {
  const [asTable, setAsTable] = useState(false);

  const rows = useMemo(
    () => daily.map((point) => ({ ...point, label: shortDate(point.date) })),
    [daily],
  );

  // Trục ngày dài thì nhãn chồng lên nhau; thưa bớt theo số điểm thực tế.
  const tickGap = Math.max(1, Math.ceil(rows.length / 12));
  const hasData = rows.some((row) => row.total > 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
        <div>
          <CardTitle className="text-base">Nhiệm vụ theo ngày</CardTitle>
          <p className="text-xs text-muted-foreground">
            Số nhiệm vụ đã gửi lên và số đã chốt xong, theo ngày báo cáo.
          </p>
        </div>
        {/* Bảng số là bản đọc được không phụ thuộc màu - luôn có, không phải
            tuỳ chọn ẩn trong menu. */}
        <Button
          size="sm"
          variant="outline"
          className="shrink-0 bg-background"
          onClick={() => setAsTable((prev) => !prev)}
        >
          {asTable ? (
            <>
              <LineChartIcon className="size-4" />
              Xem biểu đồ
            </>
          ) : (
            <>
              <TableIcon className="size-4" />
              Xem số
            </>
          )}
        </Button>
      </CardHeader>

      <CardContent>
        {!hasData ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            Chưa có nhiệm vụ nào trong khoảng này.
          </p>
        ) : asTable ? (
          <div className="max-h-[320px] overflow-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ngày</TableHead>
                  <TableHead className="text-right">Gửi lên</TableHead>
                  <TableHead className="text-right">Hoàn thành</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows
                  .filter((row) => row.total > 0)
                  .map((row) => (
                    <TableRow key={row.date}>
                      <TableCell className="tabular-nums">{row.date}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.sent}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.completed}
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <ChartContainer
            config={chartConfig}
            className="aspect-auto h-[280px] w-full"
          >
            <AreaChart data={rows} margin={{ left: 4, right: 12, top: 8 }}>
              <defs>
                <linearGradient id="fill-sent" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor="var(--color-sent)"
                    stopOpacity={0.28}
                  />
                  <stop
                    offset="100%"
                    stopColor="var(--color-sent)"
                    stopOpacity={0.02}
                  />
                </linearGradient>
                <linearGradient id="fill-completed" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor="var(--color-completed)"
                    stopOpacity={0.28}
                  />
                  <stop
                    offset="100%"
                    stopColor="var(--color-completed)"
                    stopOpacity={0.02}
                  />
                </linearGradient>
              </defs>
              {/* Lưới mảnh, liền nét, chỉ kẻ ngang - kẻ ô vuông là nhiễu. */}
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
                dataKey="sent"
                type="monotone"
                stroke="var(--color-sent)"
                strokeWidth={2}
                fill="url(#fill-sent)"
              />
              <Area
                dataKey="completed"
                type="monotone"
                stroke="var(--color-completed)"
                strokeWidth={2}
                fill="url(#fill-completed)"
              />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
