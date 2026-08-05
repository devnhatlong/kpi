import dayjs, { type Dayjs } from "dayjs";

import type { ApiResponse } from "@/features/auth/types";
import { api, unwrapData } from "@/lib/api-client";

type ServerTimePayload = {
  serverTime: string;
  timezone: string;
};

let offsetMs = 0;
let syncedAt = 0;
let inflight: Promise<void> | null = null;
const SYNC_TTL_MS = 5 * 60 * 1000;

async function fetchOffset(): Promise<void> {
  const payload = await unwrapData(
    api.get<ApiResponse<ServerTimePayload>>("/system/server-time"),
  );
  const serverMs = new Date(payload.serverTime).getTime();
  if (Number.isNaN(serverMs)) {
    throw new Error("Giờ server trả về không hợp lệ.");
  }
  // Chỉ ghi đè khi chắc chắn hợp lệ: offset NaN sẽ làm mọi serverDayjs() thành Invalid Date.
  offsetMs = serverMs - Date.now();
  syncedAt = Date.now();
}

/** Đồng bộ offset giờ server. Gọi song song nhiều lần chỉ tạo một request. */
export function syncServerTime(): Promise<void> {
  inflight ??= fetchOffset().finally(() => {
    inflight = null;
  });
  return inflight;
}

export function isServerTimeSynced(): boolean {
  return syncedAt > 0 && Date.now() - syncedAt <= SYNC_TTL_MS;
}

export function ensureServerTimeSynced(): Promise<void> {
  return isServerTimeSynced() ? Promise.resolve() : syncServerTime();
}

/** Giờ server hiện tại. Chưa sync thì tạm dùng giờ máy (offset 0). */
export function serverDayjs(): Dayjs {
  return dayjs(Date.now() + offsetMs);
}

/** Đồng bộ rồi trả giờ server. */
export async function getServerDayjs(): Promise<Dayjs> {
  await ensureServerTimeSynced();
  return serverDayjs();
}

export function defaultDueDate(days = 14): string {
  return serverDayjs().add(days, "day").format("YYYY-MM-DD");
}

export async function getDefaultDueDate(days = 14): Promise<string> {
  const now = await getServerDayjs();
  return now.add(days, "day").format("YYYY-MM-DD");
}
