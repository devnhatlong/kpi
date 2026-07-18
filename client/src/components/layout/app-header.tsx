"use client";

import { Bell, CircleHelp, Search } from "lucide-react";

import { CURRENT_USER } from "@/constants/navigation";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

export function AppHeader() {
  return (
    <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-3 border-b border-border bg-card/95 px-4 backdrop-blur supports-backdrop-filter:bg-card/80">
      <SidebarTrigger className="-ml-1 text-muted-foreground hover:text-foreground" />

      <div className="relative mx-auto w-full max-w-xl flex-1">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Tìm kiếm nhân viên, KPI, báo cáo..."
          className="h-10 rounded-full border-border/80 bg-muted/40 pl-10 pr-4 shadow-none focus-visible:bg-background"
        />
      </div>

      <div className="flex items-center gap-1 sm:gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full text-muted-foreground"
          aria-label="Trợ giúp"
        >
          <CircleHelp className="size-5" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="relative rounded-full text-muted-foreground"
          aria-label="Thông báo"
        >
          <Bell className="size-5" />
          <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-destructive-foreground">
            5
          </span>
        </Button>

        <Separator orientation="vertical" className="mx-1 hidden h-8 sm:block" />

        <div className="flex items-center gap-2.5 pl-1">
          <Avatar className="size-9 ring-2 ring-primary/15">
            <AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">
              {CURRENT_USER.initials}
            </AvatarFallback>
          </Avatar>
          <div className="hidden min-w-0 leading-tight md:block">
            <div className="truncate text-sm font-semibold text-foreground">{CURRENT_USER.name}</div>
            <div className="truncate text-xs text-muted-foreground">{CURRENT_USER.role}</div>
          </div>
        </div>
      </div>
    </header>
  );
}
