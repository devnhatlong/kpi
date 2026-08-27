import type { Metadata } from "next";

import { ReceivedAssignmentsView } from "@/features/mission-assignment/components/received-assignments-view";

export const metadata: Metadata = {
  title: "Nhiệm vụ cấp trên giao",
};

export default function MissionAssignedPage() {
  return <ReceivedAssignmentsView />;
}
