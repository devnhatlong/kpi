import { serverDayjs } from "@/lib/server-time";

export type MonthPeriodOption = {
  /** YYYY-MM của tháng chứa ngày cuối kỳ (14). */
  value: string;
  label: string;
  from: string;
  to: string;
};

/**
 * Các kỳ tháng gần nhất (15 tháng trước → 14 tháng này) theo giờ server, mới
 * nhất trước. "Tháng 11/2026" = 15/10 → 14/11 - cùng cách gọi với báo cáo
 * tháng (`currentMonthRange`).
 *
 * Chỉ gọi sau khi đã đồng bộ giờ server (`useServerTime().ready`).
 */
export function monthPeriodOptions(count = 12): MonthPeriodOption[] {
  const now = serverDayjs();
  return Array.from({ length: count }, (_, i) => {
    const end = now.subtract(i, "month");
    return {
      value: end.format("YYYY-MM"),
      label: `Tháng ${end.format("MM/YYYY")}`,
      from: end.subtract(1, "month").date(15).format("YYYY-MM-DD"),
      to: end.date(14).format("YYYY-MM-DD"),
    };
  });
}
