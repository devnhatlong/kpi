"use client";

import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";

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

export type SearchableSelectOption = {
  value: string;
  label: string;
  /** Chuỗi phụ để tìm (mã, alias…) */
  keywords?: string;
};

type SearchableSelectProps = {
  value: string;
  onValueChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
};

export function SearchableSelect({
  value,
  onValueChange,
  options,
  placeholder = "Chọn...",
  searchPlaceholder = "Tìm kiếm...",
  emptyText = "Không có kết quả.",
  disabled,
  className,
  triggerClassName,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);

  const selected = useMemo(
    () => options.find((option) => option.value === value),
    [options, value],
  );

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full justify-between font-normal",
            !selected && "text-muted-foreground",
            triggerClassName,
          )}
        >
          <span className="truncate">{selected?.label ?? placeholder}</span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      {/*
        Danh sách rộng hơn ô bấm và cho xuống dòng: nhiệm vụ trong bảng nhiệm vụ là
        cả đoạn văn, cắt cụt một dòng thì mấy mục đầu giống hệt nhau, không
        phân biệt nổi mục nào với mục nào.
      */}
      <PopoverContent
        className={cn(
          "w-[max(var(--radix-popover-trigger-width),22rem)] p-0",
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
                  option.keywords,
                  option.value,
                ]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <CommandItem
                    key={option.value}
                    value={searchValue}
                    className="cursor-pointer items-start gap-2"
                    onSelect={() => {
                      onValueChange(option.value);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mt-0.5 size-4 shrink-0",
                        value === option.value ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="min-w-0 flex-1 whitespace-normal break-words text-xs leading-snug">
                      {option.label}
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
