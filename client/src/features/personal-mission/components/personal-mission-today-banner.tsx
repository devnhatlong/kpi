"use client";

import { CalendarDays, Eye, Plus } from "lucide-react";

import { useAuth } from "@/features/auth/auth-provider";
import {
  displayNameOf,
  initialsOf,
  primaryRoleLabel,
  type AuthUser,
} from "@/features/auth/types";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { PersonalMissionDailyReport } from "@/features/personal-mission/api";
import { missionTone } from "@/features/personal-mission/status-styles";
import { cn } from "@/lib/utils";

type TodayStatus = "none" | "rejected" | "draft" | "sent" | "completed";

function roleSubtitle(user: AuthUser) {
  // Người có chức vụ giữ nhiều vai trò - lấy vai trò cao nhất, không lấy vai
  // trò được gán trước. Nhãn của STAFF nay đã là "Cán bộ" nên không
  // còn phải vá riêng cho nó ở đây nữa.
  return `${primaryRoleLabel(user)} · Báo cáo nhiệm vụ hằng ngày`;
}

function formatTodayLabel(ymd: string) {
  const [y, m, d] = ymd.split("-");
  if (!y || !m || !d) return ymd;
  return `Hôm nay ${Number(d)}/${Number(m)}/${y}`;
}

function resolveTodayStatus(
  report: PersonalMissionDailyReport | null | undefined,
): TodayStatus {
  if (!report || report.taskCount === 0) return "none";
  if (report.returnedCount > 0) return "rejected";
  if (report.draftCount > 0) return "draft";
  if (report.pendingCount > 0) return "sent";
  if (report.approvedCount > 0) return "completed";
  return "none";
}

function statusMeta(status: TodayStatus) {
  switch (status) {
    case "rejected":
      return {
        label: "Có nhiệm vụ Trả lại",
        className: missionTone.danger.soft,
        action: "Xử lý trả lại" as const,
        actionIcon: "eye" as const,
      };
    case "draft":
      return {
        label: "Đang soạn nháp hôm nay",
        className: missionTone.info.soft,
        action: "Tiếp tục báo cáo" as const,
        actionIcon: "eye" as const,
      };
    case "sent":
      return {
        label: "Đã gửi báo cáo hôm nay",
        className: missionTone.warning.soft,
        action: "Xem báo cáo hôm nay" as const,
        actionIcon: "eye" as const,
      };
    case "completed":
      return {
        label: "Đã hoàn thành hôm nay",
        className: missionTone.success.soft,
        action: "Xem báo cáo hôm nay" as const,
        actionIcon: "eye" as const,
      };
    default:
      return {
        label: "Chưa lập báo cáo hôm nay",
        className: missionTone.warning.soft,
        action: "Lập báo cáo hôm nay" as const,
        actionIcon: "plus" as const,
      };
  }
}

type PersonalMissionTodayBannerProps = {
  todayYmd: string;
  todayReport?: PersonalMissionDailyReport | null;
  loading?: boolean;
  onCreateToday: () => void;
  onOpenToday: () => void;
};

export function PersonalMissionTodayBanner({
  todayYmd,
  todayReport,
  loading = false,
  onCreateToday,
  onOpenToday,
}: PersonalMissionTodayBannerProps) {
  const { user } = useAuth();
  const name = user ? displayNameOf(user) : "Người dùng";
  const initials = user ? initialsOf(user) : "?";
  const departmentName = user?.departmentName?.trim();
  const title = departmentName ? `${name} · ${departmentName}` : name;
  const subtitle = user ? roleSubtitle(user) : "Báo cáo nhiệm vụ hằng ngày";

  const status = resolveTodayStatus(todayReport);
  const meta = statusMeta(status);

  const handleAction = () => {
    if (status === "none") onCreateToday();
    else onOpenToday();
  };

  return (
    <div className="flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:p-5">
      <div className="flex min-w-0 items-start gap-3 sm:items-center">
        <Avatar className="size-12 shrink-0 ring-2 ring-primary/15">
          <AvatarFallback className="bg-primary/15 text-sm font-semibold text-primary">
            {initials}
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0 space-y-2">
          <div className="space-y-0.5">
            <p className="text-xs text-muted-foreground">{subtitle}</p>
            <h2 className="truncate font-display text-lg font-semibold tracking-tight sm:text-xl">
              {title}
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="secondary"
              className={cn(
                "gap-1.5 border-transparent font-normal",
                missionTone.info.soft,
              )}
            >
              <CalendarDays className="size-3.5" />
              {formatTodayLabel(todayYmd)}
            </Badge>
            <Badge
              variant="secondary"
              className={cn("border-transparent font-normal", meta.className)}
            >
              {loading ? "Đang tải..." : meta.label}
            </Badge>
          </div>
        </div>
      </div>

      <Button
        type="button"
        className="w-full shrink-0 sm:w-auto"
        disabled={loading}
        onClick={handleAction}
      >
        {meta.actionIcon === "plus" ? (
          <Plus className="size-4" />
        ) : (
          <Eye className="size-4" />
        )}
        {meta.action}
      </Button>
    </div>
  );
}
