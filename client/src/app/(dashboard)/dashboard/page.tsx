import type { Metadata } from "next";

import { PlaceholderPage } from "@/components/common/placeholder-page";

export const metadata: Metadata = {
  title: "Thống kê",
  description: "Dashboard thống kê KPI theo phạm vi role.",
};

export default function DashboardPage() {
  return (
    <PlaceholderPage
      title="Thống kê"
      description="Dashboard theo scope: Staff/Manager (đội), Unit admin (phòng), Superadmin (toàn tỉnh)."
    />
  );
}
