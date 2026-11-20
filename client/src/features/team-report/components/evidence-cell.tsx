"use client";

import { useRef, useState } from "react";
import { Download, Eye, Loader2, Paperclip, X } from "lucide-react";
import useSWR from "swr";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  MAX_EVIDENCE_FILES,
  MAX_UPLOAD_BYTES,
  acceptFor,
  canOpenInOnlyOffice,
  classificationError,
  downloadAttachment,
  fetchOnlyOfficeStatus,
  uploadFile,
  type DocumentClassification,
} from "@/features/uploads/api";
import {
  ClassificationBadge,
  ClassificationSelect,
} from "@/features/uploads/components/classification-select";
import { OnlyOfficeViewer } from "@/features/uploads/components/onlyoffice-viewer";
import type { TeamReportEvidence } from "@/features/team-report/types";
import { getApiErrorMessage } from "@/lib/api-client";
import { cn } from "@/lib/utils";

/** Tệp đã gắn - đủ để bày tên và tải về. */
export type EvidenceItem = Pick<
  TeamReportEvidence,
  "uploadId" | "name" | "classification"
>;

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
  const [viewing, setViewing] = useState<EvidenceItem | null>(null);
  const [classification, setClassification] =
    useState<DocumentClassification | null>(null);
  const editable = Boolean(onChange) && !disabled;
  /* Có Document Server thì bấm tên là mở xem tại chỗ; không có thì tải về. */
  const onlyOffice = useSWR("onlyoffice-status", fetchOnlyOfficeStatus, {
    revalidateOnFocus: false,
    dedupingInterval: 5 * 60_000,
  });
  const viewable = (item: EvidenceItem) =>
    onlyOffice.data?.enabled === true && canOpenInOnlyOffice(item.name);

  const full = items.length >= MAX_EVIDENCE_FILES;

  /**
   * Mỗi lần một văn bản, độ mật chọn riêng cho văn bản đó: tải xong thì xoá
   * lựa chọn để văn bản sau phải chọn lại, không vô tình mang độ mật cũ.
   */
  const pick = async (files: FileList | null) => {
    const file = files?.[0];
    if (inputRef.current) inputRef.current.value = "";
    if (!file || !onChange || !classification) return;
    if (full) {
      toast.error(`Chỉ được đính kèm tối đa ${MAX_EVIDENCE_FILES} văn bản.`);
      return;
    }
    const wrongType = classificationError(file, classification);
    if (wrongType) {
      toast.error(wrongType);
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error(
        `"${file.name}" quá ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB.`,
      );
      return;
    }
    setUploading(file.name);
    try {
      const saved = await uploadFile(file, classification);
      await onChange([
        ...items,
        {
          uploadId: saved.id,
          name: saved.name,
          classification: saved.classification ?? classification,
        },
      ]);
      setClassification(null);
    } catch (error) {
      toast.error(getApiErrorMessage(error, `Không tải được "${file.name}".`));
    } finally {
      setUploading(null);
    }
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
                title={viewable(item) ? "Xem tại chỗ" : "Tải về"}
                onClick={() =>
                  viewable(item) ? setViewing(item) : void download(item)
                }
                disabled={downloading === item.uploadId}
              >
                {downloading === item.uploadId ? (
                  <Loader2 className="size-3 shrink-0 animate-spin" />
                ) : viewable(item) ? (
                  <Eye className="size-3 shrink-0 text-muted-foreground" />
                ) : (
                  <Download className="size-3 shrink-0 text-muted-foreground" />
                )}
                <span className="truncate">{item.name || item.uploadId}</span>
              </button>
              <ClassificationBadge value={item.classification} />
              {viewable(item) ? (
                <button
                  type="button"
                  aria-label="Tải về"
                  title="Tải về"
                  className="cursor-pointer rounded-sm text-muted-foreground hover:text-foreground"
                  onClick={() => void download(item)}
                >
                  <Download className="size-3" />
                </button>
              ) : null}
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

      {editable && full ? (
        <p className="text-xs text-muted-foreground">
          Đã đủ {MAX_EVIDENCE_FILES} văn bản - bỏ bớt một văn bản để đính kèm
          văn bản khác.
        </p>
      ) : null}

      {editable && !full ? (
        <ClassificationSelect
          value={classification}
          onChange={setClassification}
          disabled={uploading !== null}
          action={
            /* Chưa chọn độ mật thì chưa hiện chỗ đính kèm. */
            classification ? (
              <>
                <input
                  ref={inputRef}
                  type="file"
                  accept={acceptFor(classification)}
                  className="hidden"
                  onChange={(event) => void pick(event.target.files)}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 bg-background"
                  disabled={uploading !== null}
                  onClick={() => inputRef.current?.click()}
                >
                  {uploading ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Paperclip className="size-3.5" />
                  )}
                  {uploading
                    ? `Đang tải "${uploading}"…`
                    : `Đính kèm văn bản (${items.length}/${MAX_EVIDENCE_FILES})`}
                </Button>
              </>
            ) : null
          }
        />
      ) : null}

      <OnlyOfficeViewer file={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}
