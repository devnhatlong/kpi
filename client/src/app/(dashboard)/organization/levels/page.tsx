import type { Metadata } from "next";

import { LevelsView } from "@/features/organization/components/levels-view";

export const metadata: Metadata = {
  title: "Cấp đơn vị",
};

export default function DepartmentLevelsPage() {
  return <LevelsView />;
}
