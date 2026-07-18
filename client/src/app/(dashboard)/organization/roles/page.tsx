import type { Metadata } from "next";

import { RolesView } from "@/features/organization/components/roles-view";

export const metadata: Metadata = {
  title: "Vai trò",
};

export default function RolesPage() {
  return <RolesView />;
}
