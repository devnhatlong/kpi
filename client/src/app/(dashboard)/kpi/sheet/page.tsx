import type { Metadata } from "next";

import { UnitKpiSheetView } from "@/features/kpi-config/components/unit-kpi-sheet-view";

export const metadata: Metadata = {
  title: "Form KPI",
};

export default function KpiSheetPage() {
  return <UnitKpiSheetView />;
}
