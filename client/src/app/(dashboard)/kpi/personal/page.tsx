import type { Metadata } from "next";

import { PersonalKpiListView } from "@/features/personal-kpi/components/personal-kpi-list-view";

export const metadata: Metadata = {
  title: "KPI của tôi",
};

export default function KpiPersonalPage() {
  return <PersonalKpiListView />;
}
