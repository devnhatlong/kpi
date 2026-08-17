import type { Metadata } from "next";

import { PersonalKpiTrackingView } from "@/features/personal-kpi/components/personal-kpi-tracking-view";

export const metadata: Metadata = {
  title: "Theo dõi & duyệt KPI",
};

/**
 * Màn chính của cấp trên: theo dõi tiến độ và duyệt ngay tại chỗ.
 * Bảng tổng theo mẫu KPI (để đối chiếu và chuyển lên cấp trên) nằm ở
 * /kpi/received/board, vào bằng nút trên đầu trang.
 */
export default function KpiReceivedPage() {
  return <PersonalKpiTrackingView />;
}
