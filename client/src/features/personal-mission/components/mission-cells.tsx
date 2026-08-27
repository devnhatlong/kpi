"use client";

import { Check } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { missionTone } from "@/features/personal-mission/status-styles";
import {
  WORK_STATE_LABEL,
  type DeadlineState,
  type WorkState,
} from "@/features/personal-mission/task-summary";
import { formatYmd } from "@/lib/server-time";
import { cn } from "@/lib/utils";

/**
 * Các ô lặp lại giữa bảng của cán bộ và bảng theo dõi của chỉ huy.
 *
 * Hai bảng khác nhau ở cột và ở nút thao tác, nhưng "hạn", "tiến độ", "tình
 * trạng thực hiện" thì phải trông y hệt nhau - cùng một nhiệm vụ mà mỗi màn vẽ
 * một kiểu là hai người nhìn hai thứ rồi cãi nhau xem ai đúng.
 */

const DEADLINE_BADGE: Record<DeadlineState["tone"], string> = {
  danger: missionTone.danger.soft,
  warning: missionTone.warning.soft,
  muted: missionTone.neutral.soft,
};

const WORK_STATE_PILL: Record<WorkState, string> = {
  NOT_STARTED: missionTone.neutral.soft,
  IN_PROGRESS: missionTone.info.soft,
  DONE: missionTone.success.soft,
};

/** Ngày hết hạn kèm nhãn "Trễ N ngày / Hạn hôm nay / Còn N ngày". */
export function DeadlineCell({
  deadline,
  state,
}: {
  /** Hạn dạng YYYY-MM-DD; rỗng = mẫu nhiệm vụ không có cột hạn hoặc chưa nhập. */
  deadline: string;
  state: DeadlineState | null;
}) {
  if (!deadline)
    return <span className="text-sm text-muted-foreground">-</span>;

  return (
    <>
      <div className="text-sm tabular-nums">{formatYmd(deadline)}</div>
      {state ? (
        <Badge
          variant="secondary"
          className={cn("mt-0.5 font-normal", DEADLINE_BADGE[state.tone])}
        >
          {state.label}
        </Badge>
      ) : null}
    </>
  );
}

/** Thanh phần trăm nhỏ - dùng cho dòng nhiệm vụ lẫn tiêu đề nhóm. */
export function ProgressBar({
  percent,
  className,
}: {
  percent: number;
  className?: string;
}) {
  return (
    <div
      className={cn("h-1.5 overflow-hidden rounded-full bg-muted", className)}
    >
      {/*
        Chỉ đổi màu khi đã đủ 100%. Tô đỏ mấy mốc thấp là báo động giả: việc mới
        nhận sáng nay đương nhiên còn 25%, trễ hay không đã có cột hạn nói.
      */}
      <div
        className={cn(
          "h-full rounded-full transition-all",
          percent >= 100 ? "bg-emerald-500" : "bg-primary",
        )}
        style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
      />
    </div>
  );
}

/**
 * Ô phần trăm: thanh chạy + con số, đủ 100% thì xanh và đổi sang dấu tích.
 * Tiến độ và chất lượng dùng chung một kiểu để đặt cạnh nhau còn so được.
 */
export function PercentCell({
  percent,
  change,
  hint,
  notTracked = false,
}: {
  percent: number | null;
  /** Số cán bộ tự chấm, chỉ truyền khi chỉ huy đã chấm khác đi. */
  change?: { from: number; to: number };
  /** Dòng phụ dưới thanh, ví dụ "Cập nhật 3 ngày trước". */
  hint?: string;
  /**
   * Mẫu nhiệm vụ của trục không có cột này. Khác hẳn "có cột mà chưa nhập": một bên
   * là trục chấm kiểu khác, một bên là cán bộ còn nợ số liệu.
   */
  notTracked?: boolean;
}) {
  if (notTracked) {
    return (
      <span
        className="text-xs text-muted-foreground"
        title="Mẫu nhiệm vụ của trục này không có cột đó nên không chấm theo phần trăm"
      >
        Không theo dõi %
      </span>
    );
  }
  if (percent === null) {
    return <span className="text-sm text-muted-foreground">-</span>;
  }

  const full = percent >= 100;
  return (
    <div>
      <div className="flex items-center gap-2">
        <ProgressBar percent={percent} className="flex-1" />
        {full ? (
          <Check className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
        ) : (
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {percent}%
          </span>
        )}
      </div>
      {/* Chỉ huy chấm khác thì nói rõ số cũ, không thì người khai tưởng mình
          nhập sai. */}
      {change ? (
        <p
          className={cn(
            "mt-0.5 text-xs tabular-nums",
            change.to < change.from
              ? missionTone.danger.text
              : missionTone.success.text,
          )}
        >
          {change.to < change.from ? "▼" : "▲"} Tự chấm {change.from}%
        </p>
      ) : null}
      {hint ? (
        <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

/** Trạng thái công việc suy từ tiến độ: chưa bắt đầu / đang chạy / xong. */
export function WorkStateBadge({ work }: { work: WorkState }) {
  return (
    <Badge
      variant="secondary"
      className={cn("font-normal", WORK_STATE_PILL[work])}
    >
      {WORK_STATE_LABEL[work]}
    </Badge>
  );
}
