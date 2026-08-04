import type { Metadata } from "next";

import { ScoreGroupsView } from "@/features/kpi-form-config/components/score-groups-view";

export const metadata: Metadata = {
  title: "Nhóm điểm",
};

export default function ScoreGroupsPage() {
  return <ScoreGroupsView />;
}
