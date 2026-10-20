import type { Request, Response } from 'express';

/**
 * Refresh token nằm trong cookie HttpOnly thay vì localStorage: script trên
 * trang (kể cả script lọt vào qua một lỗ XSS) không đọc được cookie này, nên
 * không lấy trộm được phiên đăng nhập dài hạn mang đi dùng ở máy khác.
 */
export const REFRESH_COOKIE_NAME = 'kpi_rt';

/**
 * Chỉ gửi kèm các route xác thực - mọi API khác vẫn dùng access token qua
 * header, không cần (và không nên) mang cookie này theo.
 */
const REFRESH_COOKIE_PATH = '/api/v1/auth';

/**
 * Cờ Secure: chỉ gửi qua HTTPS. Bản chính thức chạy HTTPS (IIS) nên bật mặc
 * định; trình duyệt coi http://localhost là ngữ cảnh an toàn nên lúc dev vẫn
 * nhận cookie. Chạy thử qua HTTP trên IP mạng LAN thì đặt COOKIE_SECURE=false.
 */
function isSecure(): boolean {
  return process.env.COOKIE_SECURE !== 'false';
}

export function setRefreshCookie(
  res: Response,
  refreshToken: string,
  expiresAt: Date,
) {
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    secure: isSecure(),
    // Strict: trang khác không gửi được request kèm cookie này (chống CSRF).
    // Client và API chung một site nên không vướng gì.
    sameSite: 'strict',
    path: REFRESH_COOKIE_PATH,
    expires: expiresAt,
  });
}

export function clearRefreshCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: isSecure(),
    sameSite: 'strict',
    path: REFRESH_COOKIE_PATH,
  });
}

/**
 * Đọc cookie từ header thô - tự đọc thay vì cài cookie-parser, vì máy đích
 * offline và ở đây chỉ cần đúng một cookie.
 */
export function readRefreshCookie(req: Request): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    if (part.slice(0, index).trim() !== REFRESH_COOKIE_NAME) continue;
    const value = part.slice(index + 1).trim();
    try {
      return decodeURIComponent(value) || null;
    } catch {
      return null;
    }
  }
  return null;
}
