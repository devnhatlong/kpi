import type { ApiResponse } from "@/features/auth/types";
import { api, unwrapData } from "@/lib/api-client";
import type { TeamReportPeriod } from "@/features/team-report/types";

/** Tình trạng trình báo cáo tháng của một đơn vị cho một kỳ. */
export type OverviewMonthStatus = "ON_TIME" | "LATE" | "MISSING" | "NOT_DUE";

/** Lọc bảng đơn vị: tình trạng báo cáo tháng, hoặc đơn vị không phải trình. */
export type OverviewUnitFilter = OverviewMonthStatus | "NOT_REQUIRED";

export type OverviewUnitMonth = {
  fromDate: string;
  toDate: string;
  deadline: string;
  status: OverviewMonthStatus;
  submittedDate: string | null;
};

export type OverviewUnit = {
  departmentId: string;
  name: string;
  depth: number;
  /** Có tài khoản lập báo cáo - nằm trong mẫu số tỷ lệ đúng hạn. */
  mustSubmit: boolean;
  tasks: number;
  summaries: number;
  months: OverviewUnitMonth[];
};

export type TeamReportOverview = {
  isAdmin: boolean;
  scopeName: string;
  departmentId: string | null;
  fromDate: string;
  toDate: string;
  today: string;
  periods: TeamReportPeriod[];
  tasks: { total: number };
  summaries: {
    total: number;
    byPeriod: Partial<Record<TeamReportPeriod, number>>;
    byStatus: { PENDING: number; APPROVED: number; RETURNED: number };
  };
  onTime: {
    graceDays: number;
    periods: Array<{ fromDate: string; toDate: string; deadline: string }>;
    expectedUnits: number;
    ON_TIME: number;
    LATE: number;
    MISSING: number;
    NOT_DUE: number;
    /** Số lượt (đơn vị × kỳ) đã tới hạn - mẫu số của tỷ lệ. */
    due: number;
    /** Phần trăm, 1 chữ số thập phân; null = chưa kỳ nào tới hạn. */
    rate: number | null;
  };
  /** Một trang của bảng từng đơn vị - đã áp tìm kiếm / lọc tình trạng. */
  units: OverviewUnit[];
  unitsMeta: { total: number; page: number; limit: number; totalPages: number };
  /** Số đơn vị theo tình trạng, đếm trước khi lọc - bày trên nút lọc. */
  unitStatusCounts: Record<OverviewUnitFilter, number>;
  unitsInScope: number;
  departmentOptions: Array<{ id: string; name: string; depth: number }>;
};

export type OverviewSettings = {
  monthSubmitGraceDays: number;
  updatedByName: string;
  updatedAt: string | null;
};

export function fetchTeamReportOverview(params: {
  fromDate: string;
  toDate: string;
  departmentId?: string;
  periods: TeamReportPeriod[];
  page: number;
  limit: number;
  q?: string;
  status?: OverviewUnitFilter;
}) {
  return unwrapData(
    api.get<ApiResponse<TeamReportOverview>>("/team-report/overview", {
      params: {
        fromDate: params.fromDate,
        toDate: params.toDate,
        periods: params.periods.join(","),
        page: params.page,
        limit: params.limit,
        ...(params.departmentId ? { departmentId: params.departmentId } : {}),
        ...(params.q ? { q: params.q } : {}),
        ...(params.status ? { status: params.status } : {}),
      },
    }),
  );
}

export function fetchOverviewSettings() {
  return unwrapData(
    api.get<ApiResponse<OverviewSettings>>("/team-report/overview/settings"),
  );
}

export function saveOverviewSettings(monthSubmitGraceDays: number) {
  return unwrapData(
    api.put<ApiResponse<OverviewSettings>>("/team-report/overview/settings", {
      monthSubmitGraceDays,
    }),
  );
}
