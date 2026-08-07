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
  | "RETURNED";

export const PERSONAL_KPI_STATUSES: PersonalKpiStatus[] = [
  "DRAFT",
  "PENDING",
  "APPROVED",
  "RETURNED",
];

export const PERSONAL_KPI_STATUS_LABEL: Record<PersonalKpiStatus, string> = {
  DRAFT: "Nháp",
  PENDING: "Chờ duyệt",
  APPROVED: "Đã duyệt",
  RETURNED: "Trả lại",
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

export type TaskEvidenceFile = {
  key: string;
  name: string;
  size: number;
  mimeType: string;
  /** Giữ File trên client tới khi có API upload */
  file?: File;
};

export type PersonalTaskDraft = {
  /** client-only id for list keys */
  key: string;
  title: string;
  deadline: string;
  product: string;
  standardScore: string;
  executingUnit: string;
  progressPercent: string;
  progressSelfScore: string;
  qualityPercent: string;
  qualitySelfScore: string;
  /** Cặp Đạt / Không đạt - loại trừ nhau. */
  resultPassed: boolean;
  resultFailed: boolean;
  note: string;
  evidenceFiles: TaskEvidenceFile[];
  /** Giá trị cột tự do của mẫu bảng gán cho trục, key = FormTemplateColumn.key. */
  fieldValues: Record<string, string>;
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

function localKey(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createEmptyTask(_index = 1): PersonalTaskDraft {
  return {
    key: localKey("task"),
    title: "",
    deadline: "",
    product: "",
    standardScore: "",
    executingUnit: "",
    progressPercent: "",
    progressSelfScore: "",
    qualityPercent: "",
    qualitySelfScore: "",
    resultPassed: false,
    resultFailed: false,
    note: "",
    evidenceFiles: [],
    fieldValues: {},
  };
}

/** Khối nội dung trong form nháp (nhiều nhiệm vụ). */
export type DraftContentBlock = {
  key: string;
  workContentId: string;
  tasks: PersonalTaskDraft[];
};

/** Khối trục trong form nháp (nhiều nội dung). */
export type DraftAxisBlock = {
  key: string;
  axisId: string;
  contents: DraftContentBlock[];
};

export function createEmptyContentBlock(): DraftContentBlock {
  return {
    key: localKey("content"),
    workContentId: "",
    tasks: [createEmptyTask(1)],
  };
}

export function createEmptyAxisBlock(): DraftAxisBlock {
  return {
    key: localKey("axis"),
    axisId: "",
    contents: [],
  };
}
