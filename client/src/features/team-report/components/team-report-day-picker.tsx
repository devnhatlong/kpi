"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DatePickerInput } from "@/components/common/date-picker-input";
import { formatYmd, shiftYmd } from "@/lib/server-time";
import { cn } from "@/lib/utils";

type TeamReportDayPickerProps = {
  value: string;
  onChange: (next: string) => void;
  /**
   * Hôm nay theo GIỜ SERVER, do trang truyền xuống.
   *
   * Không tự gọi `serverYmd()` ở đây: hàm đó trả giờ máy khi chưa đồng bộ xong
   * với server, mà component con thì không biết đã đồng bộ hay chưa. Trang cha
   * chờ `useServerTime()` rồi mới dựng, nên chỉ nó mới nói đúng hôm nay là ngày
   * nào.
   */
  today: string;
  className?: string;
};

/**
 * Chọn ngày báo cáo, dùng chung cho cả bảng nhập lẫn tab phân loại.
 *
 * Ngày mặc định luôn lấy theo GIỜ SERVER chứ không theo đồng hồ máy: cán bộ
 * nhập lúc gần nửa đêm trên máy lệch múi giờ sẽ rơi vào bảng của ngày hôm sau,
 * mà cả đội chung một tài khoản nên hai người sẽ thấy hai ngày khác nhau.
 */
export function TeamReportDayPicker({
  value,
  onChange,
  today,
  className,
}: TeamReportDayPickerProps) {
  const isToday = value === today;

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <Button
        type="button"
        size="icon"
        variant="outline"
        className="bg-background"
        aria-label="Ngày trước"
        onClick={() => onChange(shiftYmd(value, -1))}
      >
        <ChevronLeft className="size-4" />
      </Button>

      <DatePickerInput
        value={value}
        onChange={(next) => {
          if (next) onChange(next);
        }}
        clearable={false}
        className="w-[190px]"
      />

      {/* Chặn đi tới tương lai: chưa tới ngày thì chưa có gì để báo cáo. */}
      <Button
        type="button"
        size="icon"
        variant="outline"
        className="bg-background"
        aria-label="Ngày sau"
        disabled={isToday}
        onClick={() => onChange(shiftYmd(value, 1))}
      >
        <ChevronRight className="size-4" />
      </Button>

      {isToday ? (
        <Badge variant="secondary" className="font-normal">
          Hôm nay
        </Badge>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onChange(today)}
        >
          Về hôm nay ({formatYmd(today)})
        </Button>
      )}
    </div>
  );
}
