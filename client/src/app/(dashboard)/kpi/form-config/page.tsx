import type { Metadata } from "next";

import { ReportBuilderView } from "@/features/kpi-form-config/components/report-builder/report-builder-view";

export const metadata: Metadata = {
  title: "Cấu hình biểu mẫu báo cáo",
};

export default function ReportFormConfigPage() {
  return <ReportBuilderView />;
}
