import axios from "axios";

import type { ApiResponse, AuthTokens, AuthUser } from "@/features/auth/types";
import { api, unwrapData } from "@/lib/api-client";
import { clearTokens, getRefreshToken, setTokens } from "@/lib/auth-storage";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://localhost:8080/api/v1";

/** Login dùng raw axios để tránh gắn Bearer / kích hoạt refresh interceptor. */
export async function loginRequest(username: string, password: string): Promise<AuthTokens> {
  const { data } = await axios.post<ApiResponse<AuthTokens>>(`${API_BASE_URL}/auth/login`, {
    username,
    password,
  });
  if (!data.data?.accessToken || !data.data?.refreshToken) {
    throw new Error(data.message || "Đăng nhập thất bại.");
  }
  setTokens(data.data.accessToken, data.data.refreshToken);
  return data.data;
}

export async function fetchCurrentUser(): Promise<AuthUser> {
  return unwrapData(api.get<ApiResponse<AuthUser>>("/auth/me"));
}

/** Best-effort: gọi API revoke token, luôn clear local storage. */
export async function logoutRequest(): Promise<void> {
  const refreshToken = getRefreshToken();
  try {
    if (refreshToken) {
      await axios.post(`${API_BASE_URL}/auth/logout`, { refreshToken });
    }
  } finally {
    clearTokens();
  }
}
