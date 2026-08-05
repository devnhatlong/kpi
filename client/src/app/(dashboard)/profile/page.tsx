import { redirect } from "next/navigation";

/** Hồ sơ đã gộp vào tab "Hồ sơ" của trang Cài đặt. */
export default function ProfilePage() {
  redirect("/settings");
}
