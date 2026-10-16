import type {
  TaskReadiness,
  TeamReportDayStatus,
} from "@/features/team-report/types";

/**
 * Màu của các nhãn trạng thái trong báo cáo ngày của đội.
 *
 * Gom vào một chỗ vì cùng một nhãn xuất hiện ở nhiều màn - hàng đợi, dạng bảng,
 * trình lập báo cáo. Mỗi màn tự đặt màu thì cùng một chữ "Đã xong" chỗ xanh chỗ
 * xám, người dùng tưởng là hai trạng thái khác nhau.
 *
 * Mọi bảng màu đều khai đủ cả nền sáng lẫn nền tối: thiếu biến thể `dark:` thì
 * nền tối chữ chìm hẳn vào nền.
 */
export const READINESS_CLASS: Record<TaskReadiness, string> = {
  UNCLASSIFIED:
    "border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200",
  IN_PROGRESS:
    "border-sky-300 bg-sky-100 text-sky-900 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-200",
  READY:
    "border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
};

/**
 * Nhiệm vụ đã đóng - hai tình huống, hai màu.
 *
 * "Đã xong" là kết quả tốt nên để xanh lá. "Đã dừng giữa chừng" thì KHÔNG được
 * mang cùng màu: đó là việc bỏ dở, tô xanh lên là đọc lướt qua tưởng đã hoàn
 * thành.
 */
export const CLOSED_DONE_CLASS =
  "border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200";

export const CLOSED_STOPPED_CLASS =
  "border-rose-300 bg-rose-100 text-rose-900 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200";

/**
 * Màu theo mức đạt của một trục.
 *
 * Bốn bậc chứ không phải đạt/không đạt: bảng KPI không có ngưỡng "đỗ" nào, mà
 * người đọc cần liếc qua biết ngay trục nào đang đuối. Chia bậc ở một chỗ để
 * thẻ điểm, thanh tỉ lệ và dòng tổng không mỗi nơi một ngưỡng.
 *
 * `null` = chưa đủ dữ liệu để chia, KHÔNG phải 0 điểm - nên để xám, tô đỏ là
 * nói rằng họ làm kém trong khi thật ra chưa chấm.
 */
export function scoreTone(ratio: number | null): {
  badge: string;
  bar: string;
  text: string;
} {
  if (ratio === null) {
    return {
      badge: "",
      bar: "bg-muted-foreground/30",
      text: "text-muted-foreground",
    };
  }
  if (ratio >= 0.8) {
    return {
      badge: CLOSED_DONE_CLASS,
      bar: "bg-emerald-500",
      text: "text-emerald-700 dark:text-emerald-400",
    };
  }
  if (ratio >= 0.5) {
    return {
      badge:
        "border-sky-300 bg-sky-100 text-sky-900 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-200",
      bar: "bg-sky-500",
      text: "text-sky-700 dark:text-sky-400",
    };
  }
  if (ratio >= 0.25) {
    return {
      badge:
        "border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200",
      bar: "bg-amber-500",
      text: "text-amber-700 dark:text-amber-400",
    };
  }
  return {
    badge: CLOSED_STOPPED_CLASS,
    bar: "bg-rose-500",
    text: "text-rose-700 dark:text-rose-400",
  };
}

/**
 * Nút "Trả lại" (cấp trên đẩy bản về) - viền ĐỎ: rút lại công sức của đơn vị
 * lập, phải nhìn khác hẳn nút Duyệt đứng ngay cạnh. Vẫn là nút viền chứ không
 * tô đặc: bấm vào chỉ mở hộp thoại ghi lý do, chưa làm gì ngay.
 */
export const RETURN_BUTTON_CLASS =
  "border-rose-300 bg-background text-rose-700 hover:bg-rose-50 hover:text-rose-800 dark:border-rose-900 dark:text-rose-400 dark:hover:bg-rose-950/40 dark:hover:text-rose-300";

/**
 * Nút "Rút về" (đơn vị lập tự kéo bản đã trình về) - viền CAM: lùi một bước
 * của chính mình, nhẹ hơn trả lại nhưng vẫn phải khác nút trình / sửa thường.
 */
export const RECALL_BUTTON_CLASS =
  "border-orange-300 bg-background text-orange-700 hover:bg-orange-50 hover:text-orange-800 dark:border-orange-900 dark:text-orange-400 dark:hover:bg-orange-950/40 dark:hover:text-orange-300";

/** Nút xác nhận rút về trong hộp thoại - cam tô đặc, cùng họ với nút ngoài. */
export const RECALL_CONFIRM_CLASS =
  "bg-orange-600 text-white hover:bg-orange-700 dark:bg-orange-600 dark:hover:bg-orange-500";

/** Trạng thái của một bản đã trình lên cấp trên. */
export const DAY_STATUS_CLASS: Record<TeamReportDayStatus, string> = {
  DRAFT: "",
  PENDING:
    "border-sky-300 bg-sky-100 text-sky-900 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-200",
  APPROVED: CLOSED_DONE_CLASS,
  RETURNED:
    "border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200",
};
