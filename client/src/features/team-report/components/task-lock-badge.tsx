import { Send } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { DAY_STATUS_CLASS } from "@/features/team-report/status-styles";
import type { TeamReportTaskLock } from "@/features/team-report/types";
import { cn } from "@/lib/utils";

/**
 * Nhãn "Đã báo cáo" trên dòng nhiệm vụ đã nằm trong báo cáo đã trình - dùng
 * chung cho màn phân loại và bảng nhập, một nhãn một màu ở cả hai chỗ.
 *
 * Không phải nhãn KHOÁ: việc còn dở vẫn cập nhật tiến độ cho kỳ sau, chỉ trục
 * và nội dung công việc giữ nguyên. Nhãn để đội biết việc này đã lên cấp trên.
 */
export function TaskLockBadge({
  lock,
  className,
}: {
  lock: TeamReportTaskLock;
  className?: string;
}) {
  const approved = lock.status === "APPROVED";
  const state = approved ? "đã duyệt" : "chờ duyệt";
  return (
    <Badge
      variant="secondary"
      title={
        `Đã báo cáo trong "${lock.title}" - ${state}` +
        (approved ? "" : ` (${lock.holder || "cấp trên"})`) +
        (lock.closedInReport
          ? ". Báo cáo hoàn thành nên không mở lại được."
          : ". Trục và nội dung công việc giữ nguyên; tiến độ vẫn cập nhật cho kỳ sau.")
      }
      className={cn(
        "gap-1 whitespace-nowrap font-normal",
        DAY_STATUS_CLASS[lock.status],
        className,
      )}
    >
      <Send className="size-3" aria-hidden="true" />
      Đã báo cáo · {state}
    </Badge>
  );
}
