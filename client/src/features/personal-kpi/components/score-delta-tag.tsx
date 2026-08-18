"use client";

import { formatScoreNumber } from "@/features/personal-kpi/board-cell";
import { kpiTone } from "@/features/personal-kpi/status-styles";
import { cn } from "@/lib/utils";

/** Chênh lệch so với số cán bộ tự chấm: đỏ là hạ, xanh là nâng. */
export function DeltaTag({
  gap,
  suffix,
}: {
  gap: number | null;
  suffix: string;
}) {
  if (gap === null) return null;
  return (
    <span
      className={cn(
        "ml-1 font-medium",
        gap < 0 ? kpiTone.danger.text : kpiTone.success.text,
      )}
    >
      ({gap > 0 ? "+" : ""}
      {formatScoreNumber(gap)}
      {suffix})
    </span>
  );
}
