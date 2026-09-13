"use client";

import { useAuth } from "@/features/auth/auth-provider";
import { userHasAnyPermission } from "@/features/auth/types";
import { PERM } from "@/constants/permissions";
import { StatisticsView } from "@/features/statistics/components/statistics-view";
import { TeamReportDashboardView } from "@/features/team-report/components/team-report-dashboard-view";

/**
 * Trang đầu sau đăng nhập phải bày số của CHÍNH tài khoản đó.
 *
 * Tài khoản dùng bản báo cáo ngày cấp đội (đội, phòng, xã, tỉnh) xem thống kê
 * của bản đó; tài khoản chỉ có nghiệp vụ cũ (nhiệm vụ cá nhân) vẫn thấy màn
 * thống kê cũ. Một trang mà gọi API của bản kia là đội trưởng mở lên gặp
 * "không có quyền" ngay ở màn đầu.
 */
export function DashboardSwitch() {
  const { user } = useAuth();
  const teamReport = userHasAnyPermission(user, [
    PERM.TEAM_REPORT_ENTRY,
    PERM.TEAM_REPORT_REVIEW,
  ]);
  return teamReport ? <TeamReportDashboardView /> : <StatisticsView />;
}
