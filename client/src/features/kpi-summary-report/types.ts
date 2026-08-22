import type {
  PersonalKpiBoardAxis,
  PersonalKpiBoardRow,
} from "@/features/personal-kpi/api";

/**
 * Khối trục của báo cáo tổng hợp dùng chung kiểu với bảng tổng: server gom bằng
 * cùng một hàm nên hai màn hình luôn nhận đúng một hình dạng dữ liệu.
 */
export type SummaryAxisBlock = PersonalKpiBoardAxis;
export type SummaryRow = PersonalKpiBoardRow;

/**
 * - DRAFT : đang soạn, còn thêm bớt nhiệm vụ được
 * - SENT  : đã trình cấp trên, muốn sửa thì thu hồi
 */
export type SummaryReportStatus = "DRAFT" | "SENT";

export const SUMMARY_REPORT_STATUS_LABEL: Record<SummaryReportStatus, string> =
  {
    DRAFT: "Đang soạn",
    SENT: "Đã gửi",
  };

export function summaryReportStatusBadgeClass(
  status: SummaryReportStatus,
): string {
  return status === "SENT"
    ? "border-transparent bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300"
    : "border-transparent bg-violet-100 text-violet-700 hover:bg-violet-100 dark:bg-violet-950/60 dark:text-violet-300";
}

export function canEditSummaryReport(status: SummaryReportStatus) {
  return status === "DRAFT";
}

/** Nhiệm vụ gõ tay vào báo cáo - việc không đi qua KPI cá nhân. */
export type SummaryManualItem = {
  _id: string;
  title: string;
  note: string;
  axisId: string | null;
  axisName: string;
  ownerName: string;
  departmentName: string;
  score: number | null;
  createdAt: string;
};

export type SummaryReportLogType =
  | "CREATE"
  | "UPDATE"
  | "ADD_ITEMS"
  | "REMOVE_ITEMS"
  | "ADD_MANUAL"
  | "REMOVE_MANUAL"
  | "SEND"
  | "RECALL";

export type SummaryReportLog = {
  type: SummaryReportLogType;
  message: string;
  byName: string;
  at: string;
};

export type SummaryReport = {
  _id: string;
  title: string;
  fromDate: string;
  toDate: string;
  note: string;
  ownerId: string;
  ownerName: string;
  /** Đơn vị mà báo cáo này tổng hợp thay. */
  scopeDepartmentId: string | null;
  scopeName: string;
  status: SummaryReportStatus;
  /** Số nhiệm vụ lấy từ KPI - chưa tính nhiệm vụ tự nhập. */
  itemCount: number;
  manualItems: SummaryManualItem[];
  /** Danh sách báo cáo không kèm nhật ký cho nhẹ; chi tiết mới có. */
  logs: SummaryReportLog[];
  sentToId: string | null;
  sentToName: string;
  sentNote: string;
  sentAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SummaryReportDetail = {
  report: SummaryReport;
  axes: SummaryAxisBlock[];
  rowCount: number;
  /** Nhiệm vụ đã lưu trong báo cáo nhưng không còn trong hệ thống. */
  missingCount: number;
};

/** Đếm cho dòng "N báo cáo · M đã gửi" trên đầu trang. */
export type SummaryReportStats = {
  total: number;
  draft: number;
  sent: number;
};

export type SummaryCandidates = {
  axes: SummaryAxisBlock[];
  rowCount: number;
  /** Chạm trần số dòng - phải thu hẹp bộ lọc mới thấy hết. */
  truncated: boolean;
  scope: {
    departmentId: string | null;
    departmentCount: number;
  };
};

export type SummaryCandidatesQuery = {
  fromDate?: string;
  toDate?: string;
  axisId?: string;
  workContentId?: string;
  departmentId?: string;
  ownerId?: string;
  q?: string;
  excludeUsed?: boolean;
  reportId?: string;
};

export type SummaryReportListQuery = {
  page?: number;
  limit?: number;
  status?: SummaryReportStatus | "";
  q?: string;
};

/** Kỳ báo cáo hiển thị gọn: "01/08/2026 → 13/08/2026". */
export function periodLabel(fromDate: string, toDate: string): string {
  const format = (ymd: string) => {
    if (!ymd) return "";
    const [y, m, d] = ymd.split("-");
    return `${d}/${m}/${y}`;
  };
  const from = format(fromDate);
  const to = format(toDate);
  if (from && to) return from === to ? from : `${from} → ${to}`;
  if (from) return `Từ ${from}`;
  if (to) return `Đến ${to}`;
  return "Không đặt kỳ";
}

/** Tổng số nhiệm vụ trong các khối trục. */
export function countAxisRows(axes: SummaryAxisBlock[]): number {
  return axes.reduce(
    (sum, axis) =>
      sum + axis.groups.reduce((inner, group) => inner + group.rows.length, 0),
    0,
  );
}

export function flattenAxisRows(axes: SummaryAxisBlock[]): SummaryRow[] {
  return axes.flatMap((axis) => axis.groups.flatMap((group) => group.rows));
}
