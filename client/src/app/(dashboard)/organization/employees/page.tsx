import type { Metadata } from "next";

import { EmployeesView } from "@/features/organization/components/employees-view";

export const metadata: Metadata = {
  title: "Người dùng",
};

export default function EmployeesPage() {
  return <EmployeesView />;
}
