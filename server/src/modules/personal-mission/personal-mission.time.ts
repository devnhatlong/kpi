/** Múi giờ nghiệp vụ (giờ Việt Nam trên server). */
export const MISSION_TIMEZONE = 'Asia/Ho_Chi_Minh';

/** YYYY-MM-DD theo timezone server (mặc định VN). */
export function serverDateYmd(
  date: Date = new Date(),
  timeZone: string = MISSION_TIMEZONE,
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

export function isYearMonth(value: string): boolean {
  return /^\d{4}-\d{2}$/.test(value);
}

/**
 * Kỳ tháng YYYY-MM của một ngày, theo giờ server.
 *
 * Nhận cả YYYY-MM (trả nguyên) lẫn YYYY-MM-DD (cắt lấy tháng) để chỗ gọi khỏi
 * phải nhớ mình đang cầm loại nào - bảng khối A chốt theo tháng nhưng luôn được
 * mở ra từ một ngày cụ thể trong báo cáo ngày.
 */
export function serverMonth(value?: string): string {
  const raw = value?.trim();
  if (raw && isYearMonth(raw)) return raw;
  if (raw && isYmd(raw)) return raw.slice(0, 7);
  return serverDateYmd().slice(0, 7);
}

/** Ngày đầu và ngày cuối của một kỳ tháng, dạng YYYY-MM-DD. */
export function monthRange(month: string): { from: string; to: string } {
  const [year, mon] = month.split('-').map(Number);
  const last = new Date(Date.UTC(year!, mon!, 0)).getUTCDate();
  return {
    from: `${month}-01`,
    to: `${month}-${String(last).padStart(2, '0')}`,
  };
}

/** Cộng/trừ ngày trên chuỗi YYYY-MM-DD (neo giữa trưa VN để tránh lệch ngày). */
export function shiftYmd(ymd: string, deltaDays: number): string {
  if (!isYmd(ymd)) return ymd;
  const date = new Date(`${ymd}T12:00:00+07:00`);
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return serverDateYmd(date);
}
