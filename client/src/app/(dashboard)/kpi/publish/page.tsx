import type { Metadata } from "next";

import { MasterFormAdminView } from "@/features/kpi-config/components/master-form-admin-view";

export const metadata: Metadata = {
  title: "Phát hành KPI cấp tỉnh",
};

export default function KpiPublishPage() {
  return <MasterFormAdminView />;
}
