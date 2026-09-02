import type { Metadata } from "next";

import { TeamReportClassifyView } from "@/features/team-report/components/team-report-classify-view";

export const metadata: Metadata = {
  title: "Phân loại & gửi",
};

/** Giai đoạn 2: xếp nhiệm vụ vào nội dung công việc, chấm, rồi gửi lên trên. */
export default function TeamReportClassifyPage() {
  return <TeamReportClassifyView />;
}
