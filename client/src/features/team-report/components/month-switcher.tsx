"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useServerTime } from "@/hooks/use-server-time";
import { serverYmd } from "@/lib/server-time";

/** Dịch "YYYY-MM" đi N tháng. */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const index = y! * 12 + (m! - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/**
 * Tháng đang xem của một trang - mặc định tháng hiện tại THEO GIỜ SERVER.
 * Trả "" khi chưa đồng bộ giờ server (chưa gọi API được).
 */
export function useCurrentMonth() {
  const { ready } = useServerTime();
  return ready ? serverYmd().slice(0, 7) : "";
}

/**
 * Ô chọn tháng ‹ Tháng MM/YYYY › - mỗi tháng xem riêng. Không cho đi quá tháng
 * hiện tại (theo giờ server).
 */
export function MonthSwitcher({
  month,
  onChange,
}: {
  month: string;
  onChange: (next: string) => void;
}) {
  const thisMonth = useCurrentMonth();
  const [y, m] = month.split("-");
  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="icon"
        disabled={!month}
        onClick={() => onChange(shiftMonth(month, -1))}
        aria-label="Tháng trước"
      >
        <ChevronLeft className="size-4" />
      </Button>
      <div className="min-w-[9rem] rounded-md border bg-background px-3 py-2 text-center text-sm font-medium tabular-nums">
        {month ? `Tháng ${m}/${y}` : "…"}
      </div>
      <Button
        type="button"
        variant="outline"
        size="icon"
        disabled={!month || month >= thisMonth}
        onClick={() => onChange(shiftMonth(month, 1))}
        aria-label="Tháng sau"
      >
        <ChevronRight className="size-4" />
      </Button>
    </div>
  );
}
