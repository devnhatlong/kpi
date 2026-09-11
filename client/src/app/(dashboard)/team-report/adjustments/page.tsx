import type { Metadata } from "next";

import { TeamReportAdjustmentView } from "@/features/team-report/components/team-report-adjustment-view";

export const metadata: Metadata = {
  title: "Điểm cộng, trừ & xếp loại",
};

/** Phụ lục đề xuất điểm cộng, điểm trừ và điều chỉnh xếp loại - tháng một bản. */
export default function TeamReportAdjustmentsPage() {
  return <TeamReportAdjustmentView />;
}
