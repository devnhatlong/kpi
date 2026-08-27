import type { Metadata } from "next";

import { StatisticsView } from "@/features/statistics/components/statistics-view";

export const metadata: Metadata = {
  title: "Thống kê",
  description: "Điểm nhiệm vụ theo trục, tiến độ xử lý và phân bố nhiệm vụ.",
};

export default function DashboardPage() {
  return <StatisticsView />;
}
