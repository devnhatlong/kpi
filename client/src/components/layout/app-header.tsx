"use client";

import { Bell, Search } from "lucide-react";

import { ThemeToggle } from "@/components/common/theme-toggle";
import { UserMenu } from "@/components/layout/user-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

export function AppHeader() {
  return (
    <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-3 border-b border-border bg-card/80 px-4 backdrop-blur-xl supports-backdrop-filter:bg-card/70">
      <SidebarTrigger className="-ml-1 text-muted-foreground hover:text-foreground" />

      <div className="relative mx-auto w-full max-w-xl flex-1">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Tìm kiếm nhân viên, nhiệm vụ, báo cáo..."
          className="h-10 rounded-full border-border/80 bg-muted/40 pl-10 pr-4 shadow-none focus-visible:bg-background"
        />
      </div>

      <div className="flex items-center gap-1 sm:gap-2">
        <ThemeToggle />

        <Button
          variant="ghost"
          size="icon"
          className="relative rounded-full text-muted-foreground"
          aria-label="Thông báo"
        >
          <Bell className="size-5" />
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-destructive-foreground ring-2 ring-card">
            5
          </span>
        </Button>

        <Separator
          orientation="vertical"
          className="mx-1 hidden h-8 sm:block"
        />

        <UserMenu />
      </div>
    </header>
  );
}
