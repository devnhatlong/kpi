import type { Metadata } from "next";

import { PersonalKpiListView } from "@/features/personal-kpi/components/personal-kpi-list-view";

export const metadata: Metadata = {
  title: "KPI cá nhân",
};

export default function KpiPersonalPage() {
  return <PersonalKpiListView />;
}
