import { ArrowDown, ArrowUp, Minus, type LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type StatTileTone =
  "neutral" | "info" | "warning" | "danger" | "success";

/**
 * Màu ở đây luôn đi kèm nhãn chữ và biểu tượng, không bao giờ là kênh thông tin
 * duy nhất - trùng bộ tông đang dùng cho pill trạng thái ở các màn khác.
 */
const toneClass: Record<StatTileTone, string> = {
  neutral: "bg-muted text-muted-foreground",
  info: "bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-400",
  warning:
    "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400",
  danger: "bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400",
  success:
    "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400",
};

/**
 * Chênh lệch so với kỳ trước.
 *
 * `higherIsBetter = false` cho các chỉ số mà tăng là xấu (việc bị trả lại):
 * mũi tên vẫn chỉ đúng hướng thật của số, chỉ màu là đảo - và luôn có chữ
 * "so với kỳ trước" đi kèm nên màu không phải kênh thông tin duy nhất.
 */
function DeltaLine({
  current,
  previous,
  higherIsBetter = true,
}: {
  current: number;
  previous: number;
  higherIsBetter?: boolean;
}) {
  // Kỳ trước bằng 0 thì không có phần trăm nào để nói, đừng hiện "+∞%".
  if (!previous) {
    return (
      <div className="text-xs text-muted-foreground">
        {current ? "Kỳ trước chưa có số liệu" : "Chưa có số liệu"}
      </div>
    );
  }

  const diff = current - previous;
  const percent = Math.abs(Math.round((diff / previous) * 100));
  const flat = diff === 0;
  const good = higherIsBetter ? diff > 0 : diff < 0;
  const Icon = flat ? Minus : diff > 0 ? ArrowUp : ArrowDown;

  return (
    <div
      className={cn(
        "flex items-center gap-1 text-xs",
        flat
          ? "text-muted-foreground"
          : good
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-rose-600 dark:text-rose-400",
      )}
    >
      <Icon className="size-3.5" />
      {flat ? "Không đổi" : `${percent}%`} so với kỳ trước
    </div>
  );
}

export function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  tone = "neutral",
  current,
  previous,
  higherIsBetter,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: LucideIcon;
  tone?: StatTileTone;
  /** Truyền cặp này để hiện dòng so sánh với kỳ trước. */
  current?: number;
  previous?: number;
  higherIsBetter?: boolean;
}) {
  return (
    <Card>
      {/* Căn giữa theo trục dọc: khối chữ cao thấp khác nhau tuỳ ô có dòng so
          sánh hay không, neo biểu tượng lên đỉnh thì hàng thẻ nhìn so le. */}
      <CardContent className="flex items-center gap-3 py-4">
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-lg",
            toneClass[tone],
          )}
        >
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 space-y-1">
          <div className="text-xs font-medium text-muted-foreground">
            {label}
          </div>
          {/* Số lớn để chữ số tỉ lệ tự nhiên, không ép bề rộng đều nhau. */}
          <div className="text-2xl font-semibold leading-none">{value}</div>
          {current !== undefined && previous !== undefined ? (
            <DeltaLine
              current={current}
              previous={previous}
              higherIsBetter={higherIsBetter}
            />
          ) : null}
          {hint ? (
            <div className="text-xs text-muted-foreground">{hint}</div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
