/**
 * Trạng thái duyệt tại cấp đang giữ nhiệm vụ - khớp `reviewStatus` bên server.
 * - DRAFT    : còn ở chỗ mình, chưa gửi
 * - PENDING  : đã gửi, đang chờ người nhận duyệt
 * - APPROVED : cấp đang giữ đã duyệt
 * - RETURNED : bị trả lại, quay về chỗ người gửi để sửa
 */
export type PersonalKpiStatus =
  | "DRAFT"
  | "PENDING"
  | "APPROVED"
  | "RETURNED"
  | "COMPLETED";

export const PERSONAL_KPI_STATUSES: PersonalKpiStatus[] = [
  "DRAFT",
  "PENDING",
  "APPROVED",
  "RETURNED",
  "COMPLETED",
];

export const PERSONAL_KPI_STATUS_LABEL: Record<PersonalKpiStatus, string> = {
  DRAFT: "Nháp",
  PENDING: "Chờ duyệt",
  APPROVED: "Đã duyệt",
  RETURNED: "Trả lại",
  COMPLETED: "Hoàn thành",
};

/**
 * Chỉ nháp / trả lại mới sửa, gửi, xoá được.
 * Trả lại một nhiệm vụ KHÔNG khoá các nhiệm vụ khác cùng ngày - cán bộ vẫn
 * thêm và gửi việc mới bình thường.
 */
export function canEditPersonalKpi(status: PersonalKpiStatus) {
  return status === "DRAFT" || status === "RETURNED";
}

export function canSendPersonalKpi(status: PersonalKpiStatus) {
  return status === "DRAFT" || status === "RETURNED";
}

export function canDeletePersonalKpi(status: PersonalKpiStatus) {
  return status === "DRAFT" || status === "RETURNED";
}

/**
 * Cập nhật tiến độ hằng ngày rộng hơn sửa nội dung: việc đã gửi lên trên vẫn
 * cập nhật được, chỉ dừng khi cấp trên đã chốt hoàn thành.
 */
export function canUpdateProgress(status: PersonalKpiStatus) {
  return status !== "COMPLETED";
}

/** Một tệp đã tải lên - `id` là bản ghi upload trên server. */
export type TaskAttachment = {
  id: string;
  name: string;
  size: number;
  mimeType: string;
};

export type PersonalTaskDraft = {
  /** client-only id for list keys */
  key: string;
  /** Giá trị mọi cột chữ/số của mẫu bảng, key = FormTemplateColumn.key. */
  fieldValues: Record<string, string>;
  /**
   * Id đã chọn ở các cột lấy từ danh mục, key = FormTemplateColumn.key.
   * Theo khoá cột chứ không theo loại danh mục, để hai cột cùng lấy một danh
   * mục vẫn giữ được hai giá trị khác nhau.
   */
  catalogValues: Record<string, string>;
  /** Tệp của các cột kiểu "Tệp đính kèm", key = FormTemplateColumn.key. */
  attachments: Record<string, TaskAttachment[]>;
};

/** Bản ghi nhiệm vụ KPI cá nhân trên danh sách. */
export type PersonalKpiItem = {
  id: string;
  status: PersonalKpiStatus;
  /** 0 = còn ở chỗ cán bộ, 1 = đang ở cấp thứ nhất... */
  holderLevel: number;
  axisId: string;
  axisName: string;
  workContentId: string;
  workContentName: string;
  workContentCode: string;
  task: PersonalTaskDraft;
  createdAt: string;
  updatedAt: string;
  /** Thời điểm gửi gần nhất */
  sentAt?: string;
  /** Lần cập nhật tiến độ gần nhất - căn cứ tính "im lặng N ngày". */
  lastProgressAt?: string;
  ownerId?: string;
  ownerName?: string;
  recipientId?: string;
  recipientName?: string;
  sendNote?: string;
  /** Lý do cấp trên trả lại - do người duyệt gõ, không phải cảnh báo hệ thống. */
  rejectReason?: string;
  decidedByName?: string;
  decidedAt?: string;
};

/** Chỉ nhiệm vụ đang chờ duyệt mới duyệt / trả lại được. */
export function canApprovePersonalKpi(status: PersonalKpiStatus) {
  return status === "PENDING";
}

/** Đã duyệt hoặc bị trả lại ở cấp trên thì gửi tiếp lên được. */
export function canForwardPersonalKpi(
  status: PersonalKpiStatus,
  holderLevel: number,
) {
  return holderLevel >= 1 && (status === "APPROVED" || status === "RETURNED");
}

/** Chốt hoàn thành được khi việc đang ở chỗ mình và chưa chốt. */
export function canCompletePersonalKpi(status: PersonalKpiStatus) {
  return status === "PENDING" || status === "APPROVED";
}

function localKey(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createEmptyTask(_index = 1): PersonalTaskDraft {
  return {
    key: localKey("task"),
    fieldValues: {},
    catalogValues: {},
    attachments: {},
  };
}

/**
 * Một nội dung công việc đã chọn ở drawer nhập nhiệm vụ, kèm các việc nhập cho
 * nội dung đó.
 *
 * Danh sách phẳng theo nội dung chứ không lồng theo trục: trục suy được từ
 * nội dung, giữ thêm một tầng chỉ để nhóm lúc hiển thị là thừa - và tầng đó
 * từng cho phép có khối trục rỗng, thứ chẳng lưu được gì.
 */
export type DraftContentEntry = {
  key: string;
  axisId: string;
  workContentId: string;
  tasks: PersonalTaskDraft[];
};

export function createContentEntry(
  axisId: string,
  workContentId: string,
): DraftContentEntry {
  return {
    key: localKey("entry"),
    axisId,
    workContentId,
    tasks: [createEmptyTask()],
  };
}

/**
 * Nhiệm vụ chưa gõ gì - dòng người dùng thêm ra rồi để đó.
 * Lúc lưu thì bỏ đi thay vì bắt lỗi "thiếu cột bắt buộc" ở dòng họ không định
 * dùng.
 */
export function isEmptyTask(task: PersonalTaskDraft): boolean {
  const hasField = Object.values(task.fieldValues ?? {}).some((value) =>
    value.trim(),
  );
  const hasCatalog = Object.values(task.catalogValues ?? {}).some(Boolean);
  const hasFile = Object.values(task.attachments ?? {}).some(
    (files) => files.length > 0,
  );
  return !hasField && !hasCatalog && !hasFile;
}
