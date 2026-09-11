import type { Metadata } from "next";

import { AdjustmentsView } from "@/features/mission-form-config/components/adjustments-view";

export const metadata: Metadata = {
  title: "Điểm cộng, điểm trừ & xếp loại",
};

export default function AdjustmentsPage() {
  return <AdjustmentsView />;
}
