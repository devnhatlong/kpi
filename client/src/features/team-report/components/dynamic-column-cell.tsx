"use client";

import { useState } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePickerInput } from "@/components/common/date-picker-input";
import { NumberInput } from "@/features/team-report/components/number-input";
import type {
  TeamReportCatalogItem,
  TeamReportCatalogs,
  TeamReportColumn,
} from "@/features/team-report/types";
import { catalogOfColumn } from "@/features/team-report/types";

type DynamicColumnCellProps = {
  column: TeamReportColumn;
  /** Giá trị hiện tại: chuỗi/số cho cột thường, id cho cột danh mục. */
  value: string;
  /** Danh mục cho cột kiểu chọn, do server gửi kèm bảng phân loại. */
  catalogs: TeamReportCatalogs;
  disabled?: boolean;
  /** Gọi khi giá trị thật sự chốt - rời ô với cột gõ, chọn xong với dropdown. */
  onCommit: (next: string) => void;
};

/**
 * Một ô nhập dựng theo cấu hình cột của quản trị.
 *
 * Mỗi trục dùng một mẫu bảng riêng nên không thể dựng sẵn ô cứng: kiểu dữ liệu,
 * danh mục lấy từ đâu, có bắt buộc hay không đều nằm trong cấu hình. Ô ở đây chỉ
 * đọc cấu hình rồi dựng đúng thứ được khai.
 *
 * Cột `autoValue` là cột hệ thống tự tính (điểm quy đổi theo phần trăm...) nên
 * chỉ bày, không cho gõ - gõ vào cũng bị server bỏ qua.
 */
export function DynamicColumnCell({
  column,
  value,
  catalogs,
  disabled,
  onCommit,
}: DynamicColumnCellProps) {
  const catalog = catalogOfColumn(column);

  if (column.autoValue) {
    return (
      <span className="text-sm text-muted-foreground tabular-nums">
        {value || "—"}
      </span>
    );
  }

  if (catalog) {
    const items: TeamReportCatalogItem[] = catalogs[catalog] ?? [];
    return (
      <Select
        value={value || "__none__"}
        disabled={disabled}
        onValueChange={(next) => onCommit(next === "__none__" ? "" : next)}
      >
        <SelectTrigger className="w-full bg-background">
          <SelectValue placeholder="Chọn" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">Chưa chọn</SelectItem>
          {items.map((item) => (
            <SelectItem key={item._id} value={item._id}>
              {item.name}
              {item.minScore !== undefined && item.maxScore !== undefined
                ? ` (${item.minScore}–${item.maxScore})`
                : ""}
              {item.percent !== undefined ? ` (${item.percent}%)` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  if (column.dataType === "boolean") {
    return (
      <Checkbox
        checked={value === "1"}
        disabled={disabled}
        aria-label={column.title}
        onCheckedChange={(checked) => onCommit(checked ? "1" : "")}
      />
    );
  }

  return (
    <FreeTextCell
      column={column}
      value={value}
      disabled={disabled}
      onCommit={onCommit}
    />
  );
}

/**
 * Ô gõ tay: giữ bản nháp cục bộ, chỉ gửi đi khi rời ô.
 *
 * Gửi theo từng phím gõ thì mỗi ký tự là một lượt API, mà số bản của dòng cũng
 * tăng theo từng lượt - người đang gõ ở dòng khác sẽ liên tục bị báo "vừa có
 * người sửa".
 */
function FreeTextCell({
  column,
  value,
  disabled,
  onCommit,
}: Omit<DynamicColumnCellProps, "catalogs">) {
  const [draft, setDraft] = useState(value);

  const commit = () => {
    if (draft === value) return;
    onCommit(draft);
  };

  if (column.dataType === "number") {
    return (
      <NumberInput
        value={draft}
        disabled={disabled}
        step="any"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
      />
    );
  }

  if (column.dataType === "date") {
    /*
      Lịch chốt ngay khi chọn, không chờ rời ô: dropdown đóng lại là xong thao
      tác, mà "rời ô" của một popover thì không có mốc rõ ràng.
    */
    return (
      <DatePickerInput
        value={value}
        disabled={disabled}
        onChange={onCommit}
        placeholder={column.title}
      />
    );
  }

  return (
    <Input
      value={draft}
      disabled={disabled}
      className="bg-background"
      placeholder={column.title}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
    />
  );
}
