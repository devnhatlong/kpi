import dayjs, { type Dayjs } from "dayjs";
import timezonePlugin from "dayjs/plugin/timezone";
import utcPlugin from "dayjs/plugin/utc";

import type { ApiResponse } from "@/features/auth/types";
import { api, unwrapData } from "@/lib/api-client";

dayjs.extend(utcPlugin);
dayjs.extend(timezonePlugin);

type ServerTimePayload = {
  serverTime: string;
  timezone: string;
};

/**
 * Múi giờ nghiệp vụ, do server khai. Giữ nguyên hằng số này làm mặc định cho
 * lần render đầu (trước khi sync xong) - trùng KPI_TIMEZONE bên server.
 */
const FALLBACK_TIMEZONE = "Asia/Ho_Chi_Minh";

let offsetMs = 0;
let timezone = FALLBACK_TIMEZONE;
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
  if (payload.timezone?.trim()) timezone = payload.timezone.trim();
  syncedAt = Date.now();
}

/** Múi giờ nghiệp vụ đang áp dụng. */
export function serverTimezone(): string {
  return timezone;
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

/**
 * Giờ theo server, ở múi giờ nghiệp vụ của server.
 *
 * Bỏ trống `value` = "bây giờ" (giờ máy + độ lệch đã đo với server). Truyền
 * mốc thời gian ISO thì quy về đúng múi giờ đó - máy người dùng đặt lệch múi
 * giờ vẫn ra đúng ngày làm việc, đây là chỗ trước kia sai.
 *
 * Chưa sync thì tạm dùng giờ máy với múi giờ mặc định.
 */
export function serverDayjs(value?: string | number | Date): Dayjs {
  const base = value === undefined ? dayjs(Date.now() + offsetMs) : dayjs(value);
  return base.tz(timezone);
}

/** Ngày YYYY-MM-DD theo giờ server - khớp `serverDateYmd` bên server. */
export function serverYmd(value?: string | number | Date): string {
  return serverDayjs(value).format("YYYY-MM-DD");
}

/**
 * Cộng / trừ ngày trên chuỗi YYYY-MM-DD.
 * Neo giữa trưa theo múi giờ server để đổi ngày không bị lệch một hôm - cùng
 * cách làm với `shiftYmd` bên server.
 */
export function shiftYmd(ymd: string, deltaDays: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd;
  return dayjs
    .tz(`${ymd} 12:00`, timezone)
    .add(deltaDays, "day")
    .format("YYYY-MM-DD");
}

/**
 * Số ngày lịch giữa hai chuỗi YYYY-MM-DD (later - earlier).
 * So bằng mốc UTC dựng từ chính con số trong chuỗi nên không dính múi giờ hay
 * giờ mùa hè của bất kỳ bên nào.
 */
export function daysBetweenYmd(earlier: string, later: string): number | null {
  const parse = (ymd: string) => {
    const [year, month, day] = ymd.split("-").map(Number);
    if (!year || !month || !day) return null;
    return Date.UTC(year, month - 1, day);
  };
  const from = parse(earlier);
  const to = parse(later);
  if (from === null || to === null) return null;
  return Math.round((to - from) / (24 * 60 * 60 * 1000));
}

/**
 * Tuần hiện tại theo giờ server: thứ Hai đến Chủ nhật.
 * dayjs mặc định coi Chủ nhật là đầu tuần nên phải tự dịch, không thì thứ Hai
 * bị xếp sang tuần trước.
 */
export function currentWeekRange(): { from: string; to: string } {
  const now = serverDayjs();
  const monday = now.subtract((now.day() + 6) % 7, "day");
  return {
    from: monday.format("YYYY-MM-DD"),
    to: monday.add(6, "day").format("YYYY-MM-DD"),
  };
}

/** Giờ:phút của một mốc thời gian, theo múi giờ server. */
export function formatServerHm(value: string | number | Date): string {
  return serverDayjs(value).format("HH:mm");
}

/** Giờ:phút:giây - nhật ký cần phân biệt hai lần bấm cách nhau vài chục giây. */
export function formatServerHms(value: string | number | Date): string {
  return serverDayjs(value).format("HH:mm:ss");
}

/** dd/MM/yyyy để hiện lên màn - đọc thẳng con số trong chuỗi, không qua Date. */
export function formatYmd(ymd: string): string {
  const [year, month, day] = ymd.split("-");
  if (!year || !month || !day) return ymd;
  return `${day}/${month}/${year}`;
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
