import type { Metadata } from "next";

import { PersonalKpiDayView } from "@/features/personal-kpi/components/personal-kpi-day-view";

export const metadata: Metadata = {
  title: "KPI cá nhân",
};

/**
 * Vào thẳng nhiệm vụ của tuần này - không còn bảng liệt kê từng ngày.
 * Xem ngày khác thì chỉnh khoảng ngày trên đầu trang; đường dẫn cố định cho
 * đúng một ngày là /kpi/personal/20-08-2026 (ngày-tháng-năm).
 */
export default function KpiPersonalPage() {
  return <PersonalKpiDayView />;
}
