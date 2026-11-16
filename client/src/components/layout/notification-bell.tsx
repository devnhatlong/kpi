"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, BellOff, CheckCheck } from "lucide-react";
import useSWR, { useSWRConfig } from "swr";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DROPDOWN_LIMIT,
  fetchNotifications,
  isToday,
  markAllNotificationsRead,
  markNotificationRead,
  notificationKeys,
  type AppNotification,
} from "@/features/notifications/api";
import { NotificationRow } from "@/features/notifications/components/notification-row";
import { useServerTime } from "@/hooks/use-server-time";
import { getApiErrorMessage } from "@/lib/api-client";

/** Hỏi lại server mỗi phút - mạng nội bộ, không có kênh đẩy (websocket). */
const POLL_MS = 60_000;

/**
 * Chuông thông báo trên thanh đầu trang: số chưa đọc + khung xổ xuống với
 * {@link DROPDOWN_LIMIT} thông báo mới nhất. Không phân trang ở đây - muốn
 * xem cũ hơn thì "Xem tất cả thông báo" sang trang /notifications.
 */
export function NotificationBell() {
  const router = useRouter();
  const { mutate: mutateAll } = useSWRConfig();
  const { ready } = useServerTime();
  const [open, setOpen] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);

  const { data, isLoading, mutate } = useSWR(
    notificationKeys.list(1, DROPDOWN_LIMIT, unreadOnly),
    () => fetchNotifications({ limit: DROPDOWN_LIMIT, unread: unreadOnly }),
    {
      refreshInterval: POLL_MS,
      // Mở khung là hỏi lại ngay - số trên chuông có thể đã cũ một phút.
      revalidateOnFocus: true,
      keepPreviousData: true,
    },
  );

  const unread = data?.meta.unreadCount ?? 0;
  const items = data?.items ?? [];
  const groups = ready
    ? [
        { label: "Hôm nay", rows: items.filter((i) => isToday(i.createdAt)) },
        { label: "Trước đó", rows: items.filter((i) => !isToday(i.createdAt)) },
      ].filter((g) => g.rows.length)
    : [];

  /** Mọi danh sách thông báo (chuông + trang) đều cũ đi sau khi đọc. */
  const refreshAll = () =>
    mutateAll(
      (key) => Array.isArray(key) && key[0] === "notifications",
    );

  const markAllRead = async () => {
    try {
      await markAllNotificationsRead();
      await refreshAll();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không đánh dấu được."));
    }
  };

  const openItem = (item: AppNotification) => {
    setOpen(false);
    if (!item.read) {
      // Đổi ngay trên màn rồi mới báo server - bấm vào là hết chấm xanh.
      void mutate(
        (prev) =>
          prev && {
            ...prev,
            items: prev.items.map((i) =>
              i.id === item.id ? { ...i, read: true } : i,
            ),
            meta: {
              ...prev.meta,
              unreadCount: Math.max(0, prev.meta.unreadCount - 1),
            },
          },
        { revalidate: false },
      );
      void markNotificationRead(item.id).then(refreshAll);
    }
    if (item.href) router.push(item.href);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) void mutate();
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative rounded-full text-muted-foreground"
          aria-label={unread ? `Thông báo, ${unread} chưa đọc` : "Thông báo"}
        >
          <Bell className="size-5" />
          {unread ? (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-destructive-foreground ring-2 ring-card">
              {unread > 99 ? "99+" : unread}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" sideOffset={8} className="w-[400px] p-0">
        <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <div>
            <div className="text-sm font-semibold">Thông báo</div>
            <div className="text-xs text-muted-foreground">
              {unread ? `${unread} chưa đọc` : "Đã đọc hết"}
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            disabled={!unread}
            onClick={() => void markAllRead()}
          >
            <CheckCheck className="size-4" />
            Đánh dấu đã đọc hết
          </Button>
        </div>

        <div className="flex gap-1 border-b px-3 py-2">
          {(
            [
              [false, "Tất cả"],
              [true, `Chưa đọc${unread ? ` (${unread})` : ""}`],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={String(value)}
              type="button"
              size="sm"
              variant={unreadOnly === value ? "secondary" : "ghost"}
              className="h-7 px-2.5 text-xs"
              aria-pressed={unreadOnly === value}
              onClick={() => setUnreadOnly(value)}
            >
              {label}
            </Button>
          ))}
        </div>

        {isLoading && !data ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
            <BellOff className="size-8 text-muted-foreground/60" />
            <p className="text-sm font-medium">
              {unreadOnly ? "Không có thông báo chưa đọc" : "Chưa có thông báo"}
            </p>
            <p className="text-xs text-muted-foreground">
              Báo cáo bị trả lại, chờ duyệt hay sắp đến hạn sẽ hiện ở đây.
            </p>
          </div>
        ) : (
          <div className="max-h-[420px] overflow-y-auto overscroll-contain">
            {groups.map(({ label, rows }) => (
              <div key={label}>
                <div className="bg-muted/40 px-4 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {label}
                </div>
                <ul className="divide-y">
                  {rows.map((item) => (
                    <li key={item.id}>
                      <NotificationRow item={item} onOpen={openItem} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        <div className="border-t p-2">
          <Button
            type="button"
            variant="ghost"
            className="h-8 w-full text-xs"
            onClick={() => {
              setOpen(false);
              router.push("/notifications");
            }}
          >
            Xem tất cả thông báo
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
