import type { Metadata } from "next";

import { PersonalKpiInboxView } from "@/features/personal-kpi/components/personal-kpi-inbox-view";

export const metadata: Metadata = {
  title: "Duyệt KPI cấp dưới",
};

export default function KpiReceivedPage() {
  return <PersonalKpiInboxView />;
}
