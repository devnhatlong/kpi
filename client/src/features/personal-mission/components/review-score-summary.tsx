"use client";

import { ClipboardCheck, TrendingDown } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { DeltaTag } from "@/features/personal-mission/components/score-delta-tag";
import type { ReviewScoreReport } from "@/features/personal-mission/review-scores";
import { missionTone } from "@/features/personal-mission/status-styles";
import { formatServerHm, serverYmd, formatYmd } from "@/lib/server-time";
import { cn } from "@/lib/utils";

/**
 * Điểm chỉ huy đã chốt, đặt cạnh số cán bộ tự chấm.
 *
 * Chỉ hiện khi nhiệm vụ đã chấm xong. Ô nào bị sửa thì gạch số cũ, ô nào chỉ
 * huy đồng ý thì ghi rõ "giữ nguyên" - im lặng ở đây dễ bị đọc thành "chưa
 * chấm", mà hai chuyện đó khác hẳn nhau.
 */
export function ReviewScoreSummary({ report }: { report: ReviewScoreReport }) {
  if (!report.hasReview || report.groups.length === 0) return null;

  const scoredAt = report.at
    ? `${formatYmd(serverYmd(report.at))} ${formatServerHm(report.at)}`
    : "";

  return (
    <div
      className={cn(
        "space-y-3 rounded-xl border p-3",
        report.lowered
          ? "border-rose-200 bg-rose-500/5 dark:border-rose-900"
          : "bg-muted/30",
      )}
    >
      {/* div chứ không phải p: Badge render ra div. */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div
            className={cn(
              "flex items-center gap-1.5 text-sm font-semibold",
              missionTone.info.text,
            )}
          >
            <ClipboardCheck className="size-4 shrink-0" />
            Điểm chỉ huy đã chốt
          </div>
          {report.byName || scoredAt ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {[report.byName, scoredAt].filter(Boolean).join(" · ")}
            </p>
          ) : null}
        </div>
        {report.lowered ? (
          <Badge
            variant="secondary"
            className={cn("shrink-0 font-normal", missionTone.danger.soft)}
          >
            <TrendingDown className="size-3.5" />
            Bị hạ điểm
          </Badge>
        ) : report.changedCount > 0 ? (
          <Badge
            variant="secondary"
            className={cn("shrink-0 font-normal", missionTone.success.soft)}
          >
            Chỉ huy chấm lại
          </Badge>
        ) : (
          <Badge variant="secondary" className="shrink-0 font-normal">
            Giữ nguyên tự chấm
          </Badge>
        )}
      </div>

      <div className="space-y-2">
        {report.groups.map((group) => (
          <div key={group.label} className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">
              {group.label}
            </p>
            <ul className="divide-y rounded-md border bg-background">
              {group.cells.map((cell) => (
                <li
                  key={cell.key}
                  className="flex items-start justify-between gap-3 px-2.5 py-1.5 text-sm"
                >
                  <span className="min-w-0 break-words text-muted-foreground">
                    {cell.title}
                  </span>
                  <span className="shrink-0 text-right tabular-nums">
                    {cell.changed ? (
                      <>
                        <span className="text-muted-foreground line-through">
                          {cell.self}
                        </span>
                        <span className="mx-1 text-muted-foreground">→</span>
                        <span
                          className={cn(
                            "font-semibold",
                            cell.gap !== null && cell.gap < 0
                              ? missionTone.danger.text
                              : missionTone.success.text,
                          )}
                        >
                          {cell.scored}
                        </span>
                        <DeltaTag gap={cell.gap} suffix={cell.suffix} />
                      </>
                    ) : (
                      <>
                        <span className="font-semibold">{cell.scored}</span>
                        <span className="ml-1 text-xs font-normal text-muted-foreground">
                          như cũ
                        </span>
                      </>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {report.note ? (
        <p className="text-xs">
          <span className="font-medium">Nhận xét của chỉ huy: </span>
          <span className="text-muted-foreground">{report.note}</span>
        </p>
      ) : null}

      {/* Một dòng lẻ không có "điểm nhiệm vụ": công thức cộng cả cột của trục
          rồi mới chia, nên đừng để người xem tự cộng B + C ở đây. */}
      <p className="text-xs text-muted-foreground">
        Số chốt ở trên là số vào công thức tính điểm trục; số cán bộ tự chấm giữ
        lại để đối chiếu.
      </p>
    </div>
  );
}
