"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  downloadAttachment,
  fetchOnlyOfficeConfig,
} from "@/features/uploads/api";
import { getApiErrorMessage } from "@/lib/api-client";

type DocEditorCtor = new (
  elementId: string,
  config: Record<string, unknown>,
) => { destroyEditor: () => void };

declare global {
  interface Window {
    DocsAPI?: { DocEditor: DocEditorCtor };
  }
}

/** Nạp api.js của Document Server đúng một lần cho cả trang. */
const scriptLoads = new Map<string, Promise<void>>();
function loadDocsApi(serverUrl: string): Promise<void> {
  const src = `${serverUrl}/web-apps/apps/api/documents/api.js`;
  if (window.DocsAPI) return Promise.resolve();
  let pending = scriptLoads.get(src);
  if (!pending) {
    pending = new Promise<void>((resolve, reject) => {
      const el = document.createElement("script");
      el.src = src;
      el.async = true;
      el.onload = () => resolve();
      el.onerror = () =>
        reject(
          new Error(
            "Không nạp được OnlyOffice - kiểm tra Docker container đang chạy và URL trong .env.",
          ),
        );
      document.head.appendChild(el);
    });
    scriptLoads.set(src, pending);
  }
  return pending;
}

type ViewerFile = { uploadId: string; name: string };

/**
 * Xem tệp Word / Excel / PowerPoint / PDF ngay trong trình duyệt bằng
 * OnlyOffice Document Server (Docker cạnh backend, chạy offline).
 *
 * Luồng: xin cấu hình từ backend → nạp api.js từ Document Server → dựng
 * editor chế độ chỉ xem. Document Server tự kéo tệp về qua vé HMAC ngắn hạn
 * backend đã gắn trong cấu hình, trình duyệt không phải gửi tệp đi đâu.
 */
export function OnlyOfficeViewer({
  file,
  onClose,
}: {
  file: ViewerFile | null;
  onClose: () => void;
}) {
  const download = async () => {
    if (!file) return;
    try {
      await downloadAttachment({
        id: file.uploadId,
        name: file.name,
        size: 0,
        mimeType: "",
      });
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Không tải được tệp."));
    }
  };

  return (
    <Dialog open={!!file} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex h-[92vh] w-[96vw] max-w-[96vw] flex-col gap-2 p-3 sm:max-w-[96vw]">
        <DialogHeader className="flex-row items-center justify-between gap-3 space-y-0 pr-8">
          <div className="min-w-0">
            <DialogTitle className="truncate text-base">
              {file?.name ?? ""}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Chỉ xem - tệp kiểm chứng là bản đã nộp, không sửa ở đây.
            </DialogDescription>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="bg-background"
            onClick={() => void download()}
          >
            <Download className="size-4" />
            Tải về
          </Button>
        </DialogHeader>

        {/* Khoá theo tệp: đổi tệp là dựng lại từ đầu, không giữ state cũ. */}
        {file ? (
          <ViewerBody
            key={file.uploadId}
            file={file}
            onDownload={() => void download()}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ViewerBody({
  file,
  onDownload,
}: {
  file: ViewerFile;
  onDownload: () => void;
}) {
  const holderId = useId();
  const editorRef = useRef<{ destroyEditor: () => void } | null>(null);
  const [state, setState] = useState<{
    loading: boolean;
    error: string | null;
  }>({ loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { documentServerUrl, config } = await fetchOnlyOfficeConfig(
          file.uploadId,
        );
        await loadDocsApi(documentServerUrl);
        if (cancelled || !window.DocsAPI) return;
        editorRef.current = new window.DocsAPI.DocEditor(holderId, {
          ...config,
          events: {
            onError: (event: { data?: { errorDescription?: string } }) =>
              setState({
                loading: false,
                error:
                  event?.data?.errorDescription ??
                  "OnlyOffice báo lỗi khi mở tệp.",
              }),
          },
        });
        setState({ loading: false, error: null });
      } catch (err) {
        if (cancelled) return;
        setState({
          loading: false,
          error:
            err instanceof Error && !("response" in err)
              ? err.message
              : getApiErrorMessage(err, "Không mở được tệp."),
        });
      }
    })();
    return () => {
      cancelled = true;
      editorRef.current?.destroyEditor();
      editorRef.current = null;
    };
  }, [file.uploadId, holderId]);

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden rounded-md border bg-muted/30">
      {state.loading ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-background/70 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Đang mở tệp...
        </div>
      ) : null}
      {state.error ? (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-background p-6 text-center">
          <p className="text-sm text-destructive">{state.error}</p>
          <Button type="button" variant="outline" onClick={onDownload}>
            <Download className="size-4" />
            Tải tệp về để xem
          </Button>
        </div>
      ) : null}
      {/* OnlyOffice thay thẻ này bằng iframe của nó. */}
      <div id={holderId} className="h-full w-full" />
    </div>
  );
}
