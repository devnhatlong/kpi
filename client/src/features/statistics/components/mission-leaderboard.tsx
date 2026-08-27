"use client";

import { useState } from "react";
import { Trophy } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { StatisticsLeaderboardRow } from "@/features/statistics/api";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 10;

function formatScore(value: number) {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(
    value,
  );
}

/** Hai chữ cái đầu của tên - đủ để phân biệt trong danh sách ngắn. */
function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  const last = parts[parts.length - 1] ?? "";
  return (last[0] ?? "?").toUpperCase();
}

type Tier = "low" | "mid" | "high" | "none";

/**
 * Bậc xếp loại lấy từ danh mục Nhóm điểm chứ không từ ngưỡng phần trăm tự đặt:
 * đơn vị sửa dải điểm thì màu đi theo, không lệch với nhãn hiển thị bên cạnh.
 *
 * Cũng KHÔNG tô theo thứ hạng trong bảng - có thêm người mới vào bảng làm ai đó
 * tụt hạng thì màu của họ không được đổi.
 */
function tierOf(index: number | null, count: number): Tier {
  if (index === null || count <= 0) return "none";
  if (count === 1) return "high";
  if (index === count - 1) return "high";
  if (index === 0) return "low";
  return "mid";
}

const barClass: Record<Tier, string> = {
  high: "bg-emerald-500",
  mid: "bg-[var(--chart-1)]",
  low: "bg-rose-500",
  none: "bg-muted-foreground/40",
};

const badgeClass: Record<Tier, string> = {
  high: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  mid: "bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300",
  low: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
  none: "bg-muted text-muted-foreground",
};

export function MissionLeaderboard({
  rows,
  showDepartment,
}: {
  rows: StatisticsLeaderboardRow[];
  showDepartment: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? rows : rows.slice(0, PAGE_SIZE);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Bảng xếp hạng nhiệm vụ</CardTitle>
        <p className="text-xs text-muted-foreground">
          Tổng điểm quy đổi của các trục trong khoảng đang xem. Xếp loại lấy
          theo danh mục Nhóm điểm đang cấu hình.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <Trophy className="size-7 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              Chưa có cán bộ nào có nhiệm vụ trong khoảng này.
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto rounded-md border">
              <Table className="min-w-[640px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Cán bộ</TableHead>
                    {showDepartment ? (
                      <TableHead className="w-[180px]">Đơn vị</TableHead>
                    ) : null}
                    <TableHead className="w-[220px]">Điểm nhiệm vụ</TableHead>
                    <TableHead className="w-[130px]">Xếp loại</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((person, index) => {
                    const ratio =
                      person.maxScore > 0 ? person.score / person.maxScore : 0;
                    const width = Math.max(0, Math.min(1, ratio)) * 100;
                    const tier = tierOf(
                      person.scoreGroupIndex,
                      person.scoreGroupCount,
                    );

                    return (
                      <TableRow key={person.ownerId}>
                        <TableCell className="text-muted-foreground tabular-nums">
                          {index + 1}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold">
                              {initials(person.fullName)}
                            </span>
                            <div className="min-w-0">
                              <div className="truncate font-medium">
                                {person.fullName}
                              </div>
                              <div className="truncate text-xs text-muted-foreground">
                                {person.position ||
                                  `${person.taskCount} nhiệm vụ`}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        {showDepartment ? (
                          <TableCell className="text-sm">
                            {person.departmentName || (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                        ) : null}
                        <TableCell>
                          <div className="space-y-1.5">
                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                              <div
                                className={cn(
                                  "h-full rounded-full",
                                  barClass[tier],
                                )}
                                style={{ width: `${width}%` }}
                              />
                            </div>
                            <div className="text-xs tabular-nums text-muted-foreground">
                              <span className="font-medium text-foreground">
                                {formatScore(person.score)}
                              </span>
                              /{formatScore(person.maxScore)}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {person.scoreGroupName ? (
                            <Badge
                              variant="secondary"
                              className={cn("font-medium", badgeClass[tier])}
                            >
                              {person.scoreGroupName}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              Ngoài mọi nhóm
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {rows.length > PAGE_SIZE ? (
              <div className="flex justify-center">
                <Button
                  size="sm"
                  variant="outline"
                  className="bg-background"
                  onClick={() => setExpanded((prev) => !prev)}
                >
                  {expanded ? "Thu gọn" : `Xem tất cả ${rows.length} cán bộ`}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
