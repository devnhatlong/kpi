import type { Metadata } from "next";

import { MissionScopeConfigView } from "@/features/mission-scope/components/mission-scope-config-view";

export const metadata: Metadata = {
  title: "Phân quyền giao nhiệm vụ",
};

export default function MissionScopePage() {
  return <MissionScopeConfigView />;
}
