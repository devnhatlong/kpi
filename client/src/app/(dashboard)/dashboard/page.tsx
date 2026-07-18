import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Tổng quan - KPI Manager",
  description: "Trang tổng quan hệ thống chấm điểm KPI.",
};

export default function DashboardPage() {
  return (
    <div className="flex min-h-[calc(100svh-8rem)] items-center justify-center">
      <p className="text-sm text-muted-foreground">Nội dung tổng quan sẽ được bổ sung.</p>
    </div>
  );
}
