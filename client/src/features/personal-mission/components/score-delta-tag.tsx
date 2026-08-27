"use client";

import { formatScoreNumber } from "@/features/personal-mission/board-cell";
import { missionTone } from "@/features/personal-mission/status-styles";
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
        gap < 0 ? missionTone.danger.text : missionTone.success.text,
      )}
    >
      ({gap > 0 ? "+" : ""}
      {formatScoreNumber(gap)}
      {suffix})
    </span>
  );
}
