"use client";

import { useState } from "react";
import { Lock, UserRound } from "lucide-react";

import { Card } from "@/components/ui/card";
import { ProfileSettings } from "@/features/settings/components/profile-settings";
import { SecuritySettings } from "@/features/settings/components/security-settings";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "profile", label: "Hồ sơ", icon: UserRound },
  { key: "security", label: "Bảo mật", icon: Lock },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function SettingsView() {
  const [tab, setTab] = useState<TabKey>("profile");

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Cài đặt</h1>
        <p className="text-sm text-muted-foreground">
          Tùy chỉnh hệ thống KPI, tài khoản và tích hợp
        </p>
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-col md:flex-row">
          <nav
            aria-label="Nhóm cài đặt"
            className="flex gap-1 overflow-x-auto border-b p-3 md:w-56 md:shrink-0 md:flex-col md:border-b-0 md:border-r md:p-4"
          >
            {TABS.map(({ key, label, icon: Icon }) => {
              const active = tab === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex shrink-0 cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                    active
                      ? "font-medium text-primary md:bg-primary/5"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                  {active ? (
                    <span className="absolute inset-y-1 -right-4 hidden w-0.5 rounded-full bg-primary md:block" />
                  ) : null}
                </button>
              );
            })}
          </nav>

          <div className="min-w-0 flex-1 p-5 md:p-6">
            {tab === "profile" ? <ProfileSettings /> : <SecuritySettings />}
          </div>
        </div>
      </Card>
    </div>
  );
}
