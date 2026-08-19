import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { PersonalKpiDayView } from "@/features/personal-kpi/components/personal-kpi-day-view";

type PageProps = {
  params: Promise<{ date: string }>;
};

/**
 * Đường dẫn viết theo thứ tự NGÀY-THÁNG-NĂM cho khớp cách người dùng đọc ngày
 * (20-08-2026), còn trong code và khi gọi API vẫn là YYYY-MM-DD.
 */
const DMY = /^(\d{2})-(\d{2})-(\d{4})$/;
/** Dạng cũ trên các đường dẫn đã lỡ lưu / gửi cho nhau. */
const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

function toYmd(param: string): string | null {
  const parts = DMY.exec(param);
  if (!parts) return null;
  const [, day, month, year] = parts;
  return `${year}-${month}-${day}`;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { date } = await params;
  return { title: `KPI cá nhân ${date.replace(/-/g, "/")}` };
}

export default async function PersonalKpiDayPage({ params }: PageProps) {
  const { date } = await params;

  const ymd = toYmd(date);
  if (ymd) return <PersonalKpiDayView reportDate={ymd} />;

  // Link cũ thì đưa về đúng một kiểu đường dẫn, khỏi tồn tại song song hai dạng.
  const old = YMD.exec(date);
  if (old) redirect(`/kpi/personal/${old[3]}-${old[2]}-${old[1]}`);

  notFound();
}
