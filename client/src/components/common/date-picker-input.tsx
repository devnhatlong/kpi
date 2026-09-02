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
import { dateToYmd, ymdToDate } from "@/components/common/date-range-filter";
import { formatYmd } from "@/lib/server-time";
import { cn } from "@/lib/utils";

type DatePickerInputProps = {
  /** Ngày dạng YYYY-MM-DD; rỗng = chưa chọn. */
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  placeholder?: string;
  /** Cho phép bỏ trống lại. Ô bắt buộc thì tắt đi cho khỏi có nút vô nghĩa. */
  clearable?: boolean;
  /** Chặn chọn trước ngày này (YYYY-MM-DD). */
  min?: string;
  /** Chặn chọn sau ngày này (YYYY-MM-DD). */
  max?: string;
  /** id để nhãn <label htmlFor> trỏ tới. */
  id?: string;
  className?: string;
  triggerClassName?: string;
};

/**
 * Ô chọn ngày dùng chung, LUÔN hiện dd/mm/yyyy.
 *
 * Thay cho `input type="date"`: ô gốc của trình duyệt bày ngày theo NGÔN NGỮ
 * TRÌNH DUYỆT chứ không theo phần mềm, nên máy cài tiếng Anh hiện 09/02/2026
 * nghĩa là mùng 2 tháng 9 - người dùng đọc ra mùng 9 tháng 2. Không có thuộc
 * tính hay CSS nào ép được định dạng đó, nên phải tự dựng.
 *
 * Giá trị trao đổi vẫn là YYYY-MM-DD để khớp thẳng với server; chỉ phần hiển
 * thị mới đổi sang cách đọc của người Việt.
 *
 * Đặt ở `components/common` chứ không nằm trong một feature: cả bản nghiệp vụ
 * cũ lẫn bản mới đều dùng, mà cho bản cũ phụ thuộc vào thư mục của bản mới thì
 * gỡ bản nào ra cũng gãy.
 */
export function DatePickerInput({
  value,
  onChange,
  disabled,
  placeholder = "Chọn ngày",
  clearable = true,
  min,
  max,
  id,
  className,
  triggerClassName,
}: DatePickerInputProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className={cn("flex items-center gap-0.5", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            className={cn(
              "w-full justify-start gap-2 bg-background px-2.5 font-normal tabular-nums",
              !value && "text-muted-foreground",
              triggerClassName,
            )}
          >
            <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
            {value ? formatYmd(value) : placeholder}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            defaultMonth={ymdToDate(value)}
            selected={ymdToDate(value)}
            disabled={[
              ...(min ? [{ before: ymdToDate(min) as Date }] : []),
              ...(max ? [{ after: ymdToDate(max) as Date }] : []),
            ]}
            onSelect={(picked) => {
              if (!picked) return;
              setOpen(false);
              onChange(dateToYmd(picked));
            }}
          />
        </PopoverContent>
      </Popover>

      {clearable && value && !disabled ? (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-8 shrink-0"
          aria-label="Bỏ chọn ngày"
          onClick={() => onChange("")}
        >
          <X className="size-4" />
        </Button>
      ) : null}
    </div>
  );
}
