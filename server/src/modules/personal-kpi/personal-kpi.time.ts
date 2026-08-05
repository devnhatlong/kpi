/** Múi giờ nghiệp vụ KPI (giờ Việt Nam trên server). */
export const KPI_TIMEZONE = 'Asia/Ho_Chi_Minh';

/** YYYY-MM-DD theo timezone server (mặc định VN). */
export function serverDateYmd(
  date: Date = new Date(),
  timeZone: string = KPI_TIMEZONE,
): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function isYmd(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** Cộng/trừ ngày trên chuỗi YYYY-MM-DD (neo giữa trưa VN để tránh lệch ngày). */
export function shiftYmd(ymd: string, deltaDays: number): string {
  if (!isYmd(ymd)) return ymd;
  const date = new Date(`${ymd}T12:00:00+07:00`);
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return serverDateYmd(date);
}
