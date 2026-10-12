import type { Metadata } from "next";

import { TeamReportCommendationView } from "@/features/team-report/components/team-report-commendation-view";

export const metadata: Metadata = {
  title: "Biểu dương, phê bình",
};

/** Bảng đề xuất biểu dương, phê bình tháng - chỉ trưởng phòng lập. */
export default function TeamReportCommendationsPage() {
  return <TeamReportCommendationView />;
}
