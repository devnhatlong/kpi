import type { Metadata } from "next";

import { PlaceholderPage } from "@/components/common/placeholder-page";

export const metadata: Metadata = {
  title: "Báo cáo",
};

export default function ReportsPage() {
  return <PlaceholderPage title="Báo cáo" description="Xem và xuất báo cáo KPI." />;
}
