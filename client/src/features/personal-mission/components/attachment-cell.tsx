"use client";

import { useRef, useState } from "react";
import { Download, Inbox, Loader2, Paperclip, X } from "lucide-react";
import useSWR from "swr";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  MAX_EVIDENCE_FILES,
  MAX_UPLOAD_BYTES,
  acceptFor,
  classificationError,
  downloadAttachment,
  uploadFile,
  type DocumentClassification,
} from "@/features/uploads/api";
import {
  ClassificationBadge,
  ClassificationSelect,
} from "@/features/uploads/components/classification-select";
import type { TaskAttachment } from "@/features/personal-mission/types";
import {
  canOpenInOnlyOffice,
  fetchOnlyOfficeStatus,
} from "@/features/uploads/api";
import { OnlyOfficeViewer } from "@/features/uploads/components/onlyoffice-viewer";
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
  /** Vùng kéo thả thay cho nút chọn tệp - dùng ở màn cập nhật tiến độ. */
  dropzone?: boolean;
  /** Chữ trong vùng kéo thả. */
  dropzoneHint?: string;
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
  dropzone = false,
  dropzoneHint = "Kéo thả hoặc bấm để đính kèm minh chứng",
}: AttachmentCellProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  /** Phần trăm thật của tệp đang tải; null = không có tệp nào đang tải. */
  const [percent, setPercent] = useState<number | null>(null);
  const [viewing, setViewing] = useState<TaskAttachment | null>(null);
  const [classification, setClassification] =
    useState<DocumentClassification | null>(null);
  const onlyOffice = useSWR("onlyoffice-status", fetchOnlyOfficeStatus, {
    revalidateOnFocus: false,
    dedupingInterval: 5 * 60_000,
  });
  const viewable = (item: TaskAttachment) =>
    onlyOffice.data?.enabled === true && canOpenInOnlyOffice(item.name);

  const full = files.length >= MAX_EVIDENCE_FILES;

  /**
   * Mỗi lần một văn bản, độ mật chọn riêng cho văn bản đó: tải xong thì xoá
   * lựa chọn để văn bản sau phải chọn lại, không vô tình mang độ mật cũ.
   * Kéo thả nhiều tệp thì báo lỗi, không lặng lẽ lấy tệp đầu.
   */
  const pickFiles = async (fileList: FileList | null) => {
    if (inputRef.current) inputRef.current.value = "";
    if (!fileList?.length || !classification) return;
    if (fileList.length > 1) {
      toast.error("Mỗi lần chỉ đính kèm một văn bản.");
      return;
    }
    if (full) {
      toast.error(`Chỉ được đính kèm tối đa ${MAX_EVIDENCE_FILES} văn bản.`);
      return;
    }

    const file = fileList[0];
    const wrongType = classificationError(file, classification);
    if (wrongType) {
      toast.error(wrongType);
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error(
        `"${file.name}" nặng ${formatFileSize(file.size)}, vượt mức ${formatFileSize(MAX_UPLOAD_BYTES)}.`,
      );
      return;
    }

    setUploading(true);
    setPercent(0);
    try {
      const saved = await uploadFile(file, classification, setPercent);
      onChange([...files, saved]);
      setClassification(null);
      toast.success("Đã tải văn bản lên.");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Tải tệp lên thất bại."));
    } finally {
      setUploading(false);
      setPercent(null);
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
      {!readOnly && full ? (
        <p className="text-xs text-muted-foreground">
          Đã đủ {MAX_EVIDENCE_FILES} văn bản - bỏ bớt một văn bản để đính kèm
          văn bản khác.
        </p>
      ) : null}
      {!readOnly && !full ? (
        <ClassificationSelect
          value={classification}
          onChange={setClassification}
          disabled={uploading}
          action={
            /* Nút nhỏ thì nằm cùng hàng với ô độ mật; vùng kéo thả to nên
               vẫn để xuống dưới. Chưa chọn độ mật thì chưa hiện. */
            classification && !dropzone ? (
              <Button
                type="button"
                variant="outline"
                className="h-8 px-2 py-0 text-xs"
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
                  : `Chọn văn bản (${files.length}/${MAX_EVIDENCE_FILES})`}
              </Button>
            ) : null
          }
        />
      ) : null}
      {!readOnly && !full && classification ? (
        <>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            accept={acceptFor(classification)}
            onChange={(e) => void pickFiles(e.target.files)}
          />
          {dropzone ? (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                void pickFiles(e.dataTransfer.files);
              }}
              disabled={uploading}
              className={cn(
                "flex w-full flex-col items-center gap-1.5 rounded-lg border border-dashed bg-muted/20 px-3 py-6 text-center text-xs text-muted-foreground transition-colors",
                "hover:border-primary/50 hover:bg-primary/5",
                dragOver && "border-primary bg-primary/5",
                uploading && "cursor-not-allowed opacity-70",
              )}
            >
              {uploading ? (
                <Loader2 className="size-5 animate-spin" />
              ) : (
                <Inbox className="size-5" strokeWidth={1.5} />
              )}
              {uploading
                ? percent === null
                  ? "Đang tải..."
                  : `Đang tải ${percent}%`
                : dropzoneHint}
            </button>
          ) : null}
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
                title={`${viewable(file) ? "Xem" : "Tải về"} ${file.name} (${formatFileSize(file.size)})`}
                onClick={() =>
                  viewable(file) ? setViewing(file) : void download(file)
                }
              >
                {file.name}
              </button>
              <ClassificationBadge value={file.classification} />
              {viewable(file) ? (
                <button
                  type="button"
                  aria-label="Tải về"
                  title="Tải về"
                  className="mt-0.5 shrink-0 cursor-pointer text-muted-foreground hover:text-foreground"
                  onClick={() => void download(file)}
                >
                  <Download className="h-3.5 w-3.5" />
                </button>
              ) : null}
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
      <OnlyOfficeViewer
        file={viewing ? { uploadId: viewing.id, name: viewing.name } : null}
        onClose={() => setViewing(null)}
      />
    </div>
  );
}
