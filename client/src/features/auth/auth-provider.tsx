"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  fetchCurrentUser,
  loginRequest,
  logoutRequest,
} from "@/features/auth/api";
import type { AuthStatus, AuthUser } from "@/features/auth/types";
import { getAccessToken } from "@/lib/auth-storage";
import { getApiErrorMessage } from "@/lib/api-client";

type AuthContextValue = {
  user: AuthUser | null;
  status: AuthStatus;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");

  const refreshUser = useCallback(async () => {
    if (!getAccessToken()) {
      setUser(null);
      setStatus("unauthenticated");
      return;
    }

    try {
      const me = await fetchCurrentUser();
      setUser(me);
      setStatus("authenticated");
    } catch {
      setUser(null);
      setStatus("unauthenticated");
    }
  }, []);

  useEffect(() => {
    void refreshUser();
  }, [refreshUser]);

  const login = useCallback(async (username: string, password: string) => {
    await loginRequest(username, password);
    const me = await fetchCurrentUser();
    setUser(me);
    setStatus("authenticated");
    return me;
  }, []);

  const logout = useCallback(async () => {
    try {
      await logoutRequest();
    } catch (error) {
      /*
        Mất mạng hay server đang tắt thì vẫn coi là đăng xuất xong: token đã bị
        xoá trong `logoutRequest`, và `finally` bên dưới dọn nốt phiên trên máy.
        Phần chưa làm được chỉ là báo cho server thu hồi refresh token.

        Dùng `console.warn` chứ KHÔNG dùng `console.error`: lớp phủ lỗi của
        Next bắt mọi `console.error` và bung ra một hộp đỏ kín màn hình, khiến
        một tình huống đã xử lý gọn trông như ứng dụng vừa sập.
      */
      console.warn(
        `Không báo được cho server khi đăng xuất (${getApiErrorMessage(
          error,
          "lỗi mạng",
        )}). Phiên trên máy này đã được xoá.`,
      );
    } finally {
      setUser(null);
      setStatus("unauthenticated");
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      status,
      isAuthenticated: status === "authenticated" && !!user,
      login,
      logout,
      refreshUser,
    }),
    [user, status, login, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth phải dùng trong AuthProvider.");
  }
  return ctx;
}
