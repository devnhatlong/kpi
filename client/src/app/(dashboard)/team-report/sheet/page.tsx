import type { Metadata } from "next";

import { TeamReportSheetView } from "@/features/team-report/components/team-report-sheet-view";

export const metadata: Metadata = {
  title: "Bảng nhiệm vụ ngày",
};

/** Giai đoạn 1: cả đội cùng nhập vào một bảng qua tài khoản chung của đội. */
export default function TeamReportSheetPage() {
  return <TeamReportSheetView />;
}
