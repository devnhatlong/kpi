import type { Metadata } from "next";

import { PlaceholderPage } from "@/components/common/placeholder-page";

export const metadata: Metadata = {
  title: "KPI được giao",
};

export default function KpiAssignedPage() {
  return (
    <PlaceholderPage
      title="KPI được giao"
      description="KPI cấp trên áp xuống cho bạn (luồng trên xuống), có deadline và người giao."
    />
  );
}
