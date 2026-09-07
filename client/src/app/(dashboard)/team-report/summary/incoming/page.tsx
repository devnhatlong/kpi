import type { Metadata } from "next";

import { TeamReportSummaryInboxView } from "@/features/team-report/components/team-report-summary-inbox-view";

export const metadata: Metadata = {
  title: "Duyệt báo cáo tổng hợp",
};

/** Cấp trên đọc bản tổng hợp theo kỳ các đội trình lên, rồi duyệt hoặc trả lại. */
export default function TeamReportSummaryInboxPage() {
  return <TeamReportSummaryInboxView />;
}
