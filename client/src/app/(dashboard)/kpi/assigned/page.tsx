import type { Metadata } from "next";

import { ReceivedAssignmentsView } from "@/features/kpi-assignment/components/received-assignments-view";

export const metadata: Metadata = {
  title: "KPI cấp trên giao",
};

export default function KpiAssignedPage() {
  return <ReceivedAssignmentsView />;
}
