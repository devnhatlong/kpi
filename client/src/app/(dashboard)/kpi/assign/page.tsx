import type { Metadata } from "next";

import { IssuedAssignmentsView } from "@/features/kpi-assignment/components/issued-assignments-view";

export const metadata: Metadata = {
  title: "Giao KPI xuống",
};

export default function KpiAssignPage() {
  return <IssuedAssignmentsView />;
}
