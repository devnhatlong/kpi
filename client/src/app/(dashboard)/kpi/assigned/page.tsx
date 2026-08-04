import type { Metadata } from "next";

import { PlaceholderPage } from "@/components/common/placeholder-page";

export const metadata: Metadata = {
  title: "KPI cấp trên giao",
};

export default function KpiAssignedPage() {
  return (
    <PlaceholderPage
      title="KPI cấp trên giao"
      description="Nhiệm vụ cấp trên giao xuống cho bạn (luồng trên xuống), có deadline và người giao."
    />
  );
}
