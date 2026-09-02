"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { useAuth } from "@/features/auth/auth-provider";
import { DEFAULT_APP_PATH } from "@/features/auth/constants";
import { userHasAnyPermission } from "@/features/auth/types";
import { pathRequiresPermissions } from "@/constants/navigation";
import type { AuthUser } from "@/features/auth/types";

function AuthLoading() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <div
          className="size-9 animate-spin rounded-full border-2 border-muted border-t-primary"
          aria-hidden
        />
        <p className="text-sm text-muted-foreground">Đang xác thực...</p>
      </div>
    </div>
  );
}

/** Chặn vào dashboard khi chưa đăng nhập. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (status !== "unauthenticated") return;
    const search = searchParams.toString();
    const next = `${pathname}${search ? `?${search}` : ""}`;
    const qs = next && next !== "/" ? `?next=${encodeURIComponent(next)}` : "";
    router.replace(`/login${qs}`);
  }, [status, router, pathname, searchParams]);

  if (status === "loading") return <AuthLoading />;
  if (status !== "authenticated") return null;
  return <>{children}</>;
}

function canAccessPath(
  pathname: string,
  user: AuthUser | null | undefined,
): boolean {
  const required = pathRequiresPermissions(pathname);
  if (!required) return true;
  return userHasAnyPermission(user, required);
}

/**
 * Chặn trang theo quyền khai trong NAV_ITEMS. Chỉ là lớp điều hướng cho đỡ vào
 * trang rồi ăn 403 - server vẫn tự kiểm tra ở mọi request.
 */
export function RestrictRoutesByPermission({
  children,
}: {
  children: ReactNode;
}) {
  const { user, status } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const blocked = status === "authenticated" && !canAccessPath(pathname, user);

  useEffect(() => {
    if (!blocked) return;
    router.replace(DEFAULT_APP_PATH);
  }, [blocked, router]);

  if (blocked) return null;
  return <>{children}</>;
}

/** Đã đăng nhập thì không cho ở lại trang login. */
export function RedirectIfAuthenticated({ children }: { children: ReactNode }) {
  const { status, user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (status !== "authenticated" || !user) return;
    const next = searchParams.get("next");
    let target = DEFAULT_APP_PATH;
    if (next && next.startsWith("/") && !next.startsWith("//")) {
      target = canAccessPath(next, user) ? next : DEFAULT_APP_PATH;
    }
    router.replace(target);
  }, [status, user, router, searchParams]);

  if (status === "loading") return <AuthLoading />;
  if (status === "authenticated") return null;
  return <>{children}</>;
}
