import type { Metadata } from "next";

import { TeamReportCriteriaView } from "@/features/team-report/components/team-report-criteria-view";

export const metadata: Metadata = {
  title: "Tiêu chí chung (khối A)",
};

/** Khối A của báo cáo: đội tự chấm bảng tiêu chí chung, mỗi tháng một bảng. */
export default function TeamReportCriteriaPage() {
  return <TeamReportCriteriaView />;
}
