import type { Metadata } from "next";

import { UnitsView } from "@/features/organization/components/units-view";

export const metadata: Metadata = {
  title: "Đơn vị",
};

export default function UnitsPage() {
  return <UnitsView />;
}
