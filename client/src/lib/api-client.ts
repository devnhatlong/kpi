import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";

import type { ApiResponse, AuthTokens } from "@/features/auth/types";
import { clearTokens, getAccessToken, getRefreshToken, setTokens } from "@/lib/auth-storage";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://localhost:8080/api/v1";

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

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  try {
    const { data } = await axios.post<ApiResponse<AuthTokens>>(
      `${API_BASE_URL}/auth/refresh`,
      { refreshToken },
    );
    if (!data.data?.accessToken || !data.data.refreshToken) return null;
    setTokens(data.data.accessToken, data.data.refreshToken);
    return data.data.accessToken;
  } catch {
    clearTokens();
    return null;
  }
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiResponse<unknown>>) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    if (
      error.response?.status === 401 &&
      original &&
      !original._retry &&
      !shouldSkipRefresh(original)
    ) {
      original._retry = true;
      refreshPromise ??= refreshAccessToken().finally(() => {
        refreshPromise = null;
      });
      const newToken = await refreshPromise;
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
}) {
  const query: Record<string, string | number | boolean> = {};
  if (params.all) {
    query.all = true;
    if (params.q?.trim()) query.q = params.q.trim();
    return query;
  }
  query.page = params.page ?? 1;
  query.limit = params.limit ?? 10;
  if (params.q?.trim()) query.q = params.q.trim();
  return query;
}
