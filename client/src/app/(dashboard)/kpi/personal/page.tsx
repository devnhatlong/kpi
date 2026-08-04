import type { Metadata } from "next";

import { PlaceholderPage } from "@/components/common/placeholder-page";

export const metadata: Metadata = {
  title: "KPI cá nhân",
};

export default function KpiPersonalPage() {
  return (
    <PlaceholderPage
      title="KPI cá nhân"
      description="Công việc do bạn tự nhập (luồng dưới lên). Form nhập sẽ bổ sung theo đặc tả."
    />
  );
}
