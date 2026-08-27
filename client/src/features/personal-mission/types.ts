/**
 * Trạng thái duyệt tại cấp đang giữ nhiệm vụ - khớp `reviewStatus` bên server.
 * - DRAFT    : còn ở chỗ mình, chưa gửi
 * - PENDING  : đã gửi, đang chờ người nhận duyệt
 * - APPROVED : cấp đang giữ đã duyệt
 * - RETURNED : bị trả lại, quay về chỗ người gửi để sửa
 */
export type PersonalMissionStatus =
  "DRAFT" | "PENDING" | "APPROVED" | "RETURNED" | "COMPLETED";

export const PERSONAL_MISSION_STATUSES: PersonalMissionStatus[] = [
  "DRAFT",
  "PENDING",
  "APPROVED",
  "RETURNED",
  "COMPLETED",
];

export const PERSONAL_MISSION_STATUS_LABEL: Record<
  PersonalMissionStatus,
  string
> = {
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
export function canEditPersonalMission(status: PersonalMissionStatus) {
  return status === "DRAFT" || status === "RETURNED";
}

export function canSendPersonalMission(status: PersonalMissionStatus) {
  return status === "DRAFT" || status === "RETURNED";
}

export function canDeletePersonalMission(status: PersonalMissionStatus) {
  return status === "DRAFT" || status === "RETURNED";
}

/**
 * Cập nhật tiến độ hằng ngày rộng hơn sửa nội dung: việc đã gửi lên trên vẫn
 * cập nhật được, chỉ dừng khi cấp trên đã chốt hoàn thành.
 */
export function canUpdateProgress(status: PersonalMissionStatus) {
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

/** Ô mà một lần cập nhật tiến độ động tới. */
export type PersonalMissionProgressField =
  | "progress"
  | "quality"
  | "product"
  | "evidence"
  /** Ô kết quả của trục chấm theo mục - tên cột nằm ở `detail`. */
  | "result"
  /** Cấp trên sửa một ô nội dung - tên trường nằm ở `detail`. */
  | "content";

/**
 * Một ô đổi giá trị. Giá trị là thô: phần trăm và số tệp lưu dạng số trong
 * chuỗi, rỗng = chưa có. Nhãn và cách hiển thị do màn hình quyết định.
 */
export type PersonalMissionProgressChange = {
  field: PersonalMissionProgressField;
  from: string;
  to: string;
  /** Chi tiết thêm - ví dụ tên các tệp vừa đính kèm. */
  detail: string;
};

/**
 * Loại mốc trong đời nhiệm vụ.
 * PROGRESS = cán bộ cập nhật; SUBMIT = gửi lên; RETURN = cấp trên trả lại;
 * COMPLETE = cấp trên chốt hoàn thành; EDIT = cấp trên sửa nội dung.
 */
export type PersonalMissionLogType =
  "PROGRESS" | "SUBMIT" | "RETURN" | "COMPLETE" | "EDIT";

/** Một mốc trong đời nhiệm vụ - dòng trong timeline. */
export type PersonalMissionProgressLog = {
  type: PersonalMissionLogType;
  /** Người nhận của lượt gửi; rỗng ở loại mốc khác. */
  toName: string;
  level: number;
  at: string;
  /** Ngày báo cáo của lần cập nhật (YYYY-MM-DD theo giờ server). */
  onDate: string;
  percent: number | null;
  note: string;
  byName: string;
  changes: PersonalMissionProgressChange[];
};

/** Bản ghi nhiệm vụ cá nhân trên danh sách. */
export type PersonalMissionItem = {
  id: string;
  status: PersonalMissionStatus;
  /** 0 = còn ở chỗ cán bộ, 1 = đang ở cấp thứ nhất... */
  holderLevel: number;
  axisId: string;
  axisName: string;
  workContentId: string;
  workContentName: string;
  workContentCode: string;
  task: PersonalTaskDraft;
  /** Ngày báo cáo YYYY-MM-DD - danh sách xem nhiều ngày cần biết việc của ngày nào. */
  reportDate?: string;
  createdAt: string;
  updatedAt: string;
  /** Thời điểm gửi gần nhất */
  sentAt?: string;
  /** Lần cập nhật tiến độ gần nhất - căn cứ tính "im lặng N ngày". */
  lastProgressAt?: string;
  /** Nhật ký cập nhật tiến độ, mới nhất đứng đầu. */
  progressLogs: PersonalMissionProgressLog[];
  ownerId?: string;
  ownerName?: string;
  recipientId?: string;
  recipientName?: string;
  sendNote?: string;
  /** Lý do cấp trên trả lại - do người duyệt gõ, không phải cảnh báo hệ thống. */
  rejectReason?: string;
  /**
   * Điểm chỉ huy chấm lại, theo khoá cột - đây mới là số chốt khi tính điểm.
   * Số cán bộ tự chấm vẫn nằm nguyên ở `task` để đối chiếu.
   */
  reviewValues: Record<string, string>;
  /** Ô danh mục chỉ huy chọn lại (mức chất lượng), theo khoá cột. */
  reviewCatalogValues: Record<string, string>;
  reviewNote?: string;
  reviewScoredByName?: string;
  reviewScoredAt?: string;
  decidedByName?: string;
  decidedAt?: string;
};

/** Chỉ nhiệm vụ đang chờ duyệt mới duyệt / trả lại được. */
export function canApprovePersonalMission(status: PersonalMissionStatus) {
  return status === "PENDING";
}

/** Đã duyệt hoặc bị trả lại ở cấp trên thì gửi tiếp lên được. */
export function canForwardPersonalMission(
  status: PersonalMissionStatus,
  holderLevel: number,
) {
  return holderLevel >= 1 && (status === "APPROVED" || status === "RETURNED");
}

/** Chốt hoàn thành được khi việc đang ở chỗ mình và chưa chốt. */
export function canCompletePersonalMission(status: PersonalMissionStatus) {
  return status === "PENDING" || status === "APPROVED";
}

/**
 * Sửa nội dung / trả lại được khi việc còn đang chờ mình quyết.
 * Đã chốt hoàn thành là điểm đã vào bảng nhiệm vụ - sửa hay trả lại lúc đó là đổi số
 * sau lưng người đã duyệt, server cũng chặn.
 */
export function canReviewPersonalMission(status: PersonalMissionStatus) {
  return status === "PENDING";
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
