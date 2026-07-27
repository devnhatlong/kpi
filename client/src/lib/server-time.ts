import dayjs, { type Dayjs } from "dayjs";

import { api } from "@/lib/api-client";

let offsetMs = 0;
let syncedAt = 0;
const SYNC_TTL_MS = 5 * 60 * 1000;

export async function syncServerTime(): Promise<void> {
  const { data } = await api.get<{ serverTime: string; timezone: string }>(
    "/system/server-time",
  );
  const serverMs = new Date(data.serverTime).getTime();
  offsetMs = serverMs - Date.now();
  syncedAt = Date.now();
}

async function ensureSynced(): Promise<void> {
  if (!syncedAt || Date.now() - syncedAt > SYNC_TTL_MS) {
    await syncServerTime();
  }
}

/** Giờ server hiện tại (cần gọi syncServerTime trước hoặc dùng getServerDayjs). */
export function serverDayjs(): Dayjs {
  return dayjs(Date.now() + offsetMs);
}

/** Đồng bộ rồi trả giờ server. */
export async function getServerDayjs(): Promise<Dayjs> {
  await ensureSynced();
  return serverDayjs();
}

export function defaultDueDate(days = 14): string {
  return serverDayjs().add(days, "day").format("YYYY-MM-DD");
}

export async function getDefaultDueDate(days = 14): Promise<string> {
  const now = await getServerDayjs();
  return now.add(days, "day").format("YYYY-MM-DD");
}
