import type { PersonalKpiStatus } from "@/features/personal-kpi/types";

/**
 * Palette KPI cá nhân - nền nhạt + chữ đậm, học theo UI báo cáo:
 * xanh duyệt, xanh dương thông tin, cam chờ, đỏ coral trả lại, xám nháp.
 */

/**
 * Badge chỉ để đọc, không phải nút.
 * Mỗi mục ghim luôn `hover:` bằng chính màu nền, vì biến thể `secondary` của
 * Badge có `hover:bg-secondary/80` - không đè thì rê chuột vào là nền nhảy sang
 * xám nhạt trong khi chữ vẫn giữ màu cũ, trông như bị mờ.
 */
export const kpiStatusPillClass: Record<PersonalKpiStatus, string> = {
  DRAFT:
    "border-transparent bg-slate-100 text-slate-600 hover:bg-slate-100 dark:bg-slate-800/80 dark:text-slate-300 dark:hover:bg-slate-800/80",
  PENDING:
    "border-transparent bg-amber-50 text-amber-700 hover:bg-amber-50 dark:bg-amber-950/50 dark:text-amber-300 dark:hover:bg-amber-950/50",
  RETURNED:
    "border-transparent bg-rose-50 text-rose-600 hover:bg-rose-50 dark:bg-rose-950/45 dark:text-rose-300 dark:hover:bg-rose-950/45",
  APPROVED:
    "border-transparent bg-emerald-50 text-emerald-700 hover:bg-emerald-50 dark:bg-emerald-950/45 dark:text-emerald-300 dark:hover:bg-emerald-950/45",
  COMPLETED:
    "border-transparent bg-teal-600 text-white hover:bg-teal-600 dark:bg-teal-700 dark:text-teal-50 dark:hover:bg-teal-700",
};

export function personalKpiStatusBadgeClass(status: PersonalKpiStatus) {
  // Bản ghi cũ / trạng thái lạ vẫn phải ra pill đọc được, không để rơi undefined.
  return kpiStatusPillClass[status] ?? kpiStatusPillClass.DRAFT;
}

export const kpiTone = {
  success: {
    text: "text-emerald-600 dark:text-emerald-400",
    soft: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400",
    icon: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400",
  },
  info: {
    text: "text-sky-600 dark:text-sky-400",
    soft: "bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-400",
    icon: "bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-400",
  },
  warning: {
    text: "text-amber-600 dark:text-amber-400",
    soft: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
    icon: "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400",
  },
  danger: {
    text: "text-rose-600 dark:text-rose-400",
    soft: "bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300",
    icon: "bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400",
  },
  neutral: {
    text: "text-slate-600 dark:text-slate-300",
    soft: "bg-slate-100 text-slate-600 dark:bg-slate-800/70 dark:text-slate-300",
    icon: "bg-slate-100 text-slate-500 dark:bg-slate-800/70 dark:text-slate-400",
  },
} as const;
