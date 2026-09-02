import type { Metadata } from "next";

import { TeamReportInboxView } from "@/features/team-report/components/team-report-inbox-view";

export const metadata: Metadata = {
  title: "Duyệt báo cáo ngày",
};

/** Cấp trên: nhận báo cáo ngày các đội gửi lên, duyệt, chỉnh số, gộp. */
export default function TeamReportIncomingPage() {
  return <TeamReportInboxView />;
}
