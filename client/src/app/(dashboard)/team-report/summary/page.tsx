import type { Metadata } from "next";

import { TeamReportSummaryView } from "@/features/team-report/components/team-report-summary-view";

export const metadata: Metadata = {
  title: "Tạo báo cáo tổng hợp",
};

/** Gom việc đã sẵn sàng trong một kỳ rồi trình lên cấp trên tự chọn. */
export default function TeamReportSummaryPage() {
  return <TeamReportSummaryView />;
}
