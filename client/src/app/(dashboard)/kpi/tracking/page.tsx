import type { Metadata } from "next";

import { HandoffOutboundView } from "@/features/kpi-config/components/handoff-outbound-view";

export const metadata: Metadata = {
  title: "Chủ trì giao ngang",
};

export default function KpiTrackingPage() {
  return <HandoffOutboundView />;
}
