import type { Metadata } from "next";

import { PersonalKpiBoardView } from "@/features/personal-kpi/components/personal-kpi-board-view";

export const metadata: Metadata = {
  title: "Duyệt KPI cấp dưới",
};

export default function KpiReceivedPage() {
  return <PersonalKpiBoardView />;
}
