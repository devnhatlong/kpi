export type PersonalKpiStatus =
  | "DRAFT"
  | "SENT"
  | "REJECTED"
  | "COMPLETED";

export const PERSONAL_KPI_STATUS_LABEL: Record<PersonalKpiStatus, string> = {
  DRAFT: "Nháp",
  SENT: "Đã gửi",
  REJECTED: "Từ chối",
  COMPLETED: "Hoàn thành",
};

/** Chỉ nháp / từ chối mới sửa, xoá, gửi lại. */
export function canEditPersonalKpi(status: PersonalKpiStatus) {
  return status === "DRAFT" || status === "REJECTED";
}

export function canSendPersonalKpi(status: PersonalKpiStatus) {
  return status === "DRAFT" || status === "REJECTED";
}

export function canDeletePersonalKpi(status: PersonalKpiStatus) {
  return status === "DRAFT" || status === "REJECTED";
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
  note: string;
  evidenceFiles: TaskEvidenceFile[];
};

/** Bản ghi nhiệm vụ KPI cá nhân trên danh sách. */
export type PersonalKpiItem = {
  id: string;
  status: PersonalKpiStatus;
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
  recipientId?: string;
  recipientName?: string;
  sendNote?: string;
  rejectReason?: string;
};

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
    note: "",
    evidenceFiles: [],
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
