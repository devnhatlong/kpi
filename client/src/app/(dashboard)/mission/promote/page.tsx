import type { Metadata } from "next";

import { SummaryReportWorkspace } from "@/features/mission-summary-report/components/summary-report-workspace";

export const metadata: Metadata = {
  title: "Tạo báo cáo tổng hợp",
};

export default function MissionSummaryReportsPage() {
  return <SummaryReportWorkspace />;
}
