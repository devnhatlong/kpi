import type { Metadata } from "next";

import { PlaceholderPage } from "@/components/common/placeholder-page";

export const metadata: Metadata = {
  title: "Theo dõi KPI",
};

export default function KpiTrackingPage() {
  return (
    <PlaceholderPage title="Theo dõi KPI" description="Giám sát tiến độ thực hiện KPI." />
  );
}
