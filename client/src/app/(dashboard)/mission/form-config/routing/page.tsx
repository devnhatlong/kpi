import type { Metadata } from "next";

import { ReportRoutingView } from "@/features/mission-form-config/components/report-routing-view";

export const metadata: Metadata = {
  title: "Luồng trình báo cáo",
};

/** Quản trị khai ai gửi → gửi cho ai, theo từng loại báo cáo. */
export default function ReportRoutingPage() {
  return <ReportRoutingView />;
}
