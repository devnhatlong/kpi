"use client";

import { useEffect, useRef, type ComponentProps } from "react";

import { cn } from "@/lib/utils";

/**
 * Ô chữ tự cao dần theo nội dung, quá 4 dòng thì cuộn trong ô.
 *
 * Cột "Nhiệm vụ", "Ghi chú"... hay dài mà ô một dòng thì gõ tới đâu chữ trôi
 * khỏi tầm nhìn tới đó, không đọc lại được thứ vừa viết.
 *
 * Dùng chung cho mọi bảng nhập dựng theo mẫu - thẻ nhập nhiệm vụ và bảng khối
 * A. Để mỗi nơi tự dựng một ô chữ thì cùng một kiểu dữ liệu "Văn bản" lại hành
 * xử khác nhau tuỳ chỗ.
 */
export function AutoGrowTextarea({
  className,
  value,
  ...props
}: ComponentProps<"textarea">) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    // Hạ về auto trước rồi mới đo, không thì xoá chữ ô vẫn giữ chiều cao cũ.
    node.style.height = "auto";
    const borders = node.offsetHeight - node.clientHeight;
    node.style.height = `${node.scrollHeight + borders}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      className={cn(
        // min-h-8 cho bằng chiều cao ô một dòng của các cột khác; max-h-24 là
        // trần ~4 dòng, quá thì cuộn trong ô chứ không đẩy cả hàng dài ra.
        "flex min-h-8 max-h-24 w-full resize-none overflow-y-auto rounded-md border border-input bg-transparent px-2 py-1 text-sm leading-5 shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
