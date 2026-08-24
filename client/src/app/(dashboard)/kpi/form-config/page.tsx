import type { Metadata } from "next";

import { ReportTemplatesView } from "@/features/kpi-form-config/components/report-builder/report-templates-view";

export const metadata: Metadata = {
  title: "Mẫu báo cáo KPI",
};

export default function ReportTemplatesPage() {
  return <ReportTemplatesView />;
}
