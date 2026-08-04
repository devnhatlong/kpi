import type { Metadata } from "next";

import { PlaceholderPage } from "@/components/common/placeholder-page";

export const metadata: Metadata = {
  title: "Danh mục",
};

export default function KpiCatalogsPage() {
  return (
    <PlaceholderPage
      title="Danh mục"
      description="Loại công việc, lĩnh vực, mức độ ưu tiên, thang điểm / tiêu chí chấm - admin quản lý trong CSDL."
    />
  );
}
