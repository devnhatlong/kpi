import type { Metadata } from "next";

import { PlaceholderPage } from "@/components/common/placeholder-page";

export const metadata: Metadata = {
  title: "Cấu hình & giao KPI",
};

export default function KpiConfigPage() {
  return (
    <PlaceholderPage
      title="Cấu hình & giao KPI"
      description="Thiết lập chỉ tiêu và giao KPI cho đơn vị, nhân viên."
    />
  );
}
