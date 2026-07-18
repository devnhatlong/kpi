import type { Metadata } from "next";

import { PlaceholderPage } from "@/components/common/placeholder-page";

export const metadata: Metadata = {
  title: "KPI của tôi",
};

export default function MyKpiPage() {
  return (
    <PlaceholderPage
      title="KPI của tôi"
      description="Theo dõi và cập nhật các chỉ tiêu KPI được giao."
    />
  );
}
