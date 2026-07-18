import type { Metadata } from "next";

import { PlaceholderPage } from "@/components/common/placeholder-page";

export const metadata: Metadata = {
  title: "Nhân viên",
};

export default function EmployeesPage() {
  return (
    <PlaceholderPage title="Nhân viên" description="Danh sách và hồ sơ nhân viên." />
  );
}
