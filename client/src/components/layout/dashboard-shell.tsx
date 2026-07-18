"use client";

import { AppHeader, AppSidebar } from "@/components/layout";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="h-svh max-h-svh overflow-hidden bg-background">
        <AppHeader />
        <main className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4 md:p-4">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
