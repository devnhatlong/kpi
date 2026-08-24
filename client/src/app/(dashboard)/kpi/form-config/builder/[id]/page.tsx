import type { Metadata } from "next";

import { ReportBuilderView } from "@/features/kpi-form-config/components/report-builder/report-builder-view";

export const metadata: Metadata = {
  title: "Cấu hình biểu mẫu báo cáo",
};

export default async function ReportBuilderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ReportBuilderView templateId={id} />;
}
