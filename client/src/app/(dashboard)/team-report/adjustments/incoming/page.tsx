import type { Metadata } from "next";

import { TeamReportAdjustmentInboxView } from "@/features/team-report/components/team-report-adjustment-inbox-view";

export const metadata: Metadata = {
  title: "Duyệt điểm cộng, trừ & xếp loại",
};

/** Cấp trên đọc bảng đề xuất điểm cộng, trừ & xếp loại các đội trình lên, rồi duyệt hoặc trả lại. */
export default function TeamReportAdjustmentInboxPage() {
  return <TeamReportAdjustmentInboxView />;
}
