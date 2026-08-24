import type { Metadata } from "next";

import { CriteriaView } from "@/features/kpi-form-config/components/criteria-view";

export const metadata: Metadata = {
  title: "Tiêu chí chấm điểm",
};

export default function CriteriaPage() {
  return <CriteriaView />;
}
