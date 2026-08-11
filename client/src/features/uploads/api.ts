import { api } from "@/lib/api-client";
import type { TaskAttachment } from "@/features/personal-kpi/types";

type ApiEnvelope<T> = { message: string; data: T };

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export const ACCEPT_UPLOAD =
  ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.png,.jpg,.jpeg,.gif,.webp,.zip,.rar,.7z";

/**
 * Tải một tệp lên, trả về bản ghi để gắn vào nhiệm vụ.
 * Không đặt Content-Type - để trình duyệt tự sinh boundary cho multipart.
 *
 * `onProgress` nhận phần trăm thật từ axios, không phải thanh chạy giả.
 */
export async function uploadFile(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<TaskAttachment> {
  const form = new FormData();
  form.append("file", file);

  const { data } = await api.post<ApiEnvelope<TaskAttachment>>(
    "/uploads",
    form,
    {
      headers: { "Content-Type": undefined },
      onUploadProgress: (event) => {
        if (!onProgress || !event.total) return;
        onProgress(Math.round((event.loaded / event.total) * 100));
      },
    },
  );
  return data.data;
}

/**
 * Tải tệp về. Endpoint cần Bearer token nên không mở thẳng bằng thẻ <a>;
 * phải lấy blob rồi mới cho trình duyệt lưu.
 */
export async function downloadAttachment(item: TaskAttachment) {
  const response = await api.get<Blob>(`/uploads/${item.id}`, {
    responseType: "blob",
  });

  const url = URL.createObjectURL(response.data);
  const link = document.createElement("a");
  link.href = url;
  link.download = item.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
