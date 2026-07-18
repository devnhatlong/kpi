"use client";

import { Suspense, type ReactNode } from "react";

import { RedirectIfAuthenticated } from "@/features/auth/auth-guards";

export default function AuthLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-svh items-center justify-center">
          <div className="size-9 animate-spin rounded-full border-2 border-muted border-t-primary" />
        </div>
      }
    >
      <RedirectIfAuthenticated>
        <div className="auth-layout">{children}</div>
      </RedirectIfAuthenticated>
    </Suspense>
  );
}
