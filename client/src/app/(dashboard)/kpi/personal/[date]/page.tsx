import type { Metadata } from "next";

import { PersonalKpiDayView } from "@/features/personal-kpi/components/personal-kpi-day-view";

type PageProps = {
  params: Promise<{ date: string }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { date } = await params;
  return { title: `KPI cá nhân ${date}` };
}

export default async function PersonalKpiDayPage({ params }: PageProps) {
  const { date } = await params;
  return <PersonalKpiDayView reportDate={date} />;
}
