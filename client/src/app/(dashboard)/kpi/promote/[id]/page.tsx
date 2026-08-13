import type { Metadata } from "next";

import { SummaryReportDetail } from "@/features/kpi-summary-report/components/summary-report-detail";

export const metadata: Metadata = {
  title: "Chi tiết báo cáo tổng",
};

export default async function KpiSummaryReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SummaryReportDetail reportId={id} />;
}
