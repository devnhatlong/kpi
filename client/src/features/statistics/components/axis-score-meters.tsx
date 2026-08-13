"use client";

import { TriangleAlert } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { StatisticsAxis } from "@/features/statistics/api";
import { cn } from "@/lib/utils";

function formatScore(value: number, maxDigits = 2) {
  return new Intl.NumberFormat("vi-VN", {
    maximumFractionDigits: maxDigits,
  }).format(value);
}

/**
 * Điểm từng trục so với trần của trục.
 *
 * Đây là "một tỉ lệ so với giới hạn" nên dùng thanh đo chứ không phải biểu đồ
 * cột: thanh đo cho thấy luôn phần còn thiếu, còn cột chỉ cho thấy độ dài.
 * Con số in thẳng trên thanh nên không cần rê chuột mới đọc được.
 */
export function AxisScoreMeters({ axes }: { axes: StatisticsAxis[] }) {
  const scored = axes.filter((axis) => axis.convertedScore !== null);
  const totalScore = scored.reduce(
    (sum, axis) => sum + (axis.convertedScore ?? 0),
    0,
  );
  const totalMax = scored.reduce((sum, axis) => sum + axis.axisMaxScore, 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Điểm quy đổi theo trục</CardTitle>
        <p className="text-xs text-muted-foreground">
          Tính trên toàn bộ nhiệm vụ trong khoảng đang xem, theo công thức đang
          cấu hình ở từng biểu mẫu.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {axes.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Chưa có nhiệm vụ nào trong khoảng này.
          </p>
        ) : (
          <>
            {totalMax > 0 ? (
              <div className="rounded-lg border bg-muted/40 p-4">
                <div className="text-xs font-medium text-muted-foreground">
                  Tổng điểm quy đổi
                </div>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-4xl font-semibold leading-none">
                    {formatScore(totalScore)}
                  </span>
                  <span className="text-lg text-muted-foreground">
                    / {formatScore(totalMax)}
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Cộng {scored.length} trục đã tính được điểm.
                </p>
              </div>
            ) : null}

            <ul className="space-y-4">
              {axes.map((axis) => {
                const score = axis.convertedScore;
                const ratio =
                  score !== null && axis.axisMaxScore > 0
                    ? score / axis.axisMaxScore
                    : 0;
                // Vượt trần vẫn phải nhìn thấy là vượt, nhưng thanh không tràn
                // ra ngoài khung - kẹp bề rộng rồi đổi màu để báo.
                const over = ratio > 1;
                const width = Math.max(0, Math.min(1, ratio)) * 100;

                return (
                  <li key={axis.axisId} className="space-y-1.5">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <span className="text-sm font-medium">
                        {axis.axisName || axis.axisCode}
                        <span className="ml-2 font-normal text-muted-foreground">
                          {axis.taskCount} nhiệm vụ
                        </span>
                      </span>
                      {score === null ? (
                        <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-500">
                          <TriangleAlert className="size-3.5" />
                          {axis.hasFormula
                            ? "Chưa đủ số liệu để tính"
                            : "Biểu mẫu chưa bật công thức"}
                        </span>
                      ) : (
                        <span className="text-sm tabular-nums">
                          <span
                            className={cn(
                              "font-semibold",
                              over && "text-amber-600 dark:text-amber-500",
                            )}
                          >
                            {formatScore(score)}
                          </span>
                          <span className="text-muted-foreground">
                            {" / "}
                            {formatScore(axis.axisMaxScore)}
                          </span>
                        </span>
                      )}
                    </div>

                    <div
                      className="h-2 w-full overflow-hidden rounded-full bg-muted"
                      role="img"
                      aria-label={
                        score === null
                          ? `${axis.axisName}: chưa tính được điểm`
                          : `${axis.axisName}: ${formatScore(score)} trên ${formatScore(axis.axisMaxScore)} điểm`
                      }
                    >
                      <div
                        className={cn(
                          "h-full rounded-full transition-[width]",
                          over ? "bg-amber-500" : "bg-[var(--chart-1)]",
                        )}
                        style={{ width: `${width}%` }}
                      />
                    </div>

                    {over ? (
                      <p className="text-xs text-amber-600 dark:text-amber-500">
                        Vượt trần của trục - kiểm tra lại điểm tự chấm hoặc cột
                        đã gán trong công thức.
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}
