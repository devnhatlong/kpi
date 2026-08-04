import type { Metadata } from "next";

import { PlaceholderPage } from "@/components/common/placeholder-page";

export const metadata: Metadata = {
  title: "Tổng hợp & nâng cấp",
};

export default function KpiPromotePage() {
  return (
    <PlaceholderPage
      title="Tổng hợp & nâng cấp"
      description="Manager tích chọn công việc cán bộ → KPI đội. Unit admin tích chọn KPI đội → KPI phòng."
    />
  );
}
