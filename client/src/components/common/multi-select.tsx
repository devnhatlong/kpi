"use client";

import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type MultiSelectOption = {
  value: string;
  label: string;
  /** Dòng phụ nhỏ dưới nhãn (đơn vị cha, mã…). */
  hint?: string;
  /** Chuỗi phụ để tìm. */
  keywords?: string;
  /** Bậc thụt đầu dòng khi bày dạng cây - 0 = gốc. */
  depth?: number;
  /**
   * false = chỉ là dòng tiêu đề nhánh (đơn vị cha ngoài cấp được chọn), không
   * tích được. Tích cha KHÔNG kéo theo con - mỗi dòng là một lựa chọn riêng.
   */
  selectable?: boolean;
};

type MultiSelectProps = {
  value: string[];
  /** Gọi mỗi lần tích / bỏ tích. */
  onValueChange: (value: string[]) => void;
  /** Gọi khi đóng danh sách - chỗ để lưu một lần thay vì từng cú tích. */
  onClose?: (value: string[]) => void;
  options: MultiSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
  triggerClassName?: string;
};

/**
 * Sổ chọn NHIỀU mục, tìm được - cùng khuôn với `SearchableSelect`.
 *
 * Mục đã chọn bày thành thẻ ngay trên ô bấm, có dấu x bỏ nhanh, để đứng ngoài
 * bảng nhìn là biết đã chọn những ai mà không phải mở sổ ra dò.
 */
export function MultiSelect({
  value,
  onValueChange,
  onClose,
  options,
  placeholder = "Chọn...",
  searchPlaceholder = "Tìm kiếm...",
  emptyText = "Không có kết quả.",
  disabled,
  invalid,
  className,
  triggerClassName,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const picked = useMemo(() => new Set(value), [value]);
  const byValue = useMemo(
    () => new Map(options.map((option) => [option.value, option])),
    [options],
  );

  const toggle = (item: string) => {
    const next = picked.has(item)
      ? value.filter((id) => id !== item)
      : [...value, item];
    onValueChange(next);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) onClose?.(value);
      }}
      modal
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid}
          disabled={disabled}
          className={cn(
            "h-auto min-h-9 w-full justify-between bg-background px-2 py-1 font-normal",
            !value.length && "text-muted-foreground",
            triggerClassName,
          )}
        >
          <span className="flex min-w-0 flex-1 flex-wrap gap-1">
            {value.length ? (
              value.map((item) => (
                <Badge
                  key={item}
                  variant="secondary"
                  className="max-w-full gap-1 whitespace-normal break-words font-normal"
                >
                  {byValue.get(item)?.label ?? item}
                  {disabled ? null : (
                    <span
                      role="button"
                      aria-label="Bỏ"
                      className="cursor-pointer rounded-sm opacity-60 hover:opacity-100"
                      onClick={(event) => {
                        event.stopPropagation();
                        const next = value.filter((id) => id !== item);
                        onValueChange(next);
                        if (!open) onClose?.(next);
                      }}
                    >
                      <X className="size-3" />
                    </span>
                  )}
                </Badge>
              ))
            ) : (
              <span className="truncate px-1 text-sm">{placeholder}</span>
            )}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className={cn(
          "w-[max(var(--radix-popover-trigger-width),20rem)] p-0",
          className,
        )}
        align="start"
      >
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const searchValue = [
                  option.label,
                  option.hint,
                  option.keywords,
                  option.value,
                ]
                  .filter(Boolean)
                  .join(" ");
                const on = picked.has(option.value);
                const selectable = option.selectable !== false;
                return (
                  <CommandItem
                    key={option.value}
                    value={searchValue}
                    disabled={!selectable}
                    className={cn(
                      "items-start gap-2",
                      selectable
                        ? "cursor-pointer"
                        : "cursor-default opacity-100 data-[disabled=true]:opacity-100",
                    )}
                    style={{
                      paddingLeft: `${0.5 + (option.depth ?? 0) * 1}rem`,
                    }}
                    onSelect={() => {
                      if (selectable) toggle(option.value);
                    }}
                  >
                    <Check
                      className={cn(
                        "mt-0.5 size-4 shrink-0",
                        on ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "block whitespace-normal break-words text-xs leading-snug",
                          !selectable && "font-medium text-muted-foreground",
                        )}
                      >
                        {option.label}
                      </span>
                      {option.hint ? (
                        <span className="block text-[11px] text-muted-foreground">
                          {option.hint}
                        </span>
                      ) : null}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
