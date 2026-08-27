import type { Metadata } from "next";

import { PersonalMissionDayView } from "@/features/personal-mission/components/personal-mission-day-view";

export const metadata: Metadata = {
  title: "Nhiệm vụ cá nhân",
};

/**
 * Vào thẳng nhiệm vụ của tuần này - không còn bảng liệt kê từng ngày.
 * Xem ngày khác thì chỉnh khoảng ngày trên đầu trang; đường dẫn cố định cho
 * đúng một ngày là /mission/personal/20-08-2026 (ngày-tháng-năm).
 */
export default function MissionPersonalPage() {
  return <PersonalMissionDayView />;
}
