import type { ApiResponse, AuthUser } from "@/features/auth/types";
import { api, unwrapData } from "@/lib/api-client";

export type UpdateProfilePayload = {
  fullName?: string;
  email?: string;
  phone?: string;
  position?: string;
};

export type ChangePasswordPayload = {
  currentPassword: string;
  newPassword: string;
};

export async function updateMyProfile(
  payload: UpdateProfilePayload,
): Promise<AuthUser> {
  return unwrapData(api.patch<ApiResponse<AuthUser>>("/auth/me", payload));
}

/** Đổi mật khẩu thành công sẽ thu hồi mọi refresh token - phải đăng nhập lại. */
export async function changeMyPassword(
  payload: ChangePasswordPayload,
): Promise<void> {
  await api.post<ApiResponse<null>>("/auth/change-password", payload);
}
