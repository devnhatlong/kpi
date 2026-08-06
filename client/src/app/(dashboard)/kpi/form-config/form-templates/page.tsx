import type { Metadata } from "next";

import { FormTemplatesView } from "@/features/kpi-form-config/components/form-templates-view";

export const metadata: Metadata = {
  title: "Mẫu bảng KPI",
};

export default function FormTemplatesPage() {
  return <FormTemplatesView />;
}
