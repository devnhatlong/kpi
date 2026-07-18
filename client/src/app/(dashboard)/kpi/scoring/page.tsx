import type { Metadata } from "next";

import { PlaceholderPage } from "@/components/common/placeholder-page";

export const metadata: Metadata = {
  title: "Chấm điểm KPI",
};

export default function KpiScoringPage() {
  return (
    <PlaceholderPage title="Chấm điểm KPI" description="Chấm điểm và đánh giá hiệu suất KPI." />
  );
}
