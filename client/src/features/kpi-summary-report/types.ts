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
 * - DRAFT    : đang soạn, còn thêm bớt nhiệm vụ được
 * - SENT     : đã trình, đang nằm ở chỗ cấp trên chờ quyết
 * - RETURNED : cấp trên trả lại kèm lý do - sửa rồi trình lại
 * - APPROVED : cấp trên đã duyệt, khoá lại
 */
export type SummaryReportStatus = "DRAFT" | "SENT" | "RETURNED" | "APPROVED";

export const SUMMARY_REPORT_STATUS_LABEL: Record<SummaryReportStatus, string> =
  {
    DRAFT: "Đang soạn",
    SENT: "Chờ duyệt",
    RETURNED: "Bị trả lại",
    APPROVED: "Đã duyệt",
  };

const STATUS_BADGE: Record<SummaryReportStatus, string> = {
  DRAFT:
    "border-transparent bg-violet-100 text-violet-700 hover:bg-violet-100 dark:bg-violet-950/60 dark:text-violet-300",
  SENT: "border-transparent bg-amber-100 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/60 dark:text-amber-300",
  RETURNED:
    "border-transparent bg-rose-100 text-rose-700 hover:bg-rose-100 dark:bg-rose-950/60 dark:text-rose-300",
  APPROVED:
    "border-transparent bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300",
};

export function summaryReportStatusBadgeClass(
  status: SummaryReportStatus,
): string {
  return STATUS_BADGE[status] ?? STATUS_BADGE.DRAFT;
}

/** Vai của người đang xem với một báo cáo. */
export type SummaryReportRole = "OWNER" | "REVIEWER";

/**
 * Ai sửa được nội dung lúc này.
 *
 * Người lập sửa khi còn soạn hoặc vừa bị trả lại; cấp trên đang giữ bản trình
 * cũng sửa được rồi duyệt luôn - trả đi trả lại chỉ để bỏ một dòng thừa thì
 * tốn thời gian của cả hai bên. Duyệt xong là khoá.
 * Khớp `requireEditable` bên server.
 */
export function canEditSummaryReport(
  status: SummaryReportStatus,
  role: SummaryReportRole = "OWNER",
) {
  return role === "REVIEWER"
    ? status === "SENT"
    : status === "DRAFT" || status === "RETURNED";
}

/** Cấp trên duyệt / trả lại được khi bản trình còn chờ mình quyết. */
export function canDecideSummaryReport(status: SummaryReportStatus) {
  return status === "SENT";
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
  | "RECALL"
  | "FORWARD"
  | "APPROVE"
  | "RETURN";

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
  /** Người trình bản hiện tại - trả lại thì báo cáo về đúng tay người này. */
  sentById: string | null;
  sentByName: string;
  sentNote: string;
  sentAt?: string | null;
  /** Lý do cấp trên trả lại lần gần nhất. */
  returnReason: string;
  /** Ai duyệt / trả lại gần nhất. */
  decidedByName: string;
  decidedAt?: string | null;
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
  /** Báo cáo cấp dưới đã trình lên tôi. */
  incoming: number;
  /** Trong đó, số bản còn chờ tôi quyết. */
  incomingPending: number;
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
  /** mine = báo cáo tôi lập; incoming = cấp dưới trình lên tôi. */
  scope?: "mine" | "incoming";
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
