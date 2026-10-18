import { cn } from "@/lib/utils";

/**
 * Huy hiệu số đếm kiểu thông báo: chữ trắng trên nền đỏ, đặt cạnh nhãn tab /
 * mục menu có dữ liệu cần để ý. Số 0 (hoặc chưa có) thì không vẽ gì - một
 * chấm đỏ ghi "0" chỉ làm người ta tưởng có việc.
 */
export function CountBadge({
  count,
  className,
  label,
}: {
  count: number | null | undefined;
  className?: string;
  /** Câu cho trình đọc màn hình, VD "3 bảng chờ duyệt". */
  label?: string;
}) {
  if (!count || count <= 0) return null;
  return (
    <span
      aria-label={label ?? `${count}`}
      className={cn(
        "ml-1.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1.5 text-[11px] font-semibold leading-none text-white tabular-nums",
        className,
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
