"use client";

import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { useSWRConfig } from "swr";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PERM } from "@/constants/permissions";
import { useAuth } from "@/features/auth/auth-provider";
import { isSuperAdmin, userHasAnyPermission } from "@/features/auth/types";
import { StatisticsView } from "@/features/statistics/components/statistics-view";
import {
  PeriodPicker,
  usePeriodRange,
} from "@/features/team-report/components/period-picker";
import { ReportOverviewView } from "@/features/team-report/components/report-overview-view";
import { TeamReportDashboardView } from "@/features/team-report/components/team-report-dashboard-view";
import { formatYmd } from "@/lib/server-time";
import { cn } from "@/lib/utils";

/**
 * Trang đầu sau đăng nhập phải bày số của CHÍNH tài khoản đó.
 *
 * Tài khoản dùng bản báo cáo ngày cấp đội (đội, phòng, xã, tỉnh) và quản trị
 * xem trang Thống kê của bản đó; tài khoản chỉ có nghiệp vụ cũ (nhiệm vụ cá
 * nhân) vẫn thấy màn thống kê cũ. Một trang mà gọi API của bản kia là đội
 * trưởng mở lên gặp "không có quyền" ngay ở màn đầu.
 */
export function DashboardSwitch() {
  const { user } = useAuth();
  const admin = isSuperAdmin(user);
  const teamReport = userHasAnyPermission(user, [
    PERM.TEAM_REPORT_ENTRY,
    PERM.TEAM_REPORT_REVIEW,
  ]);
  if (!admin && !teamReport) return <StatisticsView />;
  return <TeamReportStatistics admin={admin} />;
}

type Tab = "overview" | "reports";

/**
 * Một trang Thống kê cho bản báo cáo ngày cấp đội: một bộ chọn kỳ ở đầu trang
 * điều khiển mọi tab.
 *
 * - "Tổng quan": nhiệm vụ đang mở, xu hướng theo ngày, điểm theo trục, đơn vị
 *   cấp dưới. Cần đơn vị gắn với tài khoản nên quản trị không có tab này.
 * - "Tiến độ báo cáo": số nhiệm vụ, báo cáo đã trình, tỷ lệ trình báo cáo
 *   tháng đúng hạn - quản trị xem toàn bộ, đơn vị xem mình + cấp dưới.
 */
function TeamReportStatistics({ admin }: { admin: boolean }) {
  const period = usePeriodRange();
  const [tab, setTab] = useState<Tab>("overview");
  const { mutate } = useSWRConfig();
  const [refreshing, setRefreshing] = useState(false);

  // Làm mới cả trang: mọi khoá SWR của hai tab đều bắt đầu bằng "team-report".
  const refresh = async () => {
    setRefreshing(true);
    try {
      await mutate(
        (key) =>
          Array.isArray(key) &&
          key[0] === "team-report" &&
          (key[1] === "dashboard" || key[1] === "overview"),
      );
    } finally {
      setRefreshing(false);
    }
  };

  const { fromDate, toDate, valid } = period;
  const rangeLabel =
    fromDate && toDate
      ? `${formatYmd(fromDate)} - ${formatYmd(toDate)}`
      : "Đang đồng bộ giờ server...";

  const body = !valid ? (
    <Card>
      <CardContent
        className={cn(
          "py-6 text-center text-sm",
          period.customError ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {period.customError ||
          (period.isCustom
            ? "Chọn từ ngày và đến ngày để xem số liệu."
            : "Đang đồng bộ giờ server...")}
      </CardContent>
    </Card>
  ) : admin ? (
    <ReportOverviewView fromDate={fromDate} toDate={toDate} />
  ) : (
    <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
      <TabsList>
        <TabsTrigger value="overview">Tổng quan</TabsTrigger>
        <TabsTrigger value="reports">Tiến độ báo cáo</TabsTrigger>
      </TabsList>
      <TabsContent value="overview" className="mt-4">
        <TeamReportDashboardView fromDate={fromDate} toDate={toDate} />
      </TabsContent>
      <TabsContent value="reports" className="mt-4">
        <ReportOverviewView fromDate={fromDate} toDate={toDate} />
      </TabsContent>
    </Tabs>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            Thống kê
          </h1>
          <p className="text-sm text-muted-foreground">{rangeLabel}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PeriodPicker period={period} />
          <Button
            type="button"
            variant="outline"
            className="bg-background"
            onClick={() => void refresh()}
            disabled={!valid || refreshing}
          >
            <RefreshCw className={cn("size-4", refreshing && "animate-spin")} />
            Làm mới
          </Button>
        </div>
      </div>
      {body}
    </div>
  );
}
