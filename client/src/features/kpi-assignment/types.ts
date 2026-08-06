export const ASSIGNMENT_STATUSES = [
  "ASSIGNED",
  "IN_PROGRESS",
  "SUBMITTED",
  "APPROVED",
  "REJECTED",
] as const;

export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

export const ASSIGNMENT_STATUS_LABEL: Record<AssignmentStatus, string> = {
  ASSIGNED: "Đã giao",
  IN_PROGRESS: "Đang thực hiện",
  SUBMITTED: "Chờ duyệt",
  APPROVED: "Đã duyệt",
  REJECTED: "Trả lại",
};

export type HolderType = "DEPARTMENT" | "USER";

export type CatalogRef = {
  _id: string;
  code?: string;
  name?: string;
  fullName?: string;
  username?: string;
};

/** Nhóm điểm kèm dải điểm, populate từ danh mục Nhóm điểm. */
export type ScoreGroupRef = CatalogRef & {
  minScore?: number;
  maxScore?: number;
  maxInclusive?: boolean;
};

export type AssignmentEvidenceFile = {
  key: string;
  name: string;
  size: number;
  mimeType: string;
  /** Giữ File trên client tới khi có API upload */
  file?: File;
};

export type AssignmentTrailStep = {
  toType: HolderType;
  toDepartmentId?: CatalogRef | string | null;
  toUserId?: CatalogRef | string | null;
  byUserId?: CatalogRef | string;
  byDepartmentId?: CatalogRef | string | null;
  note?: string;
  at: string;
};

export type KpiAssignment = {
  _id: string;
  axisId: CatalogRef | string;
  workContentId: CatalogRef | string;
  title: string;
  product?: string;
  scoreGroupId: ScoreGroupRef | string;
  deadline?: string;
  note?: string;

  issuerId?: CatalogRef | string;
  issuerDepartmentId?: CatalogRef | string | null;
  batchId: string;
  requireApproval: boolean;

  lastAssignedById?: CatalogRef | string;
  lastAssignedByDepartmentId?: CatalogRef | string | null;

  holderType: HolderType;
  holderDepartmentId?: CatalogRef | string | null;
  holderUserId?: CatalogRef | string | null;

  status: AssignmentStatus;
  progressPercent?: number | null;
  qualityPercent?: number | null;
  selfScore?: number | null;
  resultNote?: string;
  evidenceFiles?: AssignmentEvidenceFile[];

  submittedAt?: string | null;
  approvedById?: CatalogRef | string | null;
  approvedAt?: string | null;
  approvedScore?: number | null;
  rejectReason?: string;

  trail: AssignmentTrailStep[];
  createdAt: string;
  updatedAt: string;
};

export type AssignmentTargetDepartment = {
  _id: string;
  code: string;
  name: string;
  parentId?: string | null;
  depth: number;
  hasChildren: boolean;
  levelName: string;
  /** Thuộc cấp nhận KPI - cấp gom nhóm thì chỉ để xem. */
  isUnit: boolean;
  /** Giao thẳng được theo luật tuần tự / vượt cấp đang bật. */
  canReceive: boolean;
};

export type AssignmentTargetUser = {
  _id: string;
  fullName?: string;
  username: string;
  position?: string;
  departmentId?: CatalogRef | string | null;
  canReceive: boolean;
};

/** Người giao đang đứng ở đâu và với tới được tới đâu. */
export type AssignmentScope = {
  departmentId: string | null;
  departmentName: string;
  departmentCode: string;
  levelName: string;
  directChildCount: number;
  canAssignToUsers: boolean;
  /** Vai trò đã được cấu hình quyền giao KPI chưa. */
  isEnabled: boolean;
  requireApproval: boolean;
  scopes: string[];
};

export type AssignmentTargets = {
  departments: AssignmentTargetDepartment[];
  users: AssignmentTargetUser[];
  scope: AssignmentScope;
};

/**
 * Nơi nhận của một dòng nhiệm vụ.
 * Giao cho đơn vị nghĩa là nhiệm vụ nằm ở đơn vị đó, do quản trị đơn vị tiếp
 * nhận rồi tự ban tiếp xuống - không tự động chảy sang cấp con.
 */
export type AssignmentTargetSelection = {
  departmentIds: string[];
  userIds: string[];
};

export type CreateAssignmentItem = {
  axisId: string;
  workContentId: string;
  title: string;
  product?: string;
  scoreGroupId: string;
  deadline?: string;
  note?: string;
  targets: AssignmentTargetSelection;
};

export type CreateAssignmentBatchInput = {
  items: CreateAssignmentItem[];
};

export function emptyTargetSelection(): AssignmentTargetSelection {
  return { departmentIds: [], userIds: [] };
}

export function countSelectedTargets(
  selection: AssignmentTargetSelection,
): number {
  return selection.departmentIds.length + selection.userIds.length;
}

export type DelegateAssignmentInput = {
  targetType: HolderType;
  targetDepartmentId?: string;
  targetUserId?: string;
  note?: string;
};

export type ReportAssignmentInput = {
  progressPercent?: number;
  qualityPercent?: number;
  selfScore?: number;
  resultNote?: string;
  evidenceFiles?: Array<{
    key: string;
    name: string;
    size: number;
    mimeType: string;
  }>;
};

export type AssignmentListQuery = {
  page?: number;
  limit?: number;
  status?: AssignmentStatus | "";
  q?: string;
  axisId?: string;
  batchId?: string;
};

export function refId(value: CatalogRef | string | null | undefined): string {
  if (!value) return "";
  return typeof value === "string" ? value : value._id;
}

export function refLabel(
  value: CatalogRef | string | null | undefined,
  fallback = "-",
): string {
  if (!value) return fallback;
  if (typeof value === "string") return fallback;
  return value.name ?? value.fullName ?? value.username ?? fallback;
}

/** Nhóm điểm kèm dải, VD: "Nhóm 2 (50 → dưới 70)". */
export function scoreGroupLabel(
  value: ScoreGroupRef | string | null | undefined,
  fallback = "-",
): string {
  if (!value || typeof value === "string") return fallback;
  const name = value.name ?? fallback;
  if (value.minScore == null || value.maxScore == null) return name;
  const max = value.maxInclusive ? value.maxScore : `dưới ${value.maxScore}`;
  return `${name} (${value.minScore} → ${max})`;
}

/** Tên nơi đang giữ nhiệm vụ. */
export function holderLabel(item: KpiAssignment): string {
  return item.holderType === "DEPARTMENT"
    ? refLabel(item.holderDepartmentId, "Đơn vị")
    : refLabel(item.holderUserId, "Cán bộ");
}

/** Chỉ nhiệm vụ chưa gửi lên mới sửa / giao tiếp được. */
export function isAssignmentOpen(status: AssignmentStatus) {
  return (
    status === "ASSIGNED" || status === "IN_PROGRESS" || status === "REJECTED"
  );
}
