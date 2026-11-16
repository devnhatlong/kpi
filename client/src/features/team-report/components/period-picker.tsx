"use client";

import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { monthPeriodOptions } from "@/features/team-report/month-periods";
import { useServerTime } from "@/hooks/use-server-time";
import { formatYmd, serverYmd, shiftYmd } from "@/lib/server-time";

/** Khoảng trượt tính lùi từ hôm nay - để sau các kỳ tháng. */
const ROLLING = [
  { value: "d7", days: 7, label: "7 ngày gần nhất" },
  { value: "d30", days: 30, label: "30 ngày gần nhất" },
  { value: "d90", days: 90, label: "90 ngày gần nhất" },
] as const;

const CUSTOM = "custom";
/** Biểu đồ theo ngày dựng từng ngày một - khoảng quá dài thì nặng và rối. */
const MAX_CUSTOM_DAYS = 366;

export type PeriodRange = ReturnType<typeof usePeriodRange>;

/**
 * Khoảng ngày đang xem của trang Thống kê - một chỗ cho mọi tab, để đổi kỳ là
 * cả trang nói về cùng một lát dữ liệu. Mặc định kỳ tháng mới nhất (15 → 14),
 * theo giờ server.
 */
export function usePeriodRange() {
  const { ready } = useServerTime();
  const [rangeKey, setRangeKey] = useState("");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const months = useMemo(() => (ready ? monthPeriodOptions() : []), [ready]);

  const range = rangeKey || months[0]?.value || "";
  const month = months.find((m) => m.value === range);
  const rolling = ROLLING.find((r) => r.value === range);
  const today = ready ? serverYmd() : "";

  let fromDate = "";
  let toDate = "";
  if (month) {
    fromDate = month.from;
    toDate = month.to;
  } else if (rolling && today) {
    fromDate = shiftYmd(today, -(rolling.days - 1));
    toDate = today;
  } else if (range === CUSTOM) {
    fromDate = customFrom;
    toDate = customTo;
  }

  const isCustom = range === CUSTOM;
  const customError =
    isCustom && customFrom && customTo
      ? customFrom > customTo
        ? "Từ ngày phải trước hoặc bằng đến ngày."
        : shiftYmd(customFrom, MAX_CUSTOM_DAYS - 1) < customTo
          ? `Khoảng tự chọn tối đa ${MAX_CUSTOM_DAYS} ngày.`
          : ""
      : "";

  return {
    ready,
    months,
    range,
    setRange: setRangeKey,
    isCustom,
    customFrom,
    setCustomFrom,
    customTo,
    setCustomTo,
    customError,
    fromDate,
    toDate,
    valid: Boolean(fromDate && toDate && !customError),
  };
}

/** Ô chọn kỳ: 12 kỳ tháng, tự chọn khoảng ngày, rồi 7 / 30 / 90 ngày. */
export function PeriodPicker({ period }: { period: PeriodRange }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={period.range} onValueChange={period.setRange}>
        <SelectTrigger className="w-72 bg-background" aria-label="Kỳ báo cáo">
          <SelectValue placeholder="Đang đồng bộ giờ server..." />
        </SelectTrigger>
        <SelectContent>
          {period.months.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label} ({formatYmd(item.from).slice(0, 5)} -{" "}
              {formatYmd(item.to).slice(0, 5)})
            </SelectItem>
          ))}
          <SelectItem value={CUSTOM}>Tự chọn khoảng ngày</SelectItem>
          <SelectSeparator />
          {ROLLING.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {period.isCustom ? (
        <>
          <Input
            type="date"
            aria-label="Từ ngày"
            className="w-40 bg-background"
            value={period.customFrom}
            onChange={(e) => period.setCustomFrom(e.target.value)}
          />
          <span className="text-sm text-muted-foreground">đến</span>
          <Input
            type="date"
            aria-label="Đến ngày"
            className="w-40 bg-background"
            value={period.customTo}
            onChange={(e) => period.setCustomTo(e.target.value)}
          />
        </>
      ) : null}
    </div>
  );
}
