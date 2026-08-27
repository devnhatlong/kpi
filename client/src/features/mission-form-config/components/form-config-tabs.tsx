"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

const TABS = [
  {
    value: "work-contents",
    label: "Nội dung công việc",
    href: "/mission/form-config/work-contents",
  },
  {
    value: "score-groups",
    label: "Nhóm điểm",
    href: "/mission/form-config/score-groups",
  },
] as const;

export function FormConfigTabs({ className }: { className?: string }) {
  const pathname = usePathname();
  const active =
    TABS.find((tab) => pathname.startsWith(tab.href))?.value ?? "work-contents";

  return (
    <Tabs value={active} className={cn("w-full", className)}>
      <TabsList>
        {TABS.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value} asChild>
            <Link href={tab.href}>{tab.label}</Link>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
