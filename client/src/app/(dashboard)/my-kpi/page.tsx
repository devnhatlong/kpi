import { redirect } from "next/navigation";

/** Đổi tên theo đặc tả → KPI cá nhân. */
export default function MyKpiRedirectPage() {
  redirect("/kpi/personal");
}
