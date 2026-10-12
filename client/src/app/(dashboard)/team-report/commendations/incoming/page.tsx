import type { Metadata } from "next";

import { TeamReportCommendationInboxView } from "@/features/team-report/components/team-report-commendation-inbox-view";

export const metadata: Metadata = {
  title: "Theo dõi biểu dương, phê bình",
};

/** Hộp đến của các đội Phòng Tham mưu - chủ trì duyệt, các đội khác theo dõi. */
export default function TeamReportCommendationInboxPage() {
  return <TeamReportCommendationInboxView />;
}
