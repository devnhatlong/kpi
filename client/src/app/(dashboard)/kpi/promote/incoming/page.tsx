import type { Metadata } from "next";

import { SummaryReportWorkspace } from "@/features/kpi-summary-report/components/summary-report-workspace";

export const metadata: Metadata = {
  title: "Duyệt báo cáo tổng hợp",
};

export default function IncomingSummaryReportsPage() {
  return <SummaryReportWorkspace scope="incoming" />;
}
