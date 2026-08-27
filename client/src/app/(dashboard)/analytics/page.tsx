import type { Metadata } from "next";

import { PlaceholderPage } from "@/components/common/placeholder-page";

export const metadata: Metadata = {
  title: "Phân tích",
};

export default function AnalyticsPage() {
  return (
    <PlaceholderPage
      title="Phân tích"
      description="Phân tích xu hướng và hiệu suất nhiệm vụ."
    />
  );
}
