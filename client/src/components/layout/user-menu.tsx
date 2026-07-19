"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, Settings, UserRound } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/features/auth/auth-provider";
import {
  displayNameOf,
  initialsOf,
  isSuperAdmin,
  primaryRoleLabel,
} from "@/features/auth/types";
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
  const { user, logout } = useAuth();

  const name = user ? displayNameOf(user) : "Người dùng";
  const role = user ? primaryRoleLabel(user) : "";
  const initials = user ? initialsOf(user) : "?";
  const showSettings = isSuperAdmin(user);

  const handleLogout = async () => {
    await logout();
    toast.success("Đã đăng xuất.");
    router.replace("/login");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex cursor-pointer items-center gap-2.5 rounded-md py-1 pl-1 pr-1 outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring md:pr-2"
          aria-label="Menu tài khoản"
        >
          <Avatar className="size-9 ring-2 ring-primary/15">
            <AvatarFallback
              className="text-xs font-semibold text-primary-foreground"
              style={{ background: "var(--gradient-hero)" }}
            >
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="hidden min-w-0 text-left leading-tight md:block">
            <div className="truncate text-sm font-semibold text-foreground">{name}</div>
            {role ? (
              <div className="truncate text-xs text-muted-foreground">{role}</div>
            ) : null}
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
        {showSettings ? (
          <DropdownMenuItem asChild>
            <Link href="/settings">
              <Settings />
              Cài đặt
            </Link>
          </DropdownMenuItem>
        ) : null}
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
