import type { Metadata } from "next";

import { WorkTasksView } from "@/features/mission-form-config/components/work-tasks-view";

export const metadata: Metadata = {
  title: "Nhiệm vụ",
};

export default function WorkTasksPage() {
  return <WorkTasksView />;
}
