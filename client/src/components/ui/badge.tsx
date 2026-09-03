import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/*
  KHÔNG có hiệu ứng hover.

  Badge ở đây luôn là một `div` nhãn, không chỗ nào bấm được (không có `onClick`
  nào trong cả dự án). Đổi màu khi rê chuột là hứa một cú bấm không tồn tại.

  Nó còn phá màu thật: chỗ nào truyền màu riêng qua `className` (nhãn trạng thái
  vàng/xanh/đỏ) thì `hover:bg-*` của biến thể vẫn thắng ở trạng thái hover, nhãn
  đang vàng bị nhạt về xám ngay lúc rê qua.
*/
const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground shadow",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground shadow",
        outline: "text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
