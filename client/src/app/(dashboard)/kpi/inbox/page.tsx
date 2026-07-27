import type { Metadata } from "next";

import { HandoffInboundView } from "@/features/kpi-config/components/handoff-inbound-view";

export const metadata: Metadata = {
  title: "Tiếp nhận nhiệm vụ",
};

export default function KpiInboxPage() {
  return <HandoffInboundView />;
}
