"use client";

import { CornerUpLeft } from "lucide-react";

import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { ReturnTarget, StageReturn } from "@/features/team-report/stages";
import { cn } from "@/lib/utils";

/**
 * Chọn trả lại về đâu - chỉ bày cho người DUYỆT CUỐI của bản 2 cấp đã qua cấp
 * 1 (`canReturnToPrevious` từ server). Các trường hợp khác không có lựa chọn:
 * bản về đơn vị lập như trước.
 */
export function ReturnTargetPicker({
  value,
  onChange,
  creatorName,
  previousName,
  className,
}: {
  value: ReturnTarget;
  onChange: (value: ReturnTarget) => void;
  /** Đơn vị lập bản - "trả về người gửi". */
  creatorName?: string;
  /** Người duyệt cấp 1 - "trả về người liền trước". */
  previousName?: string;
  className?: string;
}) {
  const options: Array<{ value: ReturnTarget; title: string; hint: string }> = [
    {
      value: "PREVIOUS",
      title: `Trả về người duyệt liền trước${previousName ? ` (${previousName})` : ""}`,
      hint: "Bản quay lại chờ cấp 1 duyệt - cấp 1 chỉnh rồi duyệt lại, hoặc trả tiếp xuống đơn vị lập.",
    },
    {
      value: "CREATOR",
      title: `Trả về đơn vị lập${creatorName ? ` (${creatorName})` : ""}`,
      hint: "Đơn vị sửa rồi trình lại, đi lại từ cấp 1.",
    },
  ];

  return (
    <div className={cn("space-y-2", className)}>
      <Label>Trả lại về</Label>
      <RadioGroup
        value={value}
        onValueChange={(next) => onChange(next as ReturnTarget)}
        className="gap-2"
      >
        {options.map((option) => (
          <label
            key={option.value}
            htmlFor={`return-to-${option.value}`}
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm transition-colors",
              value === option.value
                ? "border-primary bg-primary/5"
                : "hover:bg-muted/50",
            )}
          >
            <RadioGroupItem
              id={`return-to-${option.value}`}
              value={option.value}
              className="mt-0.5"
            />
            <span className="space-y-0.5">
              <span className="block font-medium">{option.title}</span>
              <span className="block text-xs text-muted-foreground">
                {option.hint}
              </span>
            </span>
          </label>
        ))}
      </RadioGroup>
    </div>
  );
}

/**
 * Báo cho người duyệt cấp 1 biết bản này vừa bị DUYỆT CUỐI trả về - kèm lý do,
 * để khỏi phải mở nhật ký mới hiểu vì sao bản lại nằm trong hộp chờ duyệt.
 */
export function StageReturnNotice({
  info,
  className,
}: {
  info: StageReturn | null | undefined;
  className?: string;
}) {
  if (!info) return null;
  const at = new Date(info.at);
  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100",
        className,
      )}
    >
      <CornerUpLeft className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p>
        <span className="font-medium">{info.byName || "Duyệt cuối"}</span> trả
        về để bạn xem lại
        {Number.isNaN(at.getTime())
          ? ""
          : ` lúc ${at.toLocaleString("vi-VN", { hour12: false })}`}
        : <span className="font-medium">{info.reason}</span>
      </p>
    </div>
  );
}
