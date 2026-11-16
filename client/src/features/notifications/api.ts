import type { ApiResponse } from "@/features/auth/types";
import { api, unwrapData } from "@/lib/api-client";
import {
  formatServerHm,
  formatYmd,
  serverDayjs,
  serverYmd,
  shiftYmd,
} from "@/lib/server-time";

export type NotificationKind =
  | "INCOMING"
  | "INFORM"
  | "RETURNED"
  | "APPROVED"
  | "COMMENT"
  | "DEADLINE";

export type AppNotification = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  href: string;
  read: boolean;
  createdAt: string;
};

export type NotificationPage = {
  items: AppNotification[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    unreadCount: number;
  };
};

/** Khung xổ xuống trên chuông: chừng này bản mới nhất, xem thêm thì sang trang. */
export const DROPDOWN_LIMIT = 20;

export const notificationKeys = {
  all: ["notifications"] as const,
  list: (page: number, limit: number, unread: boolean) =>
    ["notifications", "list", page, limit, unread] as const,
};

export async function fetchNotifications(params: {
  page?: number;
  limit?: number;
  unread?: boolean;
}): Promise<NotificationPage> {
  const { data } = await api.get<
    ApiResponse<AppNotification[]> & { meta?: NotificationPage["meta"] }
  >("/notifications", {
    params: {
      page: params.page ?? 1,
      limit: params.limit ?? DROPDOWN_LIMIT,
      ...(params.unread ? { unread: true } : {}),
    },
  });
  return {
    items: data.data ?? [],
    meta: data.meta ?? {
      total: data.data?.length ?? 0,
      page: 1,
      limit: params.limit ?? DROPDOWN_LIMIT,
      totalPages: 1,
      unreadCount: 0,
    },
  };
}

export function markNotificationRead(id: string) {
  return unwrapData(
    api.patch<ApiResponse<unknown>>(`/notifications/${id}/read`),
  ).catch(() => undefined);
}

export function markAllNotificationsRead() {
  return unwrapData(api.post<ApiResponse<unknown>>("/notifications/read-all"));
}

/**
 * Nhãn thời gian theo giờ server: "Vừa xong", "12 phút trước", "08:30" (hôm
 * nay), "Hôm qua, 16:42", còn lại ngày giờ đầy đủ.
 */
export function notificationTime(createdAt: string): string {
  const now = serverDayjs();
  const at = serverDayjs(createdAt);
  const minutes = now.diff(at, "minute");
  if (minutes < 1) return "Vừa xong";
  if (minutes < 60) return `${minutes} phút trước`;
  const day = serverYmd(createdAt);
  const today = serverYmd();
  if (day === today) return formatServerHm(createdAt);
  if (day === shiftYmd(today, -1)) return `Hôm qua, ${formatServerHm(createdAt)}`;
  return `${formatYmd(day)} ${formatServerHm(createdAt)}`;
}

/** Thông báo thuộc hôm nay (giờ server) hay trước đó - để chia nhóm. */
export function isToday(createdAt: string): boolean {
  return serverYmd(createdAt) === serverYmd();
}
