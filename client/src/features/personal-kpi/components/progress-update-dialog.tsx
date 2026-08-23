"use client";

import { useMemo, useState } from "react";
import {
  Check,
  CircleCheck,
  CircleDashed,
  Clock3,
  Eye,
  Flag,
  PencilLine,
  SquarePen,
  TriangleAlert,
  Undo2,
} from "lucide-react";
import useSWR from "swr";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import {
  fetchQualityLevelsAll,
  qualityLevelKeys,
} from "@/features/kpi-form-config/api";
import type { ResolvedTemplate } from "@/features/kpi-form-config/form-template-utils";
import type { ScoreGroup } from "@/features/kpi-form-config/types";
import { entityId } from "@/features/kpi-form-config/types";
import { useQualityLevelMap } from "@/features/kpi-form-config/use-quality-levels";
import { useScoreGroupMap } from "@/features/kpi-form-config/use-score-groups";
import { updatePersonalKpiProgress } from "@/features/personal-kpi/api";
import { AttachmentCell } from "@/features/personal-kpi/components/attachment-cell";
import { ResultFields } from "@/features/personal-kpi/components/result-fields";
import { ReviewScoreSummary } from "@/features/personal-kpi/components/review-score-summary";
import {
  useReviewScores,
  type ReviewScoreReport,
} from "@/features/personal-kpi/review-scores";
import { kpiTone } from "@/features/personal-kpi/status-styles";
import {
  WORK_STATE_LABEL,
  deadlineState,
  resultColumns,
  summarizeTask,
  trackingColumns,
  workState,
  type ResultColumns,
  type TrackingColumns,
} from "@/features/personal-kpi/task-summary";
import {
  canCompletePersonalKpi,
  canReviewPersonalKpi,
  canSendPersonalKpi,
  canUpdateProgress,
  type PersonalKpiItem,
  type PersonalKpiProgressChange,
  type PersonalKpiProgressLog,
  type TaskAttachment,
} from "@/features/personal-kpi/types";
import { getApiErrorMessage } from "@/lib/api-client";
import { formatServerHms, formatYmd, serverYmd } from "@/lib/server-time";
import { cn } from "@/lib/utils";

/** Mốc trên thanh tiến độ - lấy từ danh mục mức chất lượng đã cấu hình. */
type Milestone = {
  /** Giá trị gửi lên server: id mức, hoặc chính con số phần trăm. */
  value: string;
  percent: number;
  label: string;
};

/** Mẫu dùng ô số thì bày sẵn các mốc quen thuộc để bấm cho nhanh. */
const NUMBER_MILESTONES = [0, 25, 50, 75, 100];

/**
 * Vị trí một mốc trên thanh.
 *
 * Mốc 0% và 100% ghim sát hai đầu thanh thay vì canh theo tâm nút kéo - canh
 * theo nút thì hai mốc đầu cuối thụt vào trong, nhìn như thanh còn thừa hai
 * đoạn cụt. Các mốc giữa chia đều theo phần trăm.
 */
function markPosition(percent: number): {
  style: React.CSSProperties;
  className: string;
} {
  if (percent <= 0) return { style: { left: 0 }, className: "translate-x-0" };
  if (percent >= 100)
    return { style: { right: 0 }, className: "translate-x-0" };
  return { style: { left: `${percent}%` }, className: "-translate-x-1/2" };
}

type MilestoneSliderProps = {
  label: string;
  /** Tên cột trong mẫu KPI - để đối chiếu ngược lại bảng nhập. */
  columnTitle: string;
  milestones: Milestone[];
  /** Cột là ô chọn mức thì chỉ đi đúng các mốc đã cấu hình. */
  snap: boolean;
  value: string;
  /** Giá trị lúc mở hộp thoại - hiện "cũ → mới". */
  initialValue: string;
  /**
   * Phần trăm chỉ huy chốt lại. Có số này thì thanh đứng ở SỐ CHỐT còn số cán
   * bộ tự chấm bị gạch ngang - đây là con số đi vào công thức tính điểm.
   */
  scoredPercent?: number | null;
  disabled: boolean;
  onChange: (value: string) => void;
};

/** Phần trăm của một giá trị: id mức thì tra danh mục, ô số thì đọc con số. */
function percentOfValue(
  value: string,
  milestones: Milestone[],
  snap: boolean,
): number {
  if (!snap) return Math.min(100, Math.max(0, Number(value) || 0));
  return milestones.find((mark) => mark.value === value)?.percent ?? 0;
}

/**
 * Thanh trượt theo mốc đã cấu hình. Tiến độ và chất lượng dùng chung một kiểu
 * để hai con số đọc như nhau, dù chúng chẳng liên quan gì nhau.
 */
function MilestoneSlider({
  label,
  columnTitle,
  milestones,
  snap,
  value,
  initialValue,
  scoredPercent,
  disabled,
  onChange,
}: MilestoneSliderProps) {
  const percentSelf = percentOfValue(value, milestones, snap);
  const percentBefore = percentOfValue(initialValue, milestones, snap);
  const scored = scoredPercent ?? null;
  /** Số đang hiện: đã chấm lại thì lấy số chỉ huy, chưa thì số cán bộ khai. */
  const percentNow = scored ?? percentSelf;
  const lowered = scored !== null && scored < percentSelf;

  const setByPercent = (percent: number) => {
    if (!snap) {
      onChange(String(percent));
      return;
    }
    // Kéo thanh thì bám mốc gần nhất, không nhận giá trị lưng chừng.
    const nearest = milestones.reduce((best, mark) =>
      Math.abs(mark.percent - percent) < Math.abs(best.percent - percent)
        ? mark
        : best,
    );
    onChange(nearest.value);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0">
          <Label>{label}</Label>
          {columnTitle && columnTitle !== label ? (
            <p className="truncate text-xs text-muted-foreground">
              Cột &quot;{columnTitle}&quot; trong mẫu KPI
            </p>
          ) : null}
        </div>
        <span className="shrink-0 text-sm tabular-nums">
          {scored === null ? (
            <>
              <span className="text-muted-foreground">{percentBefore}%</span>
              <span className="mx-1 text-muted-foreground">→</span>
              <span className={cn("font-semibold", kpiTone.info.text)}>
                {percentNow}%
              </span>
            </>
          ) : scored !== percentSelf ? (
            <>
              <span className="text-muted-foreground line-through">
                Tự chấm {percentSelf}%
              </span>
              <span className="mx-1 text-muted-foreground">→</span>
              <span
                className={cn(
                  "font-semibold",
                  lowered ? kpiTone.danger.text : kpiTone.success.text,
                )}
              >
                Chỉ huy {scored}%
              </span>
            </>
          ) : (
            <>
              <span className={cn("font-semibold", kpiTone.info.text)}>
                {scored}%
              </span>
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                chỉ huy giữ nguyên
              </span>
            </>
          )}
        </span>
      </div>

      {/*
        Khung này ôm sát thanh (không đệm trong) để lớp chấm mốc phủ đúng chiều
        cao thanh. Radix đặt nút kéo ở lớp tuyệt đối nên thanh chỉ cao bằng
        chính nó - lấy chiều cao khác là chấm rơi lệch xuống dưới.
      */}
      <div className="relative mt-2">
        <Slider
          className={cn(
            "[&>span:first-child]:h-1.5 [&>span:first-child]:bg-primary/20",
            "[&>span:first-child>span]:bg-primary",
          )}
          value={[percentNow]}
          min={0}
          max={100}
          step={snap ? 1 : 5}
          disabled={disabled}
          onValueChange={([next]) => setByPercent(next ?? 0)}
          aria-label={label}
        />
        {/* Mốc là vòng tròn rỗng nằm trên thanh. Bỏ vòng ở đúng vị trí đang
            chọn - nút kéo đã nằm sẵn ở đó, vẽ thêm thành hai vòng lồng nhau. */}
        <div className="pointer-events-none absolute inset-0">
          {milestones
            .filter((mark) => mark.percent !== percentNow)
            .map((mark) => {
              const position = markPosition(mark.percent);
              return (
                <span
                  key={mark.value}
                  className={cn(
                    "absolute top-1/2 size-2.5 -translate-y-1/2 rounded-full border-2 bg-background",
                    position.className,
                    mark.percent < percentNow
                      ? "border-primary"
                      : "border-primary/40",
                  )}
                  style={position.style}
                />
              );
            })}
          {/* Số cán bộ tự chấm vẫn để lại một dấu trên thanh - nhìn là thấy
              ngay chỉ huy kéo từ đâu về đâu. */}
          {scored !== null && scored !== percentSelf ? (
            <span
              className={cn(
                "absolute top-1/2 size-2.5 -translate-y-1/2 rounded-full border-2 bg-background",
                markPosition(percentSelf).className,
                lowered ? "border-rose-400" : "border-emerald-400",
              )}
              style={markPosition(percentSelf).style}
              title={`Cán bộ tự chấm ${percentSelf}%`}
            />
          ) : null}
        </div>
      </div>

      {/* Nhãn mốc bấm được - kéo thanh hay bấm nhãn đều ra một kết quả. */}
      <div className="relative mt-3 h-5">
        {milestones.map((mark) => {
          const position = markPosition(mark.percent);
          return (
            <button
              key={mark.value}
              type="button"
              onClick={() => onChange(mark.value)}
              disabled={disabled}
              title={mark.label}
              className={cn(
                "absolute top-0 rounded text-xs tabular-nums transition-colors",
                position.className,
                mark.percent === percentNow
                  ? cn("font-semibold", kpiTone.info.text)
                  : "text-muted-foreground hover:text-foreground",
              )}
              style={position.style}
            >
              {mark.percent}%
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SectionTitle({
  icon: Icon,
  text,
  right,
}: {
  icon: typeof Flag;
  text: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <p
        className={cn(
          "flex items-center gap-1.5 text-sm font-semibold",
          kpiTone.info.text,
        )}
      >
        <Icon className="size-4" />
        {text}
      </p>
      {right}
    </div>
  );
}

/** Nhãn của một mốc trong nhật ký. */
function logTitle(log: PersonalKpiProgressLog): string {
  switch (log.type) {
    case "SUBMIT":
      // Gửi lúc đã đủ 100% chính là xin chốt hoàn thành.
      return log.percent !== null && log.percent >= 100
        ? "Xin xác nhận hoàn thành"
        : "Gửi cấp trên";
    case "RETURN":
      return "Cấp trên trả lại";
    case "COMPLETE":
      return "Cấp trên chốt hoàn thành";
    case "EDIT":
      return "Cấp trên sửa nội dung";
    default:
      return "Cập nhật tiến độ";
  }
}

/** Gom mốc theo ngày (giờ server), ngày mới đứng trước. */
/** Ngày của một mốc, theo giờ server. */
function logYmd(log: PersonalKpiProgressLog): string {
  return log.onDate || serverYmd(log.at);
}

/** Màu chấm của một mốc: đỏ là bị trả lại, xanh lá là chốt, còn lại là tiến độ. */
function logDotClass(type: PersonalKpiProgressLog["type"]): string {
  if (type === "RETURN") return "border-rose-400";
  if (type === "COMPLETE") return "border-emerald-400";
  if (type === "EDIT") return "border-amber-400";
  if (type === "SUBMIT") return "border-primary";
  return "border-primary/50";
}

/** Màu chữ của tên mốc, cùng hệ màu với chấm bên lề. */
function logTitleClass(type: PersonalKpiProgressLog["type"]): string {
  if (type === "RETURN") return kpiTone.danger.text;
  if (type === "COMPLETE") return kpiTone.success.text;
  if (type === "EDIT") return kpiTone.warning.text;
  if (type === "SUBMIT") return kpiTone.info.text;
  return "";
}

/**
 * Ghi chú của mỗi loại mốc là một thứ khác nhau - phải gọi đúng tên.
 * Để trống nhãn thì "Kính gửi" hay "tlkc" nằm trơ ra, người đọc không biết đó
 * là lời nhắn khi gửi hay lý do bị trả lại.
 */
function noteLabel(log: PersonalKpiProgressLog): string {
  switch (log.type) {
    case "SUBMIT":
      return "Lời nhắn gửi kèm";
    case "RETURN":
      return "Lý do trả lại";
    case "COMPLETE":
      return "Nhận xét của chỉ huy";
    case "EDIT":
      return "Lý do sửa";
    default:
      return isRollback(log) ? "Lý do lùi tiến độ" : "Kết quả trong ngày";
  }
}

/**
 * Nhật ký nhiệm vụ - MỘT dòng thời gian duy nhất, mỗi lần động vào là một mốc.
 *
 * Cập nhật hằng ngày và mốc trình / trả lại / chốt hoàn thành vốn nằm chung một
 * nhật ký; tách ra hai bảng thì mốc duyệt bị in hai lần và người đọc phải tự
 * ghép hai cột mới biết hôm bị trả lại thì tiến độ đang ở đâu.
 *
 * Mỗi mốc gói trong hai dòng: "ngày · người · %" rồi tới ghi chú. Màu chấm nói
 * loại mốc, chữ chỉ nhắc lại khi là việc của cấp trên - kể lể đủ nhãn cho từng
 * mốc thì nhật ký dài gấp đôi mà không thêm thông tin nào.
 */
function TaskTimeline({
  logs,
  columns,
}: {
  logs: PersonalKpiProgressLog[];
  columns: TrackingColumns;
}) {
  const dayCount = new Set(logs.map(logYmd)).size;

  return (
    <div className="space-y-3">
      <SectionTitle
        icon={Clock3}
        text="Nhật ký theo ngày"
        right={
          dayCount > 0 ? (
            <Badge variant="secondary" className="font-normal">
              {dayCount} ngày
            </Badge>
          ) : null
        }
      />

      {logs.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Chưa có lần cập nhật nào. Lần lưu đầu tiên sẽ mở đầu nhật ký.
        </p>
      ) : (
        <ol className="space-y-3">
          {logs.map((log, index) => (
            /*
              Chấm và đường nối nằm TRONG ô của mục (pl-5), không thò ra ngoài
              bằng lề âm - thò ra là bị vùng cuộn cắt mất một nửa.
            */
            <li key={log.at} className="relative pl-5">
              <span
                className={cn(
                  "absolute left-0 top-1.5 size-2.5 rounded-full border-2 bg-background",
                  logDotClass(log.type),
                )}
              />
              {index < logs.length - 1 ? (
                <span className="absolute bottom-[-14px] left-[4.5px] top-4 w-px bg-border" />
              ) : null}

              {/* Dòng 1: xảy ra lúc nào và là mốc gì. Giờ ghi tới giây vì bấm
                  gửi rồi sửa lại ngay trong cùng một phút là chuyện thường. */}
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-sm font-medium tabular-nums">
                  {formatYmd(logYmd(log))}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {formatServerHms(log.at)}
                </span>
                <span
                  className={cn("text-sm font-medium", logTitleClass(log.type))}
                >
                  {logTitle(log)}
                </span>
                {log.percent === null ? null : (
                  <span className="text-sm font-medium tabular-nums">
                    {log.percent}%
                  </span>
                )}
              </div>

              {/* Dòng 2: ai làm, gửi cho ai. */}
              {log.byName ? (
                <p className="text-xs text-muted-foreground">
                  {log.byName}
                  {log.toName ? ` → ${log.toName}` : ""}
                </p>
              ) : null}

              {/* Lời nhắn đóng khung riêng: đó là chữ NGƯỜI TA viết, để trần
                  giữa dòng ngày giờ và tên người thì đọc lẫn vào nhau. */}
              {log.note ? (
                <div
                  className={cn(
                    "mt-1 rounded-md border px-2.5 py-1.5 text-sm",
                    log.type === "RETURN"
                      ? "border-rose-200 bg-rose-500/5 dark:border-rose-900"
                      : isRollback(log)
                        ? "border-amber-200 bg-amber-500/5 dark:border-amber-900"
                        : "bg-muted/30",
                  )}
                >
                  <span className="font-medium">{noteLabel(log)}: </span>
                  <span
                    className={cn(
                      log.type === "RETURN"
                        ? kpiTone.danger.text
                        : isRollback(log)
                          ? kpiTone.warning.text
                          : "text-muted-foreground",
                    )}
                  >
                    {log.note}
                  </span>
                </div>
              ) : null}

              {log.changes.length > 0 ? (
                <div className="mt-1 space-y-0.5 rounded-md bg-muted/50 px-2 py-1">
                  {log.changes.map((change) => (
                    <ChangeLine
                      key={`${change.field}-${change.detail}`}
                      change={change}
                      columns={columns}
                    />
                  ))}
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** Lần cập nhật này có kéo tiến độ tụt xuống không. */
function isRollback(log: PersonalKpiProgressLog): boolean {
  const change = log.changes.find((entry) => entry.field === "progress");
  if (!change || !change.from.trim() || !change.to.trim()) return false;
  return Number(change.to) < Number(change.from);
}

/**
 * Một dòng "đã đổi gì" trong nhật ký.
 * Giá trị lưu ở dạng thô nên định dạng ngay tại đây theo loại ô.
 */
function ChangeLine({
  change,
  columns,
}: {
  change: PersonalKpiProgressChange;
  columns: TrackingColumns;
}) {
  const label = {
    progress: "Tiến độ",
    quality: "Chất lượng",
    product: columns.productColumn?.title ?? "Sản phẩm",
    evidence: columns.evidenceColumn?.title ?? "Minh chứng",
    // Ô kết quả của trục chấm theo mục: tên cột do server ghi kèm ở `detail`.
    result: change.detail || "Kết quả",
    // Cấp trên sửa nội dung: tên trường (Trục, Nội dung công việc, tên cột của
    // mẫu) cũng nằm ở `detail`.
    content: change.detail || "Nội dung",
  }[change.field];

  const show = (raw: string) => {
    if (change.field === "content") return raw.trim() || "(để trống)";
    if (change.field === "result") {
      // Ô tích lưu "1"; ô điểm lưu con số.
      if (!raw.trim()) return "-";
      return raw === "1" ? "Có" : raw;
    }
    if (!raw.trim()) return "-";
    if (change.field === "progress" || change.field === "quality") {
      return `${raw}%`;
    }
    if (change.field === "evidence") return `${raw} tệp`;
    return raw;
  };

  return (
    <p className="text-xs text-muted-foreground">
      <span>{label}:</span>{" "}
      <span className="line-through">{show(change.from)}</span>
      <span className="mx-1">→</span>
      <span className="text-foreground">{show(change.to)}</span>
      {change.detail &&
      change.field !== "result" &&
      change.field !== "content" ? (
        <span className="text-muted-foreground"> (+{change.detail})</span>
      ) : null}
    </p>
  );
}

function CheckLine({ ok, label }: { ok: boolean; label: string }) {
  return (
    <p
      className={cn(
        "flex items-center gap-2 text-sm",
        ok ? kpiTone.success.text : "text-muted-foreground",
      )}
    >
      {ok ? (
        <Check className="size-4 shrink-0" />
      ) : (
        <CircleDashed className="size-4 shrink-0" />
      )}
      {label}
    </p>
  );
}

/**
 * Thẻ "Mốc tiến độ": mỗi mốc đã cấu hình là một chặng, kèm ngày lần đầu đạt tới.
 * Ngày suy từ nhật ký - mốc nào chưa ai chạm tới thì để gạch ngang.
 */
function MilestoneTrack({
  milestones,
  percentNow,
  logs,
}: {
  milestones: Milestone[];
  percentNow: number;
  logs: PersonalKpiProgressLog[];
}) {
  /** Lần cập nhật đầu tiên đạt tới từng mốc - đọc nhật ký từ cũ tới mới. */
  const reachedAt = useMemo(() => {
    const oldestFirst = [...logs].sort((a, b) => a.at.localeCompare(b.at));
    const map = new Map<number, string>();
    for (const mark of milestones) {
      const hit = oldestFirst.find(
        (log) => log.percent !== null && log.percent >= mark.percent,
      );
      if (hit) map.set(mark.percent, hit.onDate || serverYmd(hit.at));
    }
    return map;
  }, [logs, milestones]);

  return (
    <div className="rounded-xl border bg-primary/5 p-3">
      <SectionTitle icon={Flag} text="Mốc tiến độ" />
      <div className="mt-3 flex items-start">
        {milestones.map((mark, index) => {
          const reached = mark.percent <= percentNow;
          const current = mark.percent === percentNow;
          const date = reachedAt.get(mark.percent);
          return (
            <div key={mark.value} className="flex min-w-0 flex-1 flex-col">
              <div className="flex items-center">
                {/* Đoạn nối bên trái - chặng đầu không có. */}
                <span
                  className={cn(
                    "h-px flex-1",
                    index === 0
                      ? "bg-transparent"
                      : reached
                        ? "bg-primary"
                        : "bg-border",
                  )}
                />
                <span
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-medium",
                    current
                      ? "border-primary bg-primary text-primary-foreground"
                      : reached
                        ? "border-primary/40 bg-background text-primary"
                        : "border-border bg-background text-muted-foreground",
                  )}
                >
                  {reached ? <Check className="size-3" /> : index + 1}
                </span>
                <span
                  className={cn(
                    "h-px flex-1",
                    index === milestones.length - 1
                      ? "bg-transparent"
                      : mark.percent < percentNow
                        ? "bg-primary"
                        : "bg-border",
                  )}
                />
              </div>
              <span
                className={cn(
                  "mt-1 text-center text-xs tabular-nums",
                  reached ? "font-medium" : "text-muted-foreground",
                )}
              >
                {mark.percent}%
              </span>
              <span className="text-center text-[10px] leading-tight text-muted-foreground">
                {date ? formatYmd(date) : "-"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

type ProgressFormProps = {
  item: PersonalKpiItem;
  columns: TrackingColumns;
  /** Mốc của cột tiến độ (nhóm B). */
  milestones: Milestone[];
  /** Cột tiến độ là ô chọn mức - lúc đó chỉ đi đúng các mốc đã cấu hình. */
  snapToMilestones: boolean;
  /** Mốc của cột chất lượng (nhóm C) - có thể khác nguồn với tiến độ. */
  qualityMilestones: Milestone[];
  snapQuality: boolean;
  /**
   * Cột kết quả của trục chấm theo mục (Đạt / Không đạt).
   * Trục kiểu này không có thanh tiến độ - cập nhật chính là khai điểm.
   */
  results: ResultColumns;
  /** Nhóm điểm của nhiệm vụ - nguồn "Khung chuẩn" cho ô điểm. */
  resultScoreGroup: ScoreGroup | null;
  /** Việc đã chốt hoàn thành - chỉ xem lại, không sửa. */
  readOnly: boolean;
  /**
   * Phần trăm chỉ huy chốt cho hai ô tiến độ / chất lượng.
   * Chỉ có sau khi chấm điểm; lúc đó đây mới là số thật của nhiệm vụ.
   */
  scored?: { progress: number | null; quality: number | null };
  /** Bảng đối chiếu điểm tự chấm ↔ điểm chỉ huy chốt. */
  review: ReviewScoreReport;
  onDone: () => void;
  onSaved: () => void | Promise<void>;
  onRequestConfirm?: (item: PersonalKpiItem) => void;
  /** Chỉ huy chốt hoàn thành ngay trong màn chi tiết. */
  onComplete?: (item: PersonalKpiItem) => void;
  /** Chỉ huy sửa nội dung nhiệm vụ - mở form sửa của dòng đang xem. */
  onEdit?: (item: PersonalKpiItem) => void;
  /** Chỉ huy trả lại nhiệm vụ cho cấp dưới. */
  onReturn?: (item: PersonalKpiItem) => void;
};

function ProgressForm({
  item,
  columns,
  milestones,
  snapToMilestones,
  qualityMilestones,
  snapQuality,
  results,
  resultScoreGroup,
  readOnly,
  scored,
  review,
  onDone,
  onSaved,
  onRequestConfirm,
  onComplete,
  onEdit,
  onReturn,
}: ProgressFormProps) {
  const fieldValues = item.task.fieldValues ?? {};
  const catalogValues = item.task.catalogValues ?? {};

  /** Ô chọn mức giữ id trong catalogValues, ô số giữ chuỗi trong fieldValues. */
  const readColumn = (column: TrackingColumns["progressColumn"]) => {
    if (!column) return "";
    return column.semanticKey === "quality_level"
      ? (catalogValues[column.key] ?? "")
      : (fieldValues[column.key] ?? "");
  };

  /**
   * Giá trị lúc mở hộp thoại. Component được mount lại theo từng nhiệm vụ
   * (`key` = id) nên mấy hằng này chính là mốc "chưa sửa gì".
   */
  const initialProgress = readColumn(columns.progressColumn);
  const initialQuality = readColumn(columns.qualityColumn);
  const initialProduct = columns.productColumn
    ? (fieldValues[columns.productColumn.key] ?? "")
    : "";
  const initialEvidence = columns.evidenceColumn
    ? (item.task.attachments?.[columns.evidenceColumn.key] ?? [])
    : [];

  const [progress, setProgress] = useState(initialProgress);
  const [quality, setQuality] = useState(initialQuality);
  const [product, setProduct] = useState(initialProduct);
  const [note, setNote] = useState("");
  const [evidence, setEvidence] = useState<TaskAttachment[]>(initialEvidence);
  /** Giá trị các ô kết quả (Đạt / Không đạt) lúc mở hộp thoại. */
  const resultFields = [...results.scores, ...results.flags];
  const initialResults = Object.fromEntries(
    resultFields.map((column) => [
      column.key,
      String(fieldValues[column.key] ?? "").trim(),
    ]),
  );
  const [resultValues, setResultValues] =
    useState<Record<string, string>>(initialResults);
  const [saving, setSaving] = useState(false);

  const logs = item.progressLogs ?? [];
  const returns = logs.filter((log) => log.type === "RETURN");
  const returnCount = returns.length;
  /** Mốc trả lại gần nhất - nhật ký xếp mới trước. */
  const lastReturn = returns[0];

  const percentNow = percentOfValue(progress, milestones, snapToMilestones);
  const percentBefore = percentOfValue(
    initialProgress,
    milestones,
    snapToMilestones,
  );
  /**
   * Lùi tiến độ không bị cấm nhưng phải nêu lý do - server chặn y hệt.
   * Cấm hẳn thì gõ nhầm 100% một lần là kẹt luôn, mà cấp trên lại thấy 100%
   * và chốt hoàn thành một việc chưa xong.
   */
  const decreased = percentNow < percentBefore;
  const needReason = decreased && !note.trim();

  const evidenceChanged =
    evidence.length !== initialEvidence.length ||
    evidence.some((file, index) => file.id !== initialEvidence[index]?.id);
  /**
   * Không có thay đổi mà vẫn lưu được thì mỗi lần bấm lại đẻ ra một mốc rỗng
   * trong nhật ký, và tệ hơn: nó làm mới mốc "cập nhật gần nhất" nên việc bỏ bê
   * vẫn trông như đang chạy, cảnh báo im lặng không bao giờ kêu.
   */
  const resultsChanged = resultFields.some(
    (column) =>
      (resultValues[column.key] ?? "") !== (initialResults[column.key] ?? ""),
  );
  const dirty =
    resultsChanged ||
    progress !== initialProgress ||
    quality !== initialQuality ||
    product !== initialProduct ||
    note.trim() !== "" ||
    evidenceChanged;

  /**
   * Số chốt của nhiệm vụ: chỉ huy chấm lại thì lấy số của chỉ huy.
   * Mọi chỗ nói "tiến độ bao nhiêu" đều đọc số này, đừng đọc số tự chấm.
   */
  const percentFinal = scored?.progress ?? percentNow;

  /*
    Trục chấm theo mục không có phần trăm: "xong" nghĩa là đã khai kết quả -
    có điểm ở ô Đạt hoặc đã tích ô Không đạt.
  */
  const hasResultValue = resultFields.some((column) =>
    column.dataType === "boolean"
      ? resultValues[column.key] === "1"
      : (resultValues[column.key] ?? "").trim() !== "",
  );
  const tracksProgress = !!columns.progressColumn;
  const done = tracksProgress ? percentFinal >= 100 : hasResultValue;
  const hasProduct = !columns.productColumn || product.trim().length > 0;
  /**
   * Tệp minh chứng KHÔNG phải điều kiện chốt - nhiều việc chẳng đẻ ra tệp nào,
   * bắt buộc thì người ta đính bừa một file cho qua.
   */
  const readyToFinish = done && hasProduct;
  const sendable = canSendPersonalKpi(item.status);
  const isReturned = item.status === "RETURNED";

  const save = async () => {
    setSaving(true);
    try {
      await updatePersonalKpiProgress(item.id, {
        progress: tracksProgress ? progress : undefined,
        results: resultFields.length ? resultValues : undefined,
        quality: columns.qualityColumn ? quality : undefined,
        note: columns.noteColumn ? note.trim() : undefined,
        product: columns.productColumn ? product : undefined,
        evidence: columns.evidenceColumn ? evidence : undefined,
      });
      await onSaved();
      toast.success("Đã cập nhật tiến độ.");
      // Lưu xong thì trả người dùng về danh sách nhiệm vụ.
      onDone();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không cập nhật được tiến độ."));
    } finally {
      setSaving(false);
    }
  };

  /*
    Mẫu không có cột tiến độ và cũng chẳng có ô kết quả nào - lúc đó mới thật
    sự bó tay. Trục chấm theo mục (Đạt / Không đạt) vẫn cập nhật được ở dưới.
  */
  if (!tracksProgress && resultFields.length === 0) {
    return (
      <>
        <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-500" />
          <p className="text-muted-foreground">
            Mẫu KPI của trục này chưa có cột tiến độ (ô phần trăm thuộc nhóm
            &quot;KPI tiến độ&quot;) lẫn cột điểm trong công thức, nên chưa cập
            nhật được. Sửa mẫu tại Cấu hình form KPI › Mẫu bảng KPI, hoặc dùng
            &quot;Sửa chi tiết&quot; để nhập tay.
          </p>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onDone}>
            Đóng
          </Button>
        </DialogFooter>
      </>
    );
  }

  return (
    <>
      <div className="grid max-h-[76vh] gap-6 overflow-y-auto px-1 py-1 md:grid-cols-2">
        {/* ------------------------------------------------ cột trái: nhập */}
        <div className="space-y-4">
          <SectionTitle
            icon={readOnly ? Eye : SquarePen}
            text={
              readOnly
                ? "Kết quả đã chốt"
                : tracksProgress
                  ? "Cập nhật tiến độ"
                  : "Cập nhật kết quả"
            }
          />

          {/* Bị trả lại là việc cần xử lý ngay - đặt lý do lên đầu cột nhập,
              kèm số lần bị trả để biết đây là lần thứ mấy. */}
          {item.status === "RETURNED" ? (
            <div className="space-y-1 rounded-lg border border-rose-200 bg-rose-500/5 p-3 dark:border-rose-900">
              {/* div chứ không phải p: Badge render ra div. */}
              <div
                className={cn(
                  "flex items-center gap-1.5 text-sm font-semibold",
                  kpiTone.danger.text,
                )}
              >
                <Undo2 className="size-4" />
                Nhiệm vụ bị trả lại
                {returnCount > 1 ? (
                  <Badge
                    variant="secondary"
                    className={cn("font-normal", kpiTone.danger.soft)}
                  >
                    Lần {returnCount}
                  </Badge>
                ) : null}
              </div>
              {item.rejectReason ? (
                <p className="text-sm">
                  <span className="font-medium">Lý do trả lại: </span>
                  {item.rejectReason}
                </p>
              ) : null}
              {lastReturn ? (
                <p className="text-xs text-muted-foreground">
                  {lastReturn.byName} ·{" "}
                  {lastReturn.onDate
                    ? formatYmd(lastReturn.onDate)
                    : serverYmd(lastReturn.at)}
                </p>
              ) : null}
            </div>
          ) : null}
          {readOnly ? (
            <p className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
              {review.hasReview
                ? "Chế độ chỉ xem - nhiệm vụ đã chấm điểm. Số đậm là số chỉ huy chốt, số gạch ngang là số cán bộ tự chấm."
                : "Chế độ chỉ xem - số liệu do cán bộ tự khai. Bên phải là toàn bộ mốc và nhật ký tiến độ để tra lại."}
            </p>
          ) : null}

          <ReviewScoreSummary report={review} />

          {/*
            Trục chấm theo mục: thay thanh tiến độ bằng chính các ô kết quả -
            khai điểm ở ô Đạt hoặc tích ô Không đạt. Đây là "tiến độ" của trục
            kiểu này, không có phần trăm nào để kéo.
          */}
          {resultFields.length > 0 ? (
            <div className="space-y-2">
              <Label>Kết quả</Label>
              <div className="rounded-lg border p-3">
                <ResultFields
                  columns={results}
                  values={resultValues}
                  initialValues={initialResults}
                  scoreGroup={resultScoreGroup}
                  disabled={saving || readOnly}
                  onChange={setResultValues}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Trục này chấm theo mục: nhập điểm đạt được, hoặc chọn
                &quot;Không đạt&quot;. Điểm phải nằm trong khung điểm chuẩn của
                nhiệm vụ.
              </p>
            </div>
          ) : null}

          {tracksProgress && columns.progressColumn ? (
            <MilestoneSlider
              label="Tiến độ nhiệm vụ (KPI)"
              columnTitle={columns.progressColumn.title}
              milestones={milestones}
              snap={snapToMilestones}
              value={progress}
              initialValue={initialProgress}
              scoredPercent={scored?.progress ?? null}
              disabled={saving || readOnly}
              onChange={setProgress}
            />
          ) : null}

          {/* Chất lượng không nói lên tiến độ, nhưng cũng là mốc cấu hình sẵn
              nên bày cùng một kiểu thanh cho dễ nhập. */}
          {columns.qualityColumn ? (
            <MilestoneSlider
              label="Chất lượng nhiệm vụ (KPI)"
              columnTitle={columns.qualityColumn.title}
              milestones={qualityMilestones}
              snap={snapQuality}
              value={quality}
              initialValue={initialQuality}
              scoredPercent={scored?.quality ?? null}
              disabled={saving || readOnly}
              onChange={setQuality}
            />
          ) : null}

          {columns.productColumn ? (
            <div className="space-y-2">
              <Label htmlFor="progress-product">
                {columns.productColumn.title}
              </Label>
              <Input
                id="progress-product"
                value={product}
                onChange={(e) => setProduct(e.target.value)}
                disabled={saving || readOnly}
                placeholder="Sản phẩm đã làm ra"
              />
            </div>
          ) : null}

          {decreased ? (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-500" />
              <p className="text-muted-foreground">
                Tiến độ lùi từ{" "}
                <span className="font-medium text-foreground">
                  {percentBefore}%
                </span>{" "}
                xuống{" "}
                <span className="font-medium text-foreground">
                  {percentNow}%
                </span>
                . Ghi rõ lý do ở ô dưới - nhật ký giữ lại để cấp trên đọc được.
              </p>
            </div>
          ) : null}

          {columns.noteColumn ? (
            <div className="space-y-2">
              <Label htmlFor="progress-note">
                Kết quả trong ngày / vướng mắc
                {decreased ? (
                  <span className="text-destructive"> *</span>
                ) : null}
              </Label>
              <Textarea
                id="progress-note"
                className={cn(
                  "min-h-[72px]",
                  needReason && "border-amber-500 focus-visible:ring-amber-500",
                )}
                placeholder={
                  decreased
                    ? "Vì sao tiến độ lùi lại..."
                    : "Hôm nay làm được gì, vướng ở đâu..."
                }
                value={note}
                onChange={(e) => setNote(e.target.value)}
                disabled={saving || readOnly}
              />
            </div>
          ) : null}

          {columns.evidenceColumn ? (
            <AttachmentCell
              files={evidence}
              onChange={setEvidence}
              readOnly={saving || readOnly}
              label={columns.evidenceColumn.title}
              dropzone
            />
          ) : null}

          {/* Điều kiện để cấp trên chốt - server kiểm điều đầu tiên. */}
          <div className="space-y-1.5 border-t pt-3">
            <CheckLine
              ok={done}
              label={
                tracksProgress
                  ? "Tiến độ đạt 100%"
                  : "Đã khai kết quả (Đạt / Không đạt)"
              }
            />
            {columns.productColumn ? (
              <CheckLine
                ok={hasProduct}
                label={`Đã khai ${columns.productColumn.title.toLowerCase()}`}
              />
            ) : null}
          </div>
        </div>

        {/* ----------------------------------------- cột phải: mốc + nhật ký */}
        <div className="space-y-4 md:border-l md:pl-6">
          {/* Trục chấm theo mục không có mốc phần trăm nào để đi qua. */}
          {tracksProgress ? (
            <MilestoneTrack
              milestones={milestones}
              percentNow={percentFinal}
              logs={logs}
            />
          ) : null}

          <TaskTimeline logs={logs} columns={columns} />
        </div>
      </div>

      <DialogFooter className="sm:items-center sm:justify-between">
        {/*
          Việc đã gửi thì không có gì để "xin" nữa: đủ 100% là nó tự nhảy vào
          mục "Chờ xác nhận" trên màn theo dõi của chỉ huy. Nói thẳng ra đây
          thay vì bày một cái nút chết.
        */}
        <p className="text-xs text-muted-foreground sm:mr-auto">
          {readOnly
            ? null
            : sendable
              ? "Đủ điều kiện thì bấm xin xác nhận để gửi lên chỉ huy."
              : done
                ? tracksProgress
                  ? "Đã báo đủ 100% - đang chờ chỉ huy xác nhận hoàn thành."
                  : "Đã khai kết quả - đang chờ chỉ huy chấm điểm."
                : tracksProgress
                  ? "Nhiệm vụ đang ở chỗ chỉ huy; báo đủ 100% là vào mục chờ xác nhận."
                  : "Nhiệm vụ đang ở chỗ chỉ huy; khai kết quả xong là vào mục chờ xác nhận."}
        </p>
        <Button
          type="button"
          variant="outline"
          className="bg-background"
          onClick={onDone}
          disabled={saving}
        >
          Đóng
        </Button>
        {/* Việc đã chốt chỉ còn để tra lại - không bày nút sửa làm gì. */}
        {readOnly ? null : (
          <Button
            type="button"
            onClick={() => void save()}
            disabled={saving || !dirty || needReason}
            title={
              needReason
                ? "Tiến độ lùi lại - phải ghi lý do trước khi lưu"
                : dirty
                  ? undefined
                  : "Chưa đổi gì để lưu"
            }
          >
            <SquarePen className="h-4 w-4" />
            {saving ? "Đang lưu..." : "Lưu cập nhật"}
          </Button>
        )}
        {/*
          Chỉ huy chốt ngay tại màn chi tiết: xem xong số liệu là bấm được,
          khỏi đóng hộp thoại rồi dò lại đúng dòng đó ngoài bảng.
        */}
        {onEdit && canReviewPersonalKpi(item.status) ? (
          <Button
            type="button"
            variant="outline"
            className="bg-background"
            onClick={() => onEdit(item)}
            title="Sửa nội dung nhiệm vụ - có ghi nhật ký"
          >
            <PencilLine className="h-4 w-4" />
            Sửa nội dung
          </Button>
        ) : null}
        {onReturn && canReviewPersonalKpi(item.status) ? (
          <Button
            type="button"
            variant="outline"
            className="border-rose-300 bg-background text-rose-600 hover:border-rose-400 hover:bg-rose-50 hover:text-rose-700 dark:border-rose-900 dark:text-rose-400"
            onClick={() => onReturn(item)}
          >
            <Undo2 className="h-4 w-4" />
            Trả lại
          </Button>
        ) : null}
        {onComplete && canCompletePersonalKpi(item.status) ? (
          <Button type="button" onClick={() => onComplete(item)}>
            <CircleCheck className="h-4 w-4" />
            Hoàn thành
          </Button>
        ) : null}

        {/* Việc bị trả lại thì gửi lại được ngay, không đòi đủ 100% - cấp trên
            trả về để sửa chứ không phải để chốt. */}
        {onRequestConfirm && !readOnly && sendable ? (
          <Button
            type="button"
            variant="secondary"
            onClick={() => onRequestConfirm(item)}
            disabled={saving || (!isReturned && !readyToFinish)}
            title={
              isReturned
                ? "Gửi lại lên cấp trên sau khi đã sửa"
                : readyToFinish
                  ? "Gửi lên cấp trên để xác nhận hoàn thành"
                  : "Chưa đủ điều kiện phía trên để xin xác nhận"
            }
          >
            {isReturned ? (
              <Undo2 className="h-4 w-4" />
            ) : (
              <CircleCheck className="h-4 w-4" />
            )}
            {isReturned ? "Gửi lại cấp trên" : "Xin xác nhận hoàn thành"}
          </Button>
        ) : null}
      </DialogFooter>
    </>
  );
}

type ProgressUpdateDialogProps = {
  /**
   * Đang mở hay không. Tách khỏi `item` để lúc đóng vẫn còn nội dung mà vẽ:
   * xoá item ngay là hộp thoại rỗng loé lên trong lúc chạy hiệu ứng đóng.
   */
  open: boolean;
  /** Nhiệm vụ đang cập nhật. */
  item: PersonalKpiItem | null;
  /** Mẫu bảng của trục chứa nhiệm vụ - quyết định ô nào sửa được ở đây. */
  template: ResolvedTemplate | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void | Promise<void>;
  /** Bấm "Xin xác nhận hoàn thành" - mở luồng gửi lên cấp trên. */
  onRequestConfirm?: (item: PersonalKpiItem) => void;
  /**
   * Chỉ huy bấm "Hoàn thành" ngay trong màn chi tiết - mở form chấm điểm.
   * Bỏ trống = người xem không có quyền chốt (màn của cán bộ).
   */
  onComplete?: (item: PersonalKpiItem) => void;
  /** Chỉ huy sửa nội dung nhiệm vụ - mở form sửa của dòng đang xem. */
  onEdit?: (item: PersonalKpiItem) => void;
  /** Chỉ huy trả lại nhiệm vụ cho cấp dưới. */
  onReturn?: (item: PersonalKpiItem) => void;
  /**
   * Ép chế độ chỉ xem. Cấp trên mở nhiệm vụ của cán bộ thì chỉ để theo dõi -
   * số liệu là do cán bộ tự khai, người duyệt không gõ hộ.
   */
  readOnly?: boolean;
};

/**
 * Cập nhật tiến độ hằng ngày cho một nhiệm vụ.
 *
 * Bên trái là mấy ô cần gõ, bên phải là bối cảnh: mốc tiến độ đã đi tới đâu và
 * nhật ký từng ngày. Chỉ động vào các ô theo dõi, mọi ô còn lại giữ nguyên.
 */
export function ProgressUpdateDialog({
  open,
  item,
  template,
  onOpenChange,
  onSaved,
  onRequestConfirm,
  onComplete,
  onEdit,
  onReturn,
  readOnly: forceReadOnly = false,
}: ProgressUpdateDialogProps) {
  const shown = item;

  const columns = trackingColumns(template, shown?.task);
  /** Ô kết quả của trục chấm theo mục - thay chỗ cho thanh tiến độ. */
  const results = resultColumns(template);
  /*
    Khung điểm chuẩn của nhiệm vụ: đọc nhóm điểm đã lưu ở ô "Điểm chuẩn".
    Server đổ nhóm này theo nhiệm vụ / nội dung công việc nên đây là con số
    thật, không phải suy đoán.
  */
  const scoreGroupById = useScoreGroupMap(results.scores.length > 0);
  const scoreGroupColumnKey = template?.columns.find(
    (column) => column.semanticKey === "score_group",
  )?.key;
  const resultScoreGroup = scoreGroupColumnKey
    ? (scoreGroupById.get(
        shown?.task.catalogValues?.[scoreGroupColumnKey] ?? "",
      ) ?? null)
    : null;
  const progressColumn = columns.progressColumn;
  const isCatalogProgress = progressColumn?.semanticKey === "quality_level";
  const isCatalogQuality =
    columns.qualityColumn?.semanticKey === "quality_level";
  const qualityLevelById = useQualityLevelMap();

  // Mốc lấy đúng danh mục "Chất lượng thực hiện" đã cấu hình.
  const { data: levels = [] } = useSWR(
    shown && (isCatalogProgress || isCatalogQuality)
      ? qualityLevelKeys.all
      : null,
    fetchQualityLevelsAll,
  );

  const numberMilestones = useMemo<Milestone[]>(
    () =>
      NUMBER_MILESTONES.map((percent) => ({
        value: String(percent),
        percent,
        label: `${percent}%`,
      })),
    [],
  );
  const catalogMilestones = useMemo<Milestone[]>(
    () =>
      [...levels]
        .map((level) => ({
          value: entityId(level),
          percent: Math.min(100, Math.max(0, level.percent)),
          label: level.name,
        }))
        .sort((a, b) => a.percent - b.percent),
    [levels],
  );

  const milestones = isCatalogProgress ? catalogMilestones : numberMilestones;
  const qualityMilestones = isCatalogQuality
    ? catalogMilestones
    : numberMilestones;

  const review = useReviewScores(shown, template);

  const summary = shown
    ? summarizeTask(shown.task, template, qualityLevelById, {
        values: shown.reviewValues,
        catalogValues: shown.reviewCatalogValues,
      })
    : null;
  /**
   * Số chốt của hai ô phần trăm - `summarizeTask` đã ghép số chỉ huy đè lên số
   * tự chấm nên đọc thẳng ở đây. Chưa chấm thì không truyền, thanh trượt giữ
   * nguyên kiểu "cũ → mới" lúc đang nhập.
   */
  const work = summary ? workState(summary.progressPercent) : null;
  const deadline = summary
    ? deadlineState(summary.deadline, serverYmd())
    : null;
  /** Đã chốt hoàn thành, hoặc người xem không phải chủ nhiệm vụ. */
  const readOnly =
    forceReadOnly || (!!shown && !canUpdateProgress(shown.status));
  /*
    Chỉ hiện số chốt ở chế độ chỉ xem: ô nhập vẫn giữ số cán bộ tự chấm, để
    thanh trượt đứng ở số khác số trong ô là kéo một cái mất luôn số của chỉ
    huy mà người kéo không hề biết.
  */
  const scored =
    review.hasReview && readOnly && summary
      ? {
          progress: summary.progressPercent,
          quality: summary.qualityPercent,
        }
      : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Rộng hơn mặc định nhiều: hai cột ở đây đều là nội dung dài (bảng đối
          chiếu điểm, nhật ký từng ngày) - hẹp là số nào cũng xuống dòng. */}
      <DialogContent className="sm:max-w-[min(94vw,84rem)]">
        <DialogHeader>
          <DialogTitle className="pr-6">
            {readOnly ? "Tiến độ" : "Cập nhật"}: {shown?.workContentName}
          </DialogTitle>
          <DialogDescription asChild>
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              {shown ? (
                <>
                  <Badge
                    variant="secondary"
                    className={cn("font-normal", kpiTone.info.soft)}
                  >
                    {shown.axisName}
                  </Badge>
                  {work ? (
                    <Badge variant="secondary" className="font-normal">
                      {WORK_STATE_LABEL[work]}
                    </Badge>
                  ) : null}
                  {deadline ? (
                    <Badge
                      variant="outline"
                      className={cn(
                        "font-normal",
                        deadline.tone === "danger"
                          ? kpiTone.danger.text
                          : deadline.tone === "warning"
                            ? kpiTone.warning.text
                            : undefined,
                      )}
                    >
                      {deadline.label}
                    </Badge>
                  ) : null}
                  {/* Chỉ huy chấm thấp hơn số cán bộ khai - nói ngay ở tiêu đề,
                      đừng bắt người xem dò từng ô mới thấy. */}
                  {review.lowered ? (
                    <Badge
                      variant="secondary"
                      className={cn("font-normal", kpiTone.danger.soft)}
                    >
                      Bị hạ điểm
                    </Badge>
                  ) : null}
                </>
              ) : null}
            </div>
          </DialogDescription>
        </DialogHeader>

        {shown && milestones.length > 0 ? (
          <ProgressForm
            key={shown.id}
            item={shown}
            columns={columns}
            milestones={milestones}
            snapToMilestones={isCatalogProgress}
            qualityMilestones={qualityMilestones}
            snapQuality={isCatalogQuality}
            results={results}
            resultScoreGroup={resultScoreGroup}
            readOnly={readOnly}
            scored={scored}
            review={review}
            onDone={() => onOpenChange(false)}
            onSaved={onSaved}
            onRequestConfirm={onRequestConfirm}
            onComplete={onComplete}
            onEdit={onEdit}
            onReturn={onReturn}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
