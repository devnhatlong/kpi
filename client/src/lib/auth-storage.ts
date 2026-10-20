/*
  Access token chỉ nằm trong BỘ NHỚ của tab, refresh token nằm trong cookie
  HttpOnly do server đặt - không cái nào nằm trong localStorage nữa. Script
  lọt vào trang (XSS) không đọc được cookie HttpOnly, nên không lấy trộm được
  phiên dài hạn mang đi dùng ở máy khác.

  Tải lại trang là mất access token trong bộ nhớ: AuthProvider gọi làm mới
  (trình duyệt tự gửi cookie) để lấy lại.
*/

let accessToken: string | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function clearTokens() {
  accessToken = null;
  clearLegacyTokens();
}

// ------------------------------------------------ phiên cũ (localStorage)

/* Khoá cũ, từ trước khi refresh token chuyển sang cookie. Chỉ còn đọc đúng
   một lần để chuyển phiên đang đăng nhập sang cookie rồi xoá. */
const LEGACY_ACCESS_TOKEN_KEY = "mission_access_token";
const LEGACY_REFRESH_TOKEN_KEY = "mission_refresh_token";

/** Lấy refresh token cũ còn sót trong localStorage (nếu có), rồi xoá luôn. */
export function takeLegacyRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const token = localStorage.getItem(LEGACY_REFRESH_TOKEN_KEY);
    clearLegacyTokens();
    return token;
  } catch {
    return null;
  }
}

function clearLegacyTokens() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(LEGACY_ACCESS_TOKEN_KEY);
    localStorage.removeItem(LEGACY_REFRESH_TOKEN_KEY);
  } catch {
    // Trình duyệt chặn storage - không có gì để xoá.
  }
}
