"use client";

import { Suspense, type ReactNode } from "react";

import {
  RequireAuth,
  RestrictSuperAdminRoutes,
} from "@/features/auth/auth-guards";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { ServerTimeSync } from "@/components/server-time-sync";

export default function DashboardLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-svh items-center justify-center bg-background">
          <div className="size-9 animate-spin rounded-full border-2 border-muted border-t-primary" />
        </div>
      }
    >
      <RequireAuth>
        <RestrictSuperAdminRoutes>
          <ServerTimeSync />
          <DashboardShell>{children}</DashboardShell>
        </RestrictSuperAdminRoutes>
      </RequireAuth>
    </Suspense>
  );
}
