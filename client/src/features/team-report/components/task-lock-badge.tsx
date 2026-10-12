import { Lock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { DAY_STATUS_CLASS } from "@/features/team-report/status-styles";
import type { TeamReportTaskLock } from "@/features/team-report/types";
import { cn } from "@/lib/utils";

/**
 * Nhãn khoá trên dòng nhiệm vụ đã nằm trong báo cáo đã trình - dùng chung cho
 * màn phân loại và bảng nhập, một nhãn một màu ở cả hai chỗ.
 */
export function TaskLockBadge({
  lock,
  className,
}: {
  lock: TeamReportTaskLock;
  className?: string;
}) {
  const approved = lock.status === "APPROVED";
  return (
    <Badge
      variant="secondary"
      title={
        approved
          ? `Trong "${lock.title}" - đã duyệt, trục và nội dung công việc đã chốt`
          : `Trong "${lock.title}" - chờ ${lock.holder} duyệt, chưa sửa được`
      }
      className={cn(
        "gap-1 whitespace-nowrap font-normal",
        DAY_STATUS_CLASS[lock.status],
        className,
      )}
    >
      <Lock className="size-3" aria-hidden="true" />
      {approved ? "Đã duyệt" : "Chờ duyệt"}
    </Badge>
  );
}
