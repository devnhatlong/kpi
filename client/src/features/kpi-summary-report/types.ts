import type {
  PersonalKpiBoardAxis,
  PersonalKpiBoardRow,
} from "@/features/personal-kpi/api";

/**
 * Khối trục của báo cáo tổng dùng chung kiểu với bảng tổng: server gom bằng
 * cùng một hàm nên hai màn hình luôn nhận đúng một hình dạng dữ liệu.
 */
export type SummaryAxisBlock = PersonalKpiBoardAxis;
export type SummaryRow = PersonalKpiBoardRow;

/**
 * - DRAFT     : còn thêm bớt nhiệm vụ được
 * - FINALIZED : đã chốt, chỉ còn xem và xuất file
 */
export type SummaryReportStatus = "DRAFT" | "FINALIZED";

export const SUMMARY_REPORT_STATUS_LABEL: Record<SummaryReportStatus, string> = {
  DRAFT: "Nháp",
  FINALIZED: "Đã chốt",
};

export function summaryReportStatusBadgeClass(
  status: SummaryReportStatus,
): string {
  return status === "FINALIZED"
    ? "border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
    : "border-transparent bg-slate-100 text-slate-700 dark:bg-slate-800/70 dark:text-slate-300";
}

export function canEditSummaryReport(status: SummaryReportStatus) {
  return status === "DRAFT";
}

/** Dòng trong danh sách báo cáo - không kèm itemIds cho nhẹ. */
export type SummaryReport = {
  _id: string;
  title: string;
  fromDate: string;
  toDate: string;
  note: string;
  ownerId: string;
  ownerName: string;
  status: SummaryReportStatus;
  itemCount: number;
  finalizedAt?: string | null;
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
