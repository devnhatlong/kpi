import type { Metadata } from "next";

import { PlaceholderPage } from "@/components/common/placeholder-page";

export const metadata: Metadata = {
  title: "Hồ sơ",
};

export default function ProfilePage() {
  return (
    <PlaceholderPage title="Hồ sơ" description="Thông tin tài khoản và cá nhân." />
  );
}
