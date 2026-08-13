import type { Metadata } from "next";

import { SummaryReportWorkspace } from "@/features/kpi-summary-report/components/summary-report-workspace";

export const metadata: Metadata = {
  title: "Báo cáo tổng",
};

export default function KpiSummaryReportsPage() {
  return <SummaryReportWorkspace />;
}
