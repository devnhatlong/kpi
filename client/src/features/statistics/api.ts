import { api, unwrapData } from "@/lib/api-client";
import type { ApiResponse } from "@/features/auth/types";

/** Phạm vi số liệu; `unit` cần quyền duyệt, không có thì server lùi về `mine`. */
export type StatisticsScope = "mine" | "unit";

export type StatisticsQuery = {
  fromDate?: string;
  toDate?: string;
  scope?: StatisticsScope;
  axisId?: string;
};

export type StatisticsDailyPoint = {
  date: string;
  total: number;
  /** Đã rời khỏi nháp - tức thực sự gửi lên. */
  sent: number;
  completed: number;
};

export type StatisticsAxis = {
  axisId: string;
  axisCode: string;
  axisName: string;
  axisMaxScore: number;
  /** null = trục chưa cấu hình công thức, hoặc chưa có số liệu để chia. */
  axisScore: number | null;
  convertedScore: number | null;
  hasFormula: boolean;
  taskCount: number;
};

export type StatisticsDepartment = {
  departmentId: string | null;
  code: string;
  name: string;
  taskCount: number;
  completedCount: number;
  staffCount: number;
  /** Điểm trung bình mỗi cán bộ; null = chưa ai trong đơn vị tính được điểm. */
  averageScore: number | null;
};

export type StatisticsLeaderboardRow = {
  ownerId: string;
  fullName: string;
  position: string;
  departmentId: string | null;
  departmentName: string;
  taskCount: number;
  score: number;
  /** Tổng trần của mọi trục đang hoạt động - thang chấm chung cho cả bảng. */
  maxScore: number;
  /** Xếp loại lấy thẳng từ danh mục Nhóm điểm; null = điểm rơi ngoài mọi nhóm. */
  scoreGroupCode: string | null;
  scoreGroupName: string | null;
  /** Bậc của nhóm trong danh mục, 0 = thấp nhất. Dùng để tô màu theo bậc. */
  scoreGroupIndex: number | null;
  scoreGroupCount: number;
};

export type StatisticsWorkContent = {
  workContentId: string;
  code: string;
  name: string;
  taskCount: number;
};

export type Statistics = {
  range: { fromDate: string; toDate: string; today: string; days: number };
  /** Kỳ liền trước, cùng độ dài - nguồn cho các con số "so với kỳ trước". */
  previousRange: { fromDate: string; toDate: string };
  scope: StatisticsScope;
  scopeLabel: string;
  canViewUnit: boolean;
  /** true = chạm trần số dòng quét được, số liệu chưa tính hết. */
  truncated: boolean;
  totalMaxScore: number;
  totals: {
    tasks: number;
    draft: number;
    pending: number;
    approved: number;
    returned: number;
    completed: number;
    reportedDays: number;
    rangeDays: number;
    staffCount: number;
  };
  previousTotals: {
    tasks: number;
    pending: number;
    completed: number;
    returned: number;
    staffCount: number;
  };
  daily: StatisticsDailyPoint[];
  axes: StatisticsAxis[];
  leaderboard: StatisticsLeaderboardRow[];
  departments: StatisticsDepartment[];
  workContents: StatisticsWorkContent[];
};

export const statisticsKeys = {
  all: ["statistics"] as const,
  view: (params: StatisticsQuery) =>
    [
      "statistics",
      params.fromDate ?? "",
      params.toDate ?? "",
      params.scope ?? "mine",
      params.axisId ?? "",
    ] as const,
};

export async function fetchStatistics(params: StatisticsQuery = {}) {
  // Không dùng buildListQuery: endpoint này không phân trang, thêm page/limit
  // vào chỉ làm bẩn query và lệch khoá cache.
  const query: Record<string, string> = {};
  if (params.fromDate) query.fromDate = params.fromDate;
  if (params.toDate) query.toDate = params.toDate;
  if (params.scope) query.scope = params.scope;
  if (params.axisId) query.axisId = params.axisId;

  return unwrapData(
    api.get<ApiResponse<Statistics>>("/personal-mission/statistics", {
      params: query,
    }),
  );
}
