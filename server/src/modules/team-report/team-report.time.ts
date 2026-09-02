/**
 * Ngày giờ nghiệp vụ cho module báo cáo ngày cấp đội.
 *
 * Cố tình KHÔNG dùng chung tệp với `personal-mission`: hai bản nghiệp vụ phải
 * tách hẳn để bản này gỡ ra hay bản kia bật lại đều không kéo theo cái còn lại.
 * Đây là mấy hàm thuần, không giữ trạng thái, nên nhân đôi ở đây rẻ hơn nhiều
 * so với việc buộc hai module vào nhau.
 *
 * Đổi lại: sửa luật ngày ở đây thì phải sửa cả bên kia. Luật đó là "quy về ngày
 * lịch theo giờ Việt Nam", gần như không đổi.
 */

/** Múi giờ nghiệp vụ - mọi ngày báo cáo đều quy về giờ Việt Nam trên server. */
export const TEAM_REPORT_TIMEZONE = 'Asia/Ho_Chi_Minh';

/**
 * YYYY-MM-DD theo giờ server.
 *
 * Không dùng giờ máy người dùng: cán bộ nhập lúc 23h30 mà máy lệch múi giờ thì
 * báo cáo rơi sang ngày hôm sau, và cả đội đọc ra hai ngày khác nhau cho cùng
 * một lượt nhập.
 */
export function serverDateYmd(
  date: Date = new Date(),
  timeZone: string = TEAM_REPORT_TIMEZONE,
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

/**
 * Dịch một ngày đi N ngày.
 *
 * Neo vào 12:00 +07:00 chứ không phải nửa đêm: cộng trừ quanh mốc nửa đêm dễ
 * nhảy sang ngày khác khi quy đổi múi giờ, còn giữa trưa thì cách nào cũng ra
 * đúng ngày.
 */
export function shiftYmd(ymd: string, deltaDays: number): string {
  if (!isYmd(ymd)) return ymd;
  const date = new Date(`${ymd}T12:00:00+07:00`);
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return serverDateYmd(date);
}
