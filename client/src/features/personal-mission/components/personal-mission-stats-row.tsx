"use client";

import type { ReactNode } from "react";
import { CheckCircle2, ClipboardList, Clock3, Flame } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import type { PersonalMissionDashboardSummary } from "@/features/personal-mission/api";
import { missionTone } from "@/features/personal-mission/status-styles";
import { cn } from "@/lib/utils";

type PersonalMissionStatsRowProps = {
  summary?: PersonalMissionDashboardSummary | null;
  loading?: boolean;
  onOpenToday?: () => void;
};

function StatCard({
  title,
  children,
  onClick,
  className,
}: {
  title: string;
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  const interactive = Boolean(onClick);
  const Comp = interactive ? "button" : "div";

  return (
    <Card
      className={cn(
        "border-border/80 bg-card shadow-sm",
        interactive &&
          "cursor-pointer transition-colors hover:bg-accent/30 focus-within:ring-2 focus-within:ring-ring",
        className,
      )}
    >
      <CardContent className="p-0">
        <Comp
          type={interactive ? "button" : undefined}
          onClick={onClick}
          className={cn(
            "flex h-full w-full flex-col gap-3 p-4 text-left",
            interactive && "outline-none",
          )}
        >
          <p className="text-xs font-medium text-muted-foreground">{title}</p>
          <div className="min-h-10">{children}</div>
        </Comp>
      </CardContent>
    </Card>
  );
}

export function PersonalMissionStatsRow({
  summary,
  loading = false,
  onOpenToday,
}: PersonalMissionStatsRowProps) {
  const streakDays = summary?.streakDays ?? 0;
  const weekReportedDays = summary?.weekReportedDays ?? 0;
  const weekWindowDays = summary?.weekWindowDays ?? 7;
  const todayTaskCount = summary?.todayTaskCount ?? 0;
  const todayDraftCount = summary?.todayDraftCount ?? 0;
  const pendingSentCount = summary?.pendingSentCount ?? 0;
  const rejectedCount = summary?.rejectedCount ?? 0;

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard title="Chuỗi ngày báo cáo liên tiếp">
        <div className="flex items-center gap-2.5">
          <span
            className={cn(
              "flex size-9 items-center justify-center rounded-full",
              streakDays > 0
                ? missionTone.success.icon
                : missionTone.neutral.icon,
            )}
          >
            {streakDays > 0 ? (
              <Flame className="size-4" />
            ) : (
              <CheckCircle2 className="size-4" />
            )}
          </span>
          <p
            className={cn(
              "text-2xl font-semibold tracking-tight tabular-nums",
              streakDays > 0 ? missionTone.success.text : "text-foreground",
            )}
          >
            {loading ? "-" : `${streakDays} ngày`}
          </p>
        </div>
      </StatCard>

      <StatCard title="Đã gửi trong 7 ngày gần nhất">
        <p className="text-2xl font-semibold tracking-tight tabular-nums">
          {loading ? (
            "-"
          ) : (
            <>
              <span className={missionTone.info.text}>{weekReportedDays}</span>
              <span className="text-muted-foreground">
                {" "}
                / {weekWindowDays} ngày
              </span>
            </>
          )}
        </p>
      </StatCard>

      <StatCard title="Nhiệm vụ báo cáo hôm nay" onClick={onOpenToday}>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2.5">
            <span
              className={cn(
                "flex size-9 items-center justify-center rounded-full",
                missionTone.info.icon,
              )}
            >
              <ClipboardList className="size-4" />
            </span>
            <p className="text-2xl font-semibold tracking-tight tabular-nums text-foreground">
              {loading ? "-" : todayTaskCount}
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            Nháp chưa gửi:{" "}
            <span
              className={cn(
                "font-medium",
                todayDraftCount > 0 ? missionTone.warning.text : undefined,
              )}
            >
              {loading ? "-" : todayDraftCount}
            </span>
          </p>
        </div>
      </StatCard>

      <StatCard
        title="Chờ duyệt / bị trả lại"
        onClick={rejectedCount > 0 ? onOpenToday : undefined}
        className={
          rejectedCount > 0
            ? "border-rose-200/80 dark:border-rose-900/50"
            : undefined
        }
      >
        <div className="flex items-center gap-2.5">
          <span
            className={cn(
              "flex size-9 items-center justify-center rounded-full",
              rejectedCount > 0
                ? missionTone.danger.icon
                : missionTone.warning.icon,
            )}
          >
            <Clock3 className="size-4" />
          </span>
          <p className="text-2xl font-semibold tracking-tight tabular-nums">
            {loading ? (
              "-"
            ) : (
              <>
                <span className={missionTone.warning.text}>
                  {pendingSentCount}
                </span>
                <span className="text-muted-foreground"> / </span>
                <span
                  className={
                    rejectedCount > 0
                      ? missionTone.danger.text
                      : "text-muted-foreground"
                  }
                >
                  {rejectedCount}
                </span>
              </>
            )}
          </p>
        </div>
      </StatCard>
    </div>
  );
}
