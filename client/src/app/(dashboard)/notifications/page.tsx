import type { Metadata } from "next";

import { NotificationsView } from "@/features/notifications/components/notifications-view";

export const metadata: Metadata = {
  title: "Thông báo",
};

/* Không có mục menu - vào từ nút "Xem tất cả thông báo" trên chuông. */
export default function NotificationsPage() {
  return <NotificationsView />;
}
