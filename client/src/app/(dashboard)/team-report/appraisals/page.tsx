import type { Metadata } from "next";

import { TeamReportAppraisalView } from "@/features/team-report/components/team-report-appraisal-view";

export const metadata: Metadata = {
  title: "Thẩm định KPI",
};

/** Phụ lục theo dõi, thẩm định tháng của các đội PV01 - mỗi đơn vị một khối. */
export default function TeamReportAppraisalsPage() {
  return <TeamReportAppraisalView />;
}
