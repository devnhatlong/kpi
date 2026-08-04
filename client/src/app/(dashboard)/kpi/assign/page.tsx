import type { Metadata } from "next";

import { PlaceholderPage } from "@/components/common/placeholder-page";

export const metadata: Metadata = {
  title: "Giao KPI xuống",
};

export default function KpiAssignPage() {
  return (
    <PlaceholderPage
      title="Giao KPI xuống"
      description="Giao KPI có chỉ định người/đơn vị thực hiện (Tỉnh → Phòng → Đội → Cán bộ)."
    />
  );
}
