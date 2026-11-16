"use client";

import {
  CalendarClock,
  CircleCheck,
  FileInput,
  Info,
  MessageSquareText,
  Undo2,
  type LucideIcon,
} from "lucide-react";

import {
  notificationTime,
  type AppNotification,
  type NotificationKind,
} from "@/features/notifications/api";
import { cn } from "@/lib/utils";

/* Màu đi kèm biểu tượng và chữ, không là kênh thông tin duy nhất - cùng bộ tông
   với thẻ số liệu (StatTile). */
const KIND: Record<NotificationKind, { icon: LucideIcon; tone: string }> = {
  RETURNED: {
    icon: Undo2,
    tone: "bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400",
  },
  INCOMING: {
    icon: FileInput,
    tone: "bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-400",
  },
  INFORM: {
    icon: Info,
    tone: "bg-slate-100 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300",
  },
  DEADLINE: {
    icon: CalendarClock,
    tone: "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400",
  },
  APPROVED: {
    icon: CircleCheck,
    tone: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400",
  },
  COMMENT: {
    icon: MessageSquareText,
    tone: "bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400",
  },
};

/**
 * Một dòng thông báo - dùng chung cho khung xổ xuống trên chuông và trang
 * "Tất cả thông báo", để hai nơi đọc ra giống hệt nhau.
 *
 * Chưa đọc: chữ đậm, nền nhạt, chấm xanh bên phải. Không dùng vạch màu ở cạnh.
 */
/**
 * Nội dung thông báo. Server tách ý bằng "\n" (VD "Lý do: …" / "Người trả: …")
 * - mỗi ý một dòng. Ở khung chuông (`full = false`) mỗi dòng cắt "…" khi quá
 * dài, để lý do dài không đẩy mất dòng người trả; ở trang đầy đủ thì hiện hết.
 */
function NotificationBody({ body, full }: { body: string; full: boolean }) {
  const lines = body.split("\n").filter((line) => line.trim());
  if (full) {
    return (
      <span className="block whitespace-pre-line break-words text-xs text-muted-foreground">
        {lines.join("\n")}
      </span>
    );
  }
  if (lines.length === 1) {
    return (
      <span className="line-clamp-2 block text-xs text-muted-foreground">
        {lines[0]}
      </span>
    );
  }
  return (
    <>
      {lines.map((line, index) => (
        <span
          key={index}
          className="block truncate text-xs text-muted-foreground"
          title={line}
        >
          {line}
        </span>
      ))}
    </>
  );
}

export function NotificationRow({
  item,
  onOpen,
  className,
  full = false,
}: {
  item: AppNotification;
  onOpen: (item: AppNotification) => void;
  className?: string;
  /** Hiện đủ nội dung, không cắt - dùng ở trang "Tất cả thông báo". */
  full?: boolean;
}) {
  const { icon: Icon, tone } = KIND[item.kind] ?? KIND.INFORM;
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className={cn(
        "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none",
        !item.read && "bg-primary/[0.04]",
        className,
      )}
    >
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full",
          tone,
        )}
      >
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1 space-y-0.5">
        <span
          className={cn(
            "block text-sm leading-snug",
            item.read ? "text-foreground/80" : "font-semibold",
          )}
        >
          {item.title}
        </span>
        {item.body ? (
          <NotificationBody body={item.body} full={full} />
        ) : null}
        <span className="block text-[11px] text-muted-foreground/80 tabular-nums">
          {notificationTime(item.createdAt)}
        </span>
      </span>
      {!item.read ? (
        <span
          className="size-2 shrink-0 rounded-full bg-primary"
          aria-label="Chưa đọc"
        />
      ) : null}
    </button>
  );
}
