"use client";

import { useMemo, useState } from "react";
import {
  Check,
  CircleCheck,
  CircleDashed,
  Clock3,
  Eye,
  Flag,
  Send,
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
import { entityId } from "@/features/kpi-form-config/types";
import { useQualityLevelMap } from "@/features/kpi-form-config/use-quality-levels";
import { updatePersonalKpiProgress } from "@/features/personal-kpi/api";
import { AttachmentCell } from "@/features/personal-kpi/components/attachment-cell";
import { kpiTone } from "@/features/personal-kpi/status-styles";
import {
  WORK_STATE_LABEL,
  deadlineState,
  summarizeTask,
  trackingColumns,
  workState,
  type TrackingColumns,
} from "@/features/personal-kpi/task-summary";
import {
  canSendPersonalKpi,
  canUpdateProgress,
  type PersonalKpiItem,
  type PersonalKpiProgressChange,
  type PersonalKpiProgressLog,
  type TaskAttachment,
} from "@/features/personal-kpi/types";
import { getApiErrorMessage } from "@/lib/api-client";
import { formatServerHm, formatYmd, serverYmd } from "@/lib/server-time";
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
  if (percent >= 100) return { style: { right: 0 }, className: "translate-x-0" };
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
  disabled,
  onChange,
}: MilestoneSliderProps) {
  const percentNow = percentOfValue(value, milestones, snap);
  const percentBefore = percentOfValue(initialValue, milestones, snap);

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
          <span className="text-muted-foreground">{percentBefore}%</span>
          <span className="mx-1 text-muted-foreground">→</span>
          <span className={cn("font-semibold", kpiTone.info.text)}>
            {percentNow}%
          </span>
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
    default:
      return "Cập nhật tiến độ";
  }
}

/**
 * Lịch sử gửi duyệt: chỉ những mốc đi qua tay cấp trên.
 * Đọc từ cùng một nhật ký với phần cập nhật hằng ngày nên thứ tự luôn khớp.
 */
function ReviewHistory({ logs }: { logs: PersonalKpiProgressLog[] }) {
  const events = logs.filter((log) => log.type !== "PROGRESS");
  const sentCount = events.filter((log) => log.type === "SUBMIT").length;
  const returnCount = events.filter((log) => log.type === "RETURN").length;

  return (
    <div className="space-y-2">
      <SectionTitle
        icon={Send}
        text="Lịch sử gửi duyệt"
        right={
          events.length > 0 ? (
            <span className="flex gap-1">
              <Badge variant="secondary" className="font-normal">
                {sentCount} lần gửi
              </Badge>
              {returnCount > 0 ? (
                <Badge
                  variant="secondary"
                  className={cn("font-normal", kpiTone.danger.soft)}
                >
                  {returnCount} lần trả lại
                </Badge>
              ) : null}
            </span>
          ) : null
        }
      />

      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nhiệm vụ chưa gửi lên cấp trên lần nào.
        </p>
      ) : (
        <ol className="max-h-44 space-y-2 overflow-y-auto pr-1">
          {events.map((log) => (
            <li
              key={log.at}
              className={cn(
                "rounded-md border p-2.5",
                log.type === "RETURN"
                  ? "border-rose-200 bg-rose-500/5 dark:border-rose-900"
                  : log.type === "COMPLETE"
                    ? "border-emerald-200 bg-emerald-500/5 dark:border-emerald-900"
                    : "bg-muted/30",
              )}
            >
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge
                  variant="secondary"
                  className={cn(
                    "font-normal",
                    log.type === "RETURN"
                      ? kpiTone.danger.soft
                      : log.type === "COMPLETE"
                        ? kpiTone.success.soft
                        : kpiTone.info.soft,
                  )}
                >
                  {logTitle(log)}
                </Badge>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {log.onDate ? formatYmd(log.onDate) : serverYmd(log.at)}{" "}
                  {formatServerHm(log.at)}
                </span>
              </div>
              <p className="mt-1 text-xs">
                {log.byName}
                {log.toName ? ` → ${log.toName}` : ""}
              </p>
              {log.note ? (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {log.type === "RETURN" ? "Lý do: " : "Ghi chú: "}
                  {log.note}
                </p>
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
  }[change.field];

  const show = (raw: string) => {
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
      {change.detail ? (
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
  /** Việc đã chốt hoàn thành - chỉ xem lại, không sửa. */
  readOnly: boolean;
  onDone: () => void;
  onSaved: () => void | Promise<void>;
  onRequestConfirm?: (item: PersonalKpiItem) => void;
};

function ProgressForm({
  item,
  columns,
  milestones,
  snapToMilestones,
  qualityMilestones,
  snapQuality,
  readOnly,
  onDone,
  onSaved,
  onRequestConfirm,
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
  const [saving, setSaving] = useState(false);

  const logs = item.progressLogs ?? [];
  const logDays = new Set(
    logs
      .filter((log) => log.type === "PROGRESS")
      .map((log) => log.onDate || serverYmd(log.at)),
  );
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
  const dirty =
    progress !== initialProgress ||
    quality !== initialQuality ||
    product !== initialProduct ||
    note.trim() !== "" ||
    evidenceChanged;

  const done = percentNow >= 100;
  const hasProduct = !columns.productColumn || product.trim().length > 0;
  /**
   * Tệp minh chứng KHÔNG phải điều kiện chốt - nhiều việc chẳng đẻ ra tệp nào,
   * bắt buộc thì người ta đính bừa một file cho qua.
   */
  const readyToFinish = done && hasProduct;
  const sendable = canSendPersonalKpi(item.status);
  const isReturned = item.status === "RETURNED";

  const save = async () => {
    if (!columns.progressColumn) return;
    setSaving(true);
    try {
      await updatePersonalKpiProgress(item.id, {
        progress,
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

  if (!columns.progressColumn) {
    return (
      <>
        <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-500" />
          <p className="text-muted-foreground">
            Mẫu KPI của trục này chưa có cột tiến độ (ô phần trăm thuộc nhóm
            &quot;KPI tiến độ&quot;) nên chưa cập nhật tiến độ được. Sửa mẫu tại
            Cấu hình form KPI › Mẫu bảng KPI, hoặc dùng &quot;Sửa chi tiết&quot;
            để nhập tay.
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
      <div className="grid max-h-[66vh] gap-6 overflow-y-auto px-1 py-1 md:grid-cols-2">
        {/* ------------------------------------------------ cột trái: nhập */}
        <div className="space-y-4">
          <SectionTitle
            icon={readOnly ? Eye : SquarePen}
            text={readOnly ? "Kết quả đã chốt" : "Cập nhật tiến độ"}
          />

          {/* Bị trả lại là việc cần xử lý ngay - đặt lý do lên đầu cột nhập,
              kèm số lần bị trả để biết đây là lần thứ mấy. */}
          {item.status === "RETURNED" ? (
            <div className="space-y-1 rounded-lg border border-rose-200 bg-rose-500/5 p-3 dark:border-rose-900">
              <p
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
              </p>
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
              Chế độ chỉ xem - số liệu do cán bộ tự khai. Bên phải là toàn bộ
              mốc và nhật ký tiến độ để tra lại.
            </p>
          ) : null}

          <MilestoneSlider
            label="Tiến độ nhiệm vụ (KPI)"
            columnTitle={columns.progressColumn.title}
            milestones={milestones}
            snap={snapToMilestones}
            value={progress}
            initialValue={initialProgress}
            disabled={saving || readOnly}
            onChange={setProgress}
          />

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
                {decreased ? <span className="text-destructive"> *</span> : null}
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
            <CheckLine ok={done} label="Tiến độ đạt 100%" />
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
          <MilestoneTrack
            milestones={milestones}
            percentNow={percentNow}
            logs={logs}
          />

          <ReviewHistory logs={logs} />

          <div className="space-y-3">
            <SectionTitle
              icon={Clock3}
              text="Nhật ký theo ngày"
              right={
                logDays.size > 0 ? (
                  <Badge variant="secondary" className="font-normal">
                    {logDays.size} ngày
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
                    Chấm và đường nối nằm TRONG ô của mục (pl-5), không thò ra
                    ngoài bằng lề âm - thò ra là bị vùng cuộn cắt mất một nửa.
                  */
                  <li key={log.at} className="relative pl-5">
                    <span className="absolute left-0 top-1 size-2.5 rounded-full border-2 border-primary bg-background" />
                    {index < logs.length - 1 ? (
                      <span className="absolute bottom-[-14px] left-[4.5px] top-4 w-px bg-border" />
                    ) : null}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium tabular-nums">
                        {log.onDate ? formatYmd(log.onDate) : serverYmd(log.at)}
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {formatServerHm(log.at)}
                      </span>
                      {log.percent === null ? null : (
                        <Badge
                          variant="secondary"
                          className={cn("font-normal", kpiTone.info.soft)}
                        >
                          {log.percent}%
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      <span
                        className={cn(
                          log.type === "RETURN" && kpiTone.danger.text,
                          log.type === "COMPLETE" && kpiTone.success.text,
                        )}
                      >
                        {logTitle(log)}
                      </span>
                      {log.byName ? ` · ${log.byName}` : ""}
                      {log.toName ? ` → ${log.toName}` : ""}
                    </p>
                    {log.changes.length > 0 ? (
                      <div className="mt-1 space-y-0.5 border-l pl-2">
                        {log.changes.map((change) => (
                          <ChangeLine
                            key={change.field}
                            change={change}
                            columns={columns}
                          />
                        ))}
                      </div>
                    ) : null}
                    {/* Lần lùi tiến độ thì ghi chú chính là lý do bắt buộc -
                        gọi đúng tên nó, đừng để lẫn với ghi chú thường. */}
                    {log.note ? (
                      <p
                        className={cn(
                          "mt-1 text-xs",
                          log.type === "RETURN"
                            ? kpiTone.danger.text
                            : isRollback(log)
                              ? kpiTone.warning.text
                              : "text-muted-foreground",
                        )}
                      >
                        <span className="font-medium">
                          {log.type === "RETURN"
                            ? "Lý do trả lại:"
                            : isRollback(log)
                              ? "Lý do lùi tiến độ:"
                              : "Ghi chú:"}
                        </span>{" "}
                        {log.note}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </div>
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
                ? "Đã báo đủ 100% - đang chờ chỉ huy xác nhận hoàn thành."
                : "Nhiệm vụ đang ở chỗ chỉ huy; báo đủ 100% là vào mục chờ xác nhận."}
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
  /** Nhiệm vụ đang cập nhật; null = hộp thoại đóng. */
  item: PersonalKpiItem | null;
  /** Mẫu bảng của trục chứa nhiệm vụ - quyết định ô nào sửa được ở đây. */
  template: ResolvedTemplate | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void | Promise<void>;
  /** Bấm "Xin xác nhận hoàn thành" - mở luồng gửi lên cấp trên. */
  onRequestConfirm?: (item: PersonalKpiItem) => void;
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
  item,
  template,
  onOpenChange,
  onSaved,
  onRequestConfirm,
  readOnly: forceReadOnly = false,
}: ProgressUpdateDialogProps) {
  const columns = trackingColumns(template, item?.task);
  const progressColumn = columns.progressColumn;
  const isCatalogProgress = progressColumn?.semanticKey === "quality_level";
  const isCatalogQuality =
    columns.qualityColumn?.semanticKey === "quality_level";
  const qualityLevelById = useQualityLevelMap();

  // Mốc lấy đúng danh mục "Chất lượng thực hiện" đã cấu hình.
  const { data: levels = [] } = useSWR(
    item && (isCatalogProgress || isCatalogQuality)
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

  const summary = item
    ? summarizeTask(item.task, template, qualityLevelById)
    : null;
  const work = summary ? workState(summary.progressPercent) : null;
  const deadline = summary
    ? deadlineState(summary.deadline, serverYmd())
    : null;
  /** Đã chốt hoàn thành, hoặc người xem không phải chủ nhiệm vụ. */
  const readOnly =
    forceReadOnly || (!!item && !canUpdateProgress(item.status));

  return (
    <Dialog open={!!item} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="pr-6">
            {readOnly ? "Tiến độ" : "Cập nhật"}: {item?.workContentName}
          </DialogTitle>
          <DialogDescription asChild>
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              {item ? (
                <>
                  <Badge
                    variant="secondary"
                    className={cn("font-normal", kpiTone.info.soft)}
                  >
                    {item.axisName}
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
                </>
              ) : null}
            </div>
          </DialogDescription>
        </DialogHeader>

        {item && milestones.length > 0 ? (
          <ProgressForm
            key={item.id}
            item={item}
            columns={columns}
            milestones={milestones}
            snapToMilestones={isCatalogProgress}
            qualityMilestones={qualityMilestones}
            snapQuality={isCatalogQuality}
            readOnly={readOnly}
            onDone={() => onOpenChange(false)}
            onSaved={onSaved}
            onRequestConfirm={onRequestConfirm}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
