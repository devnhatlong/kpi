import type { Metadata } from "next";

import { TeamReportSummaryView } from "@/features/team-report/components/team-report-summary-view";

export const metadata: Metadata = {
  title: "Tạo báo cáo của phòng",
};

/**
 * Phòng gom nhiệm vụ của các đội bên dưới thành một bản rồi trình lên tỉnh.
 *
 * Dùng chung màn với đội - nghiệp vụ giống hệt, chỉ khác phạm vi lấy nhiệm vụ
 * (server tự suy từ cây đơn vị) và bộ lọc theo đội.
 */
export default function TeamReportUnitSummaryPage() {
  return <TeamReportSummaryView level="UNIT" />;
}
