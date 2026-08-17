import type { Metadata } from "next";

import { PersonalKpiDayView } from "@/features/personal-kpi/components/personal-kpi-day-view";

export const metadata: Metadata = {
  title: "KPI của tôi",
};

/**
 * Vào thẳng nhiệm vụ của hôm nay - không còn bảng liệt kê từng ngày.
 * Xem ngày khác thì đổi ô ngày trên đầu trang (nhảy sang /kpi/personal/<ngày>).
 */
export default function KpiPersonalPage() {
  return <PersonalKpiDayView />;
}
