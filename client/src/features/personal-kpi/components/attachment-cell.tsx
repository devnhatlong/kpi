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
import type { TaskAttachment } from "@/features/personal-kpi/types";
import { getApiErrorMessage } from "@/lib/api-client";

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type AttachmentCellProps = {
  files: TaskAttachment[];
  onChange: (next: TaskAttachment[]) => void;
  readOnly?: boolean;
  label: string;
};

/**
 * Ô của cột kiểu "Tệp đính kèm".
 * Tệp được tải lên ngay khi chọn, nhiệm vụ chỉ giữ id trả về - nên bấm Lưu hay
 * không thì tệp cũng đã nằm trên máy chủ, không phụ thuộc vòng đời form.
 */
export function AttachmentCell({
  files,
  onChange,
  readOnly = false,
  label,
}: AttachmentCellProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  /** Phần trăm thật của tệp đang tải; null = không có tệp nào đang tải. */
  const [percent, setPercent] = useState<number | null>(null);

  const pickFiles = async (fileList: FileList | null) => {
    if (!fileList?.length) return;

    const chosen = Array.from(fileList);
    const tooBig = chosen.find((file) => file.size > MAX_UPLOAD_BYTES);
    if (tooBig) {
      toast.error(
        `"${tooBig.name}" nặng ${formatFileSize(tooBig.size)}, vượt mức ${formatFileSize(MAX_UPLOAD_BYTES)}.`,
      );
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    setUploading(true);
    const uploaded: TaskAttachment[] = [];
    try {
      // Tải tuần tự để lỗi ở tệp nào thì biết đúng tệp đó.
      for (const file of chosen) {
        setPercent(0);
        uploaded.push(await uploadFile(file, setPercent));
      }
      onChange([...files, ...uploaded]);
      toast.success(
        uploaded.length > 1
          ? `Đã tải lên ${uploaded.length} tệp.`
          : "Đã tải tệp lên.",
      );
    } catch (error) {
      // Giữ lại những tệp đã lên trước khi lỗi, người dùng khỏi tải lại từ đầu.
      if (uploaded.length) onChange([...files, ...uploaded]);
      toast.error(getApiErrorMessage(error, "Tải tệp lên thất bại."));
    } finally {
      setUploading(false);
      setPercent(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const download = async (item: TaskAttachment) => {
    try {
      await downloadAttachment(item);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không tải được tệp."));
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      {!readOnly ? (
        <>
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            accept={ACCEPT_UPLOAD}
            onChange={(e) => void pickFiles(e.target.files)}
          />
          <Button
            type="button"
            variant="outline"
            className="h-8 w-full justify-start px-2 py-0 text-xs"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Paperclip className="h-3.5 w-3.5" />
            )}
            {uploading
              ? percent === null
                ? "Đang tải..."
                : `Đang tải ${percent}%`
              : "Chọn tệp"}
          </Button>
          {uploading && percent !== null ? (
            <div className="h-1 w-full overflow-hidden rounded bg-muted">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${percent}%` }}
              />
            </div>
          ) : null}
        </>
      ) : null}

      {files.length > 0 ? (
        <ul className="space-y-1">
          {files.map((file) => (
            <li
              key={file.id}
              className="flex items-start gap-1 rounded border bg-muted/30 px-1.5 py-1 text-xs"
            >
              <button
                type="button"
                className="min-w-0 flex-1 break-all text-left leading-snug hover:underline"
                title={`Tải về ${file.name} (${formatFileSize(file.size)})`}
                onClick={() => void download(file)}
              >
                {file.name}
              </button>
              {readOnly ? (
                <Download className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              ) : (
                <button
                  type="button"
                  className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-background hover:text-destructive"
                  onClick={() =>
                    onChange(files.filter((item) => item.id !== file.id))
                  }
                  aria-label={`Gỡ ${file.name} khỏi ${label}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : readOnly ? (
        <span className="text-xs text-muted-foreground">-</span>
      ) : null}
    </div>
  );
}
