"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock, Usb, UserRound } from "lucide-react";

import { Card } from "@/components/ui/card";
import { ProfileSettings } from "@/features/settings/components/profile-settings";
import { SecuritySettings } from "@/features/settings/components/security-settings";
import { UsbTokenSettings } from "@/features/settings/components/usb-token-settings";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "profile", label: "Hồ sơ", icon: UserRound },
  { key: "security", label: "Bảo mật", icon: Lock },
  { key: "usb-token", label: "USB Token", icon: Usb },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const TAB_KEYS = TABS.map((item) => item.key) as readonly string[];

export function SettingsView() {
  // Mở đúng tab theo ?tab= để menu tài khoản trỏ thẳng được vào từng mục,
  // thay vì hai mục cùng đổ về một màn hình giống hệt nhau.
  const router = useRouter();
  const searchParams = useSearchParams();
  // Đối chiếu với danh sách tab thay vì so từng chuỗi, để thêm tab sau này
  // không phải sửa thêm chỗ nào ở đây nữa.
  const requestedTab = searchParams.get("tab") ?? "";
  const initialTab: TabKey = TAB_KEYS.includes(requestedTab)
    ? (requestedTab as TabKey)
    : "profile";
  const [tab, setTab] = useState<TabKey>(initialTab);

  /** Đổi tab thì URL đổi theo, để copy link ra là mở đúng chỗ. */
  const selectTab = (key: TabKey) => {
    setTab(key);
    router.replace(`/settings?tab=${key}`, { scroll: false });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          Tài khoản
        </h1>
        <p className="text-sm text-muted-foreground">
          Thông tin cá nhân, mật khẩu đăng nhập và chứng thư số
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
                  onClick={() => selectTab(key)}
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
            {tab === "profile" ? <ProfileSettings /> : null}
            {tab === "security" ? <SecuritySettings /> : null}
            {tab === "usb-token" ? <UsbTokenSettings /> : null}
          </div>
        </div>
      </Card>
    </div>
  );
}
