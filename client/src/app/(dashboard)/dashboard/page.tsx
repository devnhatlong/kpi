import type { Metadata } from "next";

import { DashboardSwitch } from "@/features/statistics/components/dashboard-switch";

export const metadata: Metadata = {
  title: "Thống kê",
  description: "Số liệu của tài khoản đang đăng nhập.",
};

export default function DashboardPage() {
  return <DashboardSwitch />;
}
