import type { Metadata } from "next";

import { WorkContentsView } from "@/features/kpi-form-config/components/work-contents-view";

export const metadata: Metadata = {
  title: "Nội dung công việc",
};

export default function WorkContentsPage() {
  return <WorkContentsView />;
}
