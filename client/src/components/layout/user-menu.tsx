"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, Settings, UserRound } from "lucide-react";

import { CURRENT_USER } from "@/constants/navigation";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function UserMenu() {
  const router = useRouter();

  const handleLogout = () => {
    // TODO: gọi API logout khi auth đã nối
    router.push("/login");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2.5 rounded-full py-1 pl-1 pr-1 outline-none transition hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring md:pr-2"
          aria-label="Menu tài khoản"
        >
          <Avatar className="size-9 ring-2 ring-primary/15">
            <AvatarFallback
              className="text-xs font-semibold text-primary-foreground"
              style={{ background: "var(--gradient-hero)" }}
            >
              {CURRENT_USER.initials}
            </AvatarFallback>
          </Avatar>
          <div className="hidden min-w-0 text-left leading-tight md:block">
            <div className="truncate text-sm font-semibold text-foreground">{CURRENT_USER.name}</div>
            <div className="truncate text-xs text-muted-foreground">{CURRENT_USER.role}</div>
          </div>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem asChild>
          <Link href="/profile">
            <UserRound />
            Hồ sơ
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings />
            Cài đặt
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleLogout}
          className="text-destructive focus:bg-destructive/10 focus:text-destructive"
        >
          <LogOut />
          Đăng xuất
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
