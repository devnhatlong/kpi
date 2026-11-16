import { redirect } from "next/navigation";

/* "Số liệu báo cáo" đã gộp vào trang Thống kê (tab "Tiến độ báo cáo").
   Giữ đường cũ để liên kết đã lưu không rơi vào trang trống. */
export default function ReportsPage() {
  redirect("/dashboard");
}
