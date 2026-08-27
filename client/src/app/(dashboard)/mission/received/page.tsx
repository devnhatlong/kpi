import type { Metadata } from "next";

import { PersonalMissionTrackingView } from "@/features/personal-mission/components/personal-mission-tracking-view";

export const metadata: Metadata = {
  title: "Theo dõi & duyệt nhiệm vụ",
};

/**
 * Màn chính của cấp trên: theo dõi tiến độ và duyệt ngay tại chỗ.
 * Bảng tổng theo mẫu nhiệm vụ (để đối chiếu và chuyển lên cấp trên) nằm ở
 * /mission/received/board, vào bằng nút trên đầu trang.
 */
export default function MissionReceivedPage() {
  return <PersonalMissionTrackingView />;
}
