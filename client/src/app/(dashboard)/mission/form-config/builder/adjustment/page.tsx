import type { Metadata } from "next";

import { AdjustmentBuilderView } from "@/features/mission-form-config/components/report-builder/adjustment-builder-view";

export const metadata: Metadata = {
  title: "Bảng điểm cộng, điểm trừ & xếp loại",
};

/** Mẫu riêng cho bảng ba phần I / II / III - không thuộc mẫu KPI theo năm. */
export default function AdjustmentBuilderPage() {
  return <AdjustmentBuilderView />;
}
