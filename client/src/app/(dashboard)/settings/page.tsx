import type { Metadata } from "next";

import { PlaceholderPage } from "@/components/common/placeholder-page";

export const metadata: Metadata = {
  title: "Cài đặt",
};

export default function SettingsPage() {
  return <PlaceholderPage title="Cài đặt" description="Cấu hình hệ thống và tùy chọn cá nhân." />;
}
