import type { Metadata } from "next";

import { KpiConfigView } from "@/features/kpi-config/components/kpi-config-view";

export const metadata: Metadata = {
  title: "Cấu hình & giao KPI",
};

export default function KpiConfigPage() {
  return <KpiConfigView />;
}
