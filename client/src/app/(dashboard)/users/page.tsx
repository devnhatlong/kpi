import type { Metadata } from "next";

import { PlaceholderPage } from "@/components/common/placeholder-page";

export const metadata: Metadata = {
  title: "Người dùng",
};

export default function UsersPage() {
  return (
    <PlaceholderPage title="Người dùng" description="Quản lý tài khoản và phân quyền người dùng." />
  );
}
