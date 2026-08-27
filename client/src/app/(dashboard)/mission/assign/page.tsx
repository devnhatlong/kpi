import type { Metadata } from "next";

import { IssuedAssignmentsView } from "@/features/mission-assignment/components/issued-assignments-view";

export const metadata: Metadata = {
  title: "Giao nhiệm vụ xuống",
};

export default function MissionAssignPage() {
  return <IssuedAssignmentsView />;
}
