import type { Metadata } from "next";

import { KpiScopeConfigView } from "@/features/kpi-scope/components/kpi-scope-config-view";

export const metadata: Metadata = {
  title: "Phân quyền giao KPI",
};

export default function KpiScopePage() {
  return <KpiScopeConfigView />;
}
