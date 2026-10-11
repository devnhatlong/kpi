import type { Metadata } from "next";

import { TeamReportAppraisalInboxView } from "@/features/team-report/components/team-report-appraisal-inbox-view";

export const metadata: Metadata = {
  title: "Duyệt bảng thẩm định",
};

export default function TeamReportAppraisalInboxPage() {
  return <TeamReportAppraisalInboxView />;
}
