"use client";

import { forwardRef, type ComponentProps } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type NumberInputProps = Omit<ComponentProps<typeof Input>, "type">;

/**
 * Ô nhập số của bảng báo cáo ngày.
 *
 * `type="number"` để có nút tăng giảm và bàn phím số trên điện thoại, nhưng nó
 * kèm một cái bẫy: khi ô đang được chọn, LĂN CHUỘT sẽ đổi giá trị. Trong bảng
 * dài thì người dùng cuộn trang là sửa nhầm số mà không hề biết. Vì vậy nhả
 * chọn ngay khi có thao tác lăn - cuộn trang vẫn bình thường, số không đổi.
 *
 * `[appearance:textfield]` chỉ ẩn nút tăng giảm mặc định xấu của Firefox; hai
 * nút của Chrome vẫn giữ vì đó chính là thứ người dùng đang đòi.
 */
export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(
  function NumberInput({ className, onWheel, ...props }, ref) {
    return (
      <Input
        ref={ref}
        type="number"
        inputMode="decimal"
        className={cn("bg-background", className)}
        onWheel={(event) => {
          event.currentTarget.blur();
          onWheel?.(event);
        }}
        {...props}
      />
    );
  },
);
