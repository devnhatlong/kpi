import { redirect } from "next/navigation";

/** Theo dõi và duyệt gộp về một màn - giữ đường cũ khỏi gãy link. */
export default function KpiTrackingPage() {
  redirect("/kpi/received");
}
