"use client";

import { useState } from "react";
import { CalendarDays, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatYmd } from "@/lib/server-time";
import { cn } from "@/lib/utils";

/** Ngày của lịch (giờ máy) đổi sang YYYY-MM-DD. */
export function dateToYmd(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** YYYY-MM-DD đổi ngược thành Date cho lịch; giữa trưa để khỏi lệch múi giờ. */
export function ymdToDate(ymd: string): Date | undefined {
  const [year, month, day] = ymd.split("-").map(Number);
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day, 12);
}

/**
 * Ô chọn một ngày cho bộ lọc.
 * Dùng lịch riêng chứ không dùng input type="date" vì ô đó hiện ngày theo ngôn
 * ngữ trình duyệt - máy cài tiếng Anh sẽ ra 08/17/2026.
 */
export function DateFilterButton({
  label,
  value,
  onChange,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex items-center gap-0.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "gap-2 bg-background font-normal",
              !value && "text-muted-foreground",
              className,
            )}
          >
            <CalendarDays className="size-4 text-muted-foreground" />
            {value ? formatYmd(value) : label}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            defaultMonth={ymdToDate(value)}
            selected={ymdToDate(value)}
            onSelect={(picked) => {
              if (!picked) return;
              setOpen(false);
              onChange(dateToYmd(picked));
            }}
          />
        </PopoverContent>
      </Popover>
      {value ? (
        <Button
          size="icon"
          variant="ghost"
          className="size-8 shrink-0"
          onClick={() => onChange("")}
          aria-label={`Bỏ lọc ${label.toLowerCase()}`}
        >
          <X className="size-4" />
        </Button>
      ) : null}
    </div>
  );
}

type DateRangeFilterProps = {
  /** Nhãn đứng trước hai ô - nói rõ lọc theo ngày nào. */
  label?: string;
  from: string;
  to: string;
  /** Đang dùng khoảng mặc định (chưa ai chỉnh tay). */
  isDefault: boolean;
  /** Chữ hiện khi đang ở khoảng mặc định, ví dụ "Tuần này". */
  defaultLabel?: string;
  /** Chữ trên nút quay về khoảng mặc định. */
  resetLabel?: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  onReset: () => void;
  /** Nút thấp lại cho vừa hàng chip ở đầu trang. */
  compact?: boolean;
  className?: string;
};

/**
 * Bộ lọc "từ ngày - đến ngày" kèm nút về khoảng mặc định.
 *
 * Dùng chung cho màn cán bộ và màn theo dõi của chỉ huy để hai nơi lọc giống
 * hệt nhau; khoảng mặc định do nơi gọi quyết định (thường là tuần hiện tại
 * tính theo giờ server).
 */
export function DateRangeFilter({
  label = "Ngày báo cáo",
  from,
  to,
  isDefault,
  defaultLabel = "Tuần này",
  resetLabel = "Về tuần này",
  onFromChange,
  onToChange,
  onReset,
  compact = false,
  className,
}: DateRangeFilterProps) {
  const buttonClass = compact ? "h-8 px-3 text-sm" : undefined;

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {label ? (
        <span className="text-sm text-muted-foreground">{label}</span>
      ) : null}
      <DateFilterButton
        label="Từ ngày"
        value={from}
        onChange={onFromChange}
        className={buttonClass}
      />
      <DateFilterButton
        label="Đến ngày"
        value={to}
        onChange={onToChange}
        className={buttonClass}
      />
      {isDefault ? (
        <span className="text-xs text-muted-foreground">{defaultLabel}</span>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          className={compact ? "h-8" : undefined}
          onClick={onReset}
        >
          {resetLabel}
        </Button>
      )}
    </div>
  );
}
