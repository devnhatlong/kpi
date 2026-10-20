import axios from "axios";

import type { ApiResponse, AuthTokens, AuthUser } from "@/features/auth/types";
import { api, unwrapData } from "@/lib/api-client";
import { clearTokens, setAccessToken } from "@/lib/auth-storage";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "/api/v1";

/**
 * Login dùng raw axios để tránh gắn Bearer / kích hoạt refresh interceptor.
 * Refresh token về dưới dạng cookie HttpOnly (`withCredentials` để trình duyệt
 * nhận cookie cả khi dev chạy client và API khác cổng); body chỉ có access token.
 */
export async function loginRequest(username: string, password: string): Promise<AuthTokens> {
  const { data } = await axios.post<ApiResponse<AuthTokens>>(
    `${API_BASE_URL}/auth/login`,
    { username, password },
    { withCredentials: true },
  );
  if (!data.data?.accessToken) {
    throw new Error(data.message || "Đăng nhập thất bại.");
  }
  setAccessToken(data.data.accessToken);
  return data.data;
}

export async function fetchCurrentUser(): Promise<AuthUser> {
  return unwrapData(api.get<ApiResponse<AuthUser>>("/auth/me"));
}

/** Best-effort: gọi API thu hồi refresh token (trong cookie), luôn xoá token trên máy. */
export async function logoutRequest(): Promise<void> {
  try {
    await axios.post(`${API_BASE_URL}/auth/logout`, {}, { withCredentials: true });
  } finally {
    clearTokens();
  }
}
