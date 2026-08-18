"use client";

import type { ReactNode } from "react";

import {
  SLIDING_INDICATOR_CLASS,
  useSlidingIndicator,
} from "@/hooks/use-sliding-indicator";
import { cn } from "@/lib/utils";

export type SegmentedTabItem<T extends string> = {
  value: T;
  label: ReactNode;
  title?: string;
};

type SegmentedTabsProps<T extends string> = {
  items: Array<SegmentedTabItem<T>>;
  value: T;
  onChange: (value: T) => void;
  className?: string;
  /** Đổi màu vệt trượt cho khớp nền của nhóm (ví dụ nhóm viền ngoài). */
  indicatorClassName?: string;
  ariaLabel?: string;
};

/**
 * Nhóm nút chọn một trong nhiều, có vệt nền trượt theo nút đang chọn.
 *
 * Dành cho những nhóm không dùng Radix Tabs (chỉ đổi bộ lọc chứ không đổi panel
 * nội dung). Dùng chung một vệt với `TabsList` để mọi chỗ trượt giống nhau.
 */
export function SegmentedTabs<T extends string>({
  items,
  value,
  onChange,
  className,
  indicatorClassName,
  ariaLabel,
}: SegmentedTabsProps<T>) {
  const { listRef, indicatorRef } = useSlidingIndicator<HTMLDivElement>();

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "relative flex flex-wrap gap-1 rounded-lg bg-muted/60 p-1",
        className,
      )}
    >
      <span
        ref={indicatorRef}
        className={cn(SLIDING_INDICATOR_CLASS, indicatorClassName)}
      />
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            data-active={active}
            title={item.title}
            onClick={() => onChange(item.value)}
            className={cn(
              "relative z-10 rounded-md px-3 py-1.5 text-sm transition-colors",
              active
                ? "font-medium text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
