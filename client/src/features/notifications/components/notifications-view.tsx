"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BellOff, CheckCheck } from "lucide-react";
import useSWR, { useSWRConfig } from "swr";
import { toast } from "sonner";

import { TablePagination } from "@/components/common/table-pagination";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  notificationKeys,
  type AppNotification,
} from "@/features/notifications/api";
import { NotificationRow } from "@/features/notifications/components/notification-row";
import { getApiErrorMessage } from "@/lib/api-client";
import { cn } from "@/lib/utils";

/**
 * Trang "Tất cả thông báo" - chỉ vào được từ nút cuối khung chuông, không nằm
 * trên menu. Phân trang ở server.
 */
export function NotificationsView() {
  const router = useRouter();
  const { mutate: mutateAll } = useSWRConfig();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  const { data, error, isLoading, isValidating } = useSWR(
    notificationKeys.list(page, limit, unreadOnly),
    () => fetchNotifications({ page, limit, unread: unreadOnly }),
    { keepPreviousData: true },
  );
  const unread = data?.meta.unreadCount ?? 0;

  const refreshAll = () =>
    mutateAll((key) => Array.isArray(key) && key[0] === "notifications");

  const markAllRead = async () => {
    try {
      await markAllNotificationsRead();
      await refreshAll();
      toast.success("Đã đánh dấu đã đọc hết.");
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Không đánh dấu được."));
    }
  };

  const openItem = async (item: AppNotification) => {
    if (!item.read) {
      await markNotificationRead(item.id);
      void refreshAll();
    }
    if (item.href) router.push(item.href);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            Thông báo
          </h1>
          <p className="text-sm text-muted-foreground">
            {unread ? `${unread} chưa đọc` : "Đã đọc hết"} · thông báo tự xoá
            sau 180 ngày.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="bg-background"
          disabled={!unread}
          onClick={() => void markAllRead()}
        >
          <CheckCheck className="size-4" />
          Đánh dấu đã đọc hết
        </Button>
      </div>

      <Card className="overflow-hidden py-0">
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
              className="h-8 px-3"
              aria-pressed={unreadOnly === value}
              onClick={() => {
                setUnreadOnly(value);
                setPage(1);
              }}
            >
              {label}
            </Button>
          ))}
        </div>

        <CardContent
          className={cn("p-0", isValidating && "opacity-60 transition-opacity")}
        >
          {error ? (
            <p className="py-10 text-center text-sm text-destructive">
              {getApiErrorMessage(error, "Không tải được thông báo.")}
            </p>
          ) : isLoading && !data ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14" />
              ))}
            </div>
          ) : !data?.items.length ? (
            <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
              <BellOff className="size-9 text-muted-foreground/60" />
              <p className="text-sm font-medium">
                {unreadOnly
                  ? "Không có thông báo chưa đọc"
                  : "Chưa có thông báo"}
              </p>
            </div>
          ) : (
            <ul className="divide-y">
              {data.items.map((item) => (
                <li key={item.id}>
                  <NotificationRow
                    item={item}
                    full
                    onOpen={(i) => void openItem(i)}
                  />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {data?.meta.total ? (
        <TablePagination
          page={data.meta.page}
          limit={data.meta.limit}
          total={data.meta.total}
          totalPages={data.meta.totalPages}
          onPageChange={setPage}
          onLimitChange={(next) => {
            setLimit(next);
            setPage(1);
          }}
          disabled={isValidating}
        />
      ) : null}
    </div>
  );
}
