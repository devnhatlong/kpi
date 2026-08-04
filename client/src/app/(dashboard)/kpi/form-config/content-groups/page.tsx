import type { Metadata } from "next";

import { ContentGroupsView } from "@/features/kpi-form-config/components/content-groups-view";

export const metadata: Metadata = {
  title: "Nhóm nội dung",
};

export default function ContentGroupsPage() {
  return <ContentGroupsView />;
}
