import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";

import {
  PASSWORD_CHANGE_PATH,
  PASSWORD_CHANGE_REQUIRED,
  type ApiResponse,
  type AuthTokens,
} from "@/features/auth/types";
import {
  clearTokens,
  getAccessToken,
  setAccessToken,
  takeLegacyRefreshToken,
} from "@/lib/auth-storage";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "/api/v1";

const AUTH_SKIP_REFRESH_PATHS = ["/auth/login", "/auth/refresh", "/auth/logout"];

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { "Content-Type": "application/json" },
});

function shouldSkipRefresh(config?: InternalAxiosRequestConfig): boolean {
  const url = config?.url ?? "";
  return AUTH_SKIP_REFRESH_PATHS.some((p) => url.includes(p));
}

function redirectToLogin() {
  if (typeof window === "undefined") return;
  const path = window.location.pathname;
  if (path === "/login" || path.startsWith("/login?")) return;
  const next = `${path}${window.location.search}`;
  const qs = next && next !== "/" ? `?next=${encodeURIComponent(next)}` : "";
  window.location.assign(`/login${qs}`);
}

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let refreshPromise: Promise<string | null> | null = null;

async function requestNewAccessToken(): Promise<string | null> {
  // Phiên cũ còn refresh token trong localStorage: gửi kèm một lần để server
  // chuyển sang cookie - người đang đăng nhập không phải đăng nhập lại.
  const legacyRefreshToken = takeLegacyRefreshToken();
  try {
    const { data } = await axios.post<ApiResponse<AuthTokens>>(
      `${API_BASE_URL}/auth/refresh`,
      legacyRefreshToken ? { refreshToken: legacyRefreshToken } : {},
      // Cookie refresh token HttpOnly do trình duyệt tự gửi kèm.
      { withCredentials: true },
    );
    if (!data.data?.accessToken) return null;
    setAccessToken(data.data.accessToken);
    return data.data.accessToken;
  } catch {
    clearTokens();
    return null;
  }
}

/**
 * Lấy access token mới từ cookie refresh token. Gộp các lần gọi trùng nhau
 * trong cùng tab thành một request - nhiều API cùng nhận 401 một lúc không
 * được làm mới nhiều lần.
 */
export function refreshAccessToken(): Promise<string | null> {
  refreshPromise ??= requestNewAccessToken().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

/**
 * Server chặn vì tài khoản phải đổi mật khẩu mặc định: đưa về trang đổi mật
 * khẩu. Đang ở đó rồi thì thôi - không thì trang tự nạp lại mãi.
 */
function redirectToPasswordChange() {
  if (typeof window === "undefined") return;
  if (window.location.pathname === "/settings") return;
  window.location.assign(PASSWORD_CHANGE_PATH);
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiResponse<unknown> & { code?: string }>) => {
    if (
      error.response?.status === 403 &&
      error.response.data?.code === PASSWORD_CHANGE_REQUIRED
    ) {
      redirectToPasswordChange();
      return Promise.reject(error);
    }

    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    if (
      error.response?.status === 401 &&
      original &&
      !original._retry &&
      !shouldSkipRefresh(original)
    ) {
      original._retry = true;
      const newToken = await refreshAccessToken();
      if (newToken) {
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      }
      clearTokens();
      redirectToLogin();
    }
    return Promise.reject(error);
  },
);

export function getApiErrorMessage(error: unknown, fallback = "Đã xảy ra lỗi."): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as
      | { message?: string | string[]; error?: string }
      | undefined;
    const detail = data?.error;
    const msg = data?.message;
    if (Array.isArray(msg)) return msg.join(", ");
    if (typeof msg === "string" && msg.trim()) {
      return typeof detail === "string" && detail.trim() ? `${msg} (${detail})` : msg;
    }
    if (typeof detail === "string" && detail.trim()) return detail;
    if (error.message) return error.message;
  }
  if (error instanceof Error) return error.message;
  return fallback;
}

export async function unwrapData<T>(promise: Promise<{ data: ApiResponse<T> }>): Promise<T> {
  const { data } = await promise;
  if (data.data === undefined) {
    throw new Error(data.message || "Không có dữ liệu phản hồi.");
  }
  return data.data;
}

export async function unwrapPaginated<T>(
  promise: Promise<{ data: ApiResponse<T[]> }>,
): Promise<{ data: T[]; meta: NonNullable<ApiResponse<T[]>["meta"]> }> {
  const { data } = await promise;
  if (data.data === undefined) {
    throw new Error(data.message || "Không có dữ liệu phản hồi.");
  }
  const meta = data.meta ?? {
    total: data.data.length,
    page: 1,
    limit: data.data.length || 10,
    totalPages: 1,
  };
  return { data: data.data, meta };
}

export function buildListQuery(params: {
  page?: number;
  limit?: number;
  q?: string;
  all?: boolean;
  [key: string]: string | number | boolean | undefined;
}) {
  const query: Record<string, string | number | boolean> = {};
  const { page, limit, q, all, ...rest } = params;
  for (const [key, value] of Object.entries(rest)) {
    if (value !== undefined && value !== "") query[key] = value;
  }
  if (all) {
    query.all = true;
    if (q?.trim()) query.q = q.trim();
    return query;
  }
  query.page = page ?? 1;
  query.limit = limit ?? 10;
  if (q?.trim()) query.q = q.trim();
  return query;
}
