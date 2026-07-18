import type { Metadata } from "next";

import { PermissionsView } from "@/features/organization/components/permissions-view";

export const metadata: Metadata = {
  title: "Quyền",
};

export default function PermissionsPage() {
  return <PermissionsView />;
}
