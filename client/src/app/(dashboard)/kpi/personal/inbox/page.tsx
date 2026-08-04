import { redirect } from "next/navigation";

/** Giữ link cũ → chuyển sang /kpi/received */
export default function KpiPersonalInboxRedirectPage() {
  redirect("/kpi/received");
}
