import type { Metadata } from "next";

import { ReportOverviewView } from "@/features/team-report/components/report-overview-view";

export const metadata: Metadata = {
  title: "Số liệu báo cáo",
  description: "Số nhiệm vụ, báo cáo đã trình và tỷ lệ trình đúng hạn.",
};

export default function ReportsPage() {
  return <ReportOverviewView />;
}
