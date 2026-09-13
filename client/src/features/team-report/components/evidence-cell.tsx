"use client";

import { useRef, useState } from "react";
import { Download, Loader2, Paperclip, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  ACCEPT_UPLOAD,
  MAX_UPLOAD_BYTES,
  downloadAttachment,
  uploadFile,
} from "@/features/uploads/api";
import type { TeamReportEvidence } from "@/features/team-report/types";
import { getApiErrorMessage } from "@/lib/api-client";
import { cn } from "@/lib/utils";

/** Tệp đã gắn - đủ để bày tên và tải về. */
export type EvidenceItem = Pick<TeamReportEvidence, "uploadId" | "name">;

type EvidenceCellProps = {
  items: EvidenceItem[];
  /** Không có = chỉ đọc (cấp trên xem, bản đã trình). */
  onChange?: (next: EvidenceItem[]) => void | Promise<void>;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
};

/**
 * Ô "Tài liệu kiểm chứng": danh sách tệp gắn với nhiệm vụ.
 *
 * Tệp đẩy lên module uploads (GridFS trên server - máy đích không có mạng nên
 * không có CDN), nhận id rồi lưu vào `task.evidence`. Tải về phải qua API có
 * token nên không dùng thẻ <a href> thẳng.
 */
export function EvidenceCell({
  items,
  onChange,
  disabled,
  invalid,
  className,
}: EvidenceCellProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const editable = Boolean(onChange) && !disabled;

  const pick = async (files: FileList | null) => {
    if (!files?.length || !onChange) return;
    const next = [...items];
    for (const file of Array.from(files)) {
      if (file.size > MAX_UPLOAD_BYTES) {
        toast.error(
          `"${file.name}" quá ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB.`,
        );
        continue;
      }
      setUploading(file.name);
      try {
        const saved = await uploadFile(file);
        next.push({ uploadId: saved.id, name: saved.name });
      } catch (error) {
        toast.error(
          getApiErrorMessage(error, `Không tải được "${file.name}".`),
        );
      } finally {
        setUploading(null);
      }
    }
    if (inputRef.current) inputRef.current.value = "";
    if (next.length !== items.length) await onChange(next);
  };

  const remove = async (uploadId: string) => {
    if (!onChange) return;
    await onChange(items.filter((item) => item.uploadId !== uploadId));
  };

  const download = async (item: EvidenceItem) => {
    setDownloading(item.uploadId);
    try {
      await downloadAttachment({
        id: item.uploadId,
        name: item.name,
        size: 0,
        mimeType: "",
      });
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không tải được tệp."));
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div
      className={cn(
        "space-y-1.5",
        invalid && "rounded-md ring-1 ring-destructive/40 p-1",
        className,
      )}
    >
      {items.length ? (
        <ul className="flex flex-wrap gap-1.5">
          {items.map((item) => (
            <li
              key={item.uploadId}
              className="flex max-w-full items-center gap-1 rounded-md border bg-background px-2 py-1 text-xs"
            >
              <button
                type="button"
                className="flex min-w-0 cursor-pointer items-center gap-1 hover:underline"
                title="Tải về"
                onClick={() => void download(item)}
                disabled={downloading === item.uploadId}
              >
                {downloading === item.uploadId ? (
                  <Loader2 className="size-3 shrink-0 animate-spin" />
                ) : (
                  <Download className="size-3 shrink-0 text-muted-foreground" />
                )}
                <span className="truncate">{item.name || item.uploadId}</span>
              </button>
              {editable ? (
                <button
                  type="button"
                  aria-label="Bỏ tệp"
                  className="cursor-pointer rounded-sm text-muted-foreground hover:text-destructive"
                  onClick={() => void remove(item.uploadId)}
                >
                  <X className="size-3" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : !editable ? (
        <span className="text-xs text-muted-foreground">Không có tệp</span>
      ) : null}

      {editable ? (
        <>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPT_UPLOAD}
            className="hidden"
            onChange={(event) => void pick(event.target.files)}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="bg-background"
            disabled={uploading !== null}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Paperclip className="size-3.5" />
            )}
            {uploading ? `Đang tải "${uploading}"…` : "Đính kèm tệp"}
          </Button>
        </>
      ) : null}
    </div>
  );
}
