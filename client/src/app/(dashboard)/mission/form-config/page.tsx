import type { Metadata } from "next";

import { ReportTemplatesView } from "@/features/mission-form-config/components/report-builder/report-templates-view";

export const metadata: Metadata = {
  title: "Mẫu báo cáo nhiệm vụ",
};

export default function ReportTemplatesPage() {
  return <ReportTemplatesView />;
}
