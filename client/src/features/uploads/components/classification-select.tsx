"use client";

import { useId } from "react";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  DOCUMENT_CLASSIFICATIONS,
  classificationLabel,
  requiresEncryptedFile,
  type DocumentClassification,
} from "@/features/uploads/api";

/** Nhãn độ mật cạnh tên tệp. Tệp cũ chưa có độ mật thì không hiện gì. */
export function ClassificationBadge({ value }: { value?: string | null }) {
  const label = classificationLabel(value);
  if (!label) return null;
  const secret = value !== "THUONG";
  return (
    <span
      className={cn(
        "shrink-0 rounded-sm border px-1 py-px text-[10px] font-medium leading-none",
        secret
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : "border-border bg-muted text-muted-foreground",
      )}
    >
      {label}
    </span>
  );
}

type ClassificationSelectProps = {
  value: DocumentClassification | null;
  onChange: (value: DocumentClassification) => void;
  disabled?: boolean;
  className?: string;
  /** Nút đính kèm - nằm cùng hàng với ô chọn, câu nhắc xuống dưới cả hàng. */
  action?: React.ReactNode;
};

/**
 * "Độ mật *" - bắt buộc chọn trước khi được đính kèm tệp.
 * Chọn từ Mật trở lên thì chỉ nhận tệp .bm3; câu nhắc hiện ngay dưới ô.
 */
export function ClassificationSelect({
  value,
  onChange,
  disabled,
  className,
  action,
}: ClassificationSelectProps) {
  const id = useId();
  return (
    <div className={cn("space-y-1", className)}>
      <Label htmlFor={id} className="text-xs">
        Độ mật <span className="text-destructive">*</span>
      </Label>
      <div className="flex items-center gap-2">
        <Select
          value={value ?? ""}
          onValueChange={(next) => onChange(next as DocumentClassification)}
          disabled={disabled}
        >
          <SelectTrigger id={id} className="h-8 w-full max-w-xs text-xs">
            <SelectValue placeholder="Chọn độ mật" />
          </SelectTrigger>
          <SelectContent>
            {DOCUMENT_CLASSIFICATIONS.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {value === null ? (
        <p className="text-xs text-amber-500">
          Chọn độ mật trước khi đính kèm tệp
        </p>
      ) : requiresEncryptedFile(value) ? (
        <p className="text-xs text-muted-foreground">
          Chỉ nhận tệp đã mã hoá .bm3
        </p>
      ) : null}
    </div>
  );
}
