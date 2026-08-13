"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { StatisticsDepartment } from "@/features/statistics/api";

function formatScore(value: number) {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(
    value,
  );
}

/**
 * Điểm trung bình mỗi đơn vị so với thang chung.
 *
 * Một chuỗi số liệu nên dùng một màu cho mọi thanh: tô mỗi đơn vị một màu là
 * gán ý nghĩa cho thứ mà màu không mang, và thêm một đơn vị vào là cả bảng đổi
 * màu theo.
 */
export function DepartmentPerformance({
  departments,
  totalMaxScore,
}: {
  departments: StatisticsDepartment[];
  totalMaxScore: number;
}) {
  const scored = departments.filter((dept) => dept.averageScore !== null);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Hiệu suất theo đơn vị</CardTitle>
        <p className="text-xs text-muted-foreground">
          Điểm trung bình mỗi cán bộ của đơn vị, trên thang{" "}
          {formatScore(totalMaxScore)} điểm.
        </p>
      </CardHeader>
      <CardContent>
        {scored.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Chưa đơn vị nào tính được điểm trong khoảng này.
          </p>
        ) : (
          <ul className="space-y-4">
            {scored.map((dept) => {
              const average = dept.averageScore ?? 0;
              const ratio = totalMaxScore > 0 ? average / totalMaxScore : 0;
              const width = Math.max(0, Math.min(1, ratio)) * 100;

              return (
                <li key={dept.departmentId ?? dept.name} className="space-y-1.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-sm font-medium">
                      {dept.name}
                    </span>
                    <span className="shrink-0 text-sm tabular-nums">
                      <span className="font-semibold">
                        {formatScore(average)}
                      </span>
                      <span className="text-muted-foreground">
                        {" / "}
                        {formatScore(totalMaxScore)}
                      </span>
                    </span>
                  </div>
                  <div
                    className="h-2 w-full overflow-hidden rounded-full bg-muted"
                    role="img"
                    aria-label={`${dept.name}: trung bình ${formatScore(average)} trên ${formatScore(totalMaxScore)} điểm`}
                  >
                    <div
                      className="h-full rounded-full bg-[var(--chart-1)]"
                      style={{ width: `${width}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {dept.staffCount} cán bộ · {dept.taskCount} nhiệm vụ ·{" "}
                    {dept.completedCount} đã chốt
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
