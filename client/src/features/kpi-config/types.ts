import type { UserAccount } from "@/features/organization/types";

export type CatalogScope = "SYSTEM" | "DEPARTMENT";

export type WorkGroup = {
  _id: string;
  id?: string;
  code: string;
  name: string;
  description?: string;
  sortOrder: number;
  isActive: boolean;
  scope?: CatalogScope;
  ownerDepartmentId?: DepartmentRef | string | null;
};

export type WorkContent = {
  _id: string;
  id?: string;
  code: string;
  name: string;
  groupId: WorkGroup | string;
  description?: string;
  sortOrder: number;
  isActive: boolean;
  scope?: CatalogScope;
  ownerDepartmentId?: DepartmentRef | string | null;
};

export const TASK_STATUSES = {
  ASSIGNED: "Đã giao",
  IN_PROGRESS: "Đang thực hiện",
  SUBMITTED: "Đã báo cáo",
  APPRAISED: "Đã thẩm định",
  CANCELLED: "Đã huỷ",
} as const;

export type TaskStatus = keyof typeof TASK_STATUSES;

export type TaskAssignment = {
  _id: string;
  id?: string;
  sheetId?: string | { _id: string; departmentId?: string; periodId?: string; status?: string };
  ownerDepartmentId?: DepartmentRef | string;
  parentTaskId?: string;
  origin?: TaskOrigin;
  sourceHandoffId?: string;
  sourceMasterFormId?: string;
  indicatorCode?: string;
  indicatorWeight?: number;
  assignmentTargetType?: AssignmentTargetType;
  targetDepartmentId?: DepartmentRef | string;
  contentId: WorkContent | string;
  title: string;
  description?: string;
  assigneeId?: UserAccount | string;
  dueDate?: string;
  reportDueDate?: string;
  product: string;
  actualProduct?: string;
  standardScore: number;
  status: TaskStatus;
  selfProgressPercent?: number;
  selfProgressScore?: number;
  selfQualityPercent?: number;
  selfQualityScore?: number;
  proposedAdjustment?: number;
  proposedAdjustmentReason?: string;
  appraisalProgressPercent?: number;
  appraisalProgressScore?: number;
  appraisalQualityPercent?: number;
  appraisalQualityScore?: number;
  note?: string;
  fieldValues?: Record<string, string | number>;
};

export type DepartmentRef = {
  _id: string;
  id?: string;
  code: string;
  name: string;
  parentId?: string | null;
  levelId?: string;
};

export const TASK_ORIGINS = {
  OWN: "Tự đăng ký",
  FROM_HANDOFF: "Tiếp nhận ngang",
  FROM_PARENT: "Giao từ cấp trên",
  FROM_PROVINCE: "Cấp tỉnh ban hành",
} as const;

export type TaskOrigin = keyof typeof TASK_ORIGINS;

export const ASSIGNMENT_TARGET_TYPES = {
  UNASSIGNED: "Chưa giao",
  CHILD_DEPARTMENT: "Đơn vị con",
  USER: "Cán bộ",
} as const;

export type AssignmentTargetType = keyof typeof ASSIGNMENT_TARGET_TYPES;

export const HANDOFF_STATUSES = {
  DRAFT: "Nháp",
  SENT: "Đã gửi",
  ACCEPTED: "Đã tiếp nhận",
  REJECTED: "Từ chối",
  CANCELLED: "Đã huỷ",
} as const;

export type HandoffStatus = keyof typeof HANDOFF_STATUSES;

export const SHEET_STATUSES = {
  DRAFT: "Nháp",
  ACTIVE: "Đang dùng",
  CLOSED: "Đã đóng",
} as const;

export type SheetStatus = keyof typeof SHEET_STATUSES;

export type KpiPeriod = {
  _id: string;
  id?: string;
  code: string;
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
};

export type UnitKpiSheet = {
  _id: string;
  id?: string;
  departmentId: DepartmentRef | string;
  periodId: KpiPeriod | string;
  templateId: { _id: string; code: string; name: string; isActive?: boolean } | string;
  status: SheetStatus;
};

export type UnitHandoff = {
  _id: string;
  id?: string;
  periodId?: KpiPeriod | string;
  sourceDepartmentId: DepartmentRef | string;
  targetDepartmentId: DepartmentRef | string;
  contentId: WorkContent | string;
  title: string;
  description?: string;
  dueDate: string;
  product: string;
  standardScore: number;
  sourceTaskId?: string;
  status: HandoffStatus;
  acceptedTaskId?: string | { _id: string; title: string; status: string };
  createdBy?: UserAccount | string;
  acceptedBy?: UserAccount | string;
  acceptedAt?: string;
  rejectReason?: string;
  note?: string;
};

export type KpiPeriodInput = Omit<KpiPeriod, "_id" | "id">;

export type UnitKpiSheetInput = {
  departmentId: string;
  periodId: string;
  templateId: string;
  status?: SheetStatus;
};

export type UnitHandoffInput = {
  sourceDepartmentId: string;
  targetDepartmentId: string;
  periodId?: string;
  contentId: string;
  title: string;
  description?: string;
  dueDate: string;
  product: string;
  standardScore: number;
  sourceTaskId?: string;
  note?: string;
};

export type SheetTaskInput = {
  contentId: string;
  title: string;
  description?: string;
  dueDate: string;
  product: string;
  standardScore: number;
  note?: string;
  fieldValues?: Record<string, string | number>;
};

export type AssignTaskTargetInput = {
  targetType: "USER" | "CHILD_DEPARTMENT";
  userId?: string;
  departmentId?: string;
  childTemplateId?: string;
};

export type AcceptHandoffInput = {
  sheetId?: string;
  periodId?: string;
  templateId?: string;
};

export const MASTER_FORM_STATUSES = {
  DRAFT: "Nháp",
  READY: "Chờ phát hành",
  PUBLISHED: "Đang áp dụng",
  LOCKED: "Đã khóa",
  CLOSED: "Đã kết thúc",
  CANCELLED: "Hủy",
} as const;

export type MasterFormStatus = keyof typeof MASTER_FORM_STATUSES;

export const MASTER_FORM_SCOPES = {
  PROVINCE: "Toàn Công an tỉnh",
  ALL_PHONG: "Tất cả các phòng",
  SELECTED_DEPTS: "Một số phòng được chọn",
} as const;

export type MasterFormScope = keyof typeof MASTER_FORM_SCOPES;

export type KpiIndicator = {
  code: string;
  name: string;
  description?: string;
  weight: number;
  criteria?: string;
  unit?: string;
  evidenceRequired?: string;
  scoringMethod?: string;
  dueDate?: string;
  sortOrder?: number;
};

export type KpiMasterForm = {
  _id: string;
  id?: string;
  name: string;
  code: string;
  description?: string;
  formType: string;
  periodId: KpiPeriod | string;
  templateId:
    | string
    | { _id: string; code: string; name: string; columns?: unknown; headerGroups?: unknown };
  scopeType: MasterFormScope;
  provinceDepartmentId?: DepartmentRef | string;
  targetDepartmentIds?: Array<DepartmentRef | string>;
  indicators: KpiIndicator[];
  status: MasterFormStatus;
  publishedAt?: string;
  version: number;
};

export type KpiMasterFormInput = {
  name: string;
  code: string;
  description?: string;
  formType?: string;
  periodId: string;
  templateId: string;
  scopeType?: MasterFormScope;
  provinceDepartmentId?: string;
  targetDepartmentIds?: string[];
  indicators: KpiIndicator[];
};

export type MasterFormTracking = {
  formId: string;
  formName: string;
  status: MasterFormStatus;
  phongTotal: number;
  phongWithSheet: number;
  phongAssigned: number;
  rows: Array<{
    departmentId: string;
    code: string;
    name: string;
    hasSheet: boolean;
    indicatorCount: number;
    assignedCount: number;
    completedCount: number;
    statusSummary: {
      unassigned: number;
      inProgress: number;
      submitted: number;
      appraised: number;
    };
  }>;
};

export type WorkGroupInput = Omit<WorkGroup, "_id" | "id">;

export type WorkContentInput = Omit<
  WorkContent,
  "_id" | "id" | "groupId" | "code"
> & {
  groupId: string;
  /** Để trống khi tạo mới — server tự sinh (ND-0001, …). */
  code?: string;
};

export type TaskAssignmentInput = Omit<
  TaskAssignment,
  | "_id"
  | "id"
  | "contentId"
  | "assigneeId"
  | "sheetId"
  | "ownerDepartmentId"
  | "targetDepartmentId"
> & {
  contentId: string;
  assigneeId?: string;
  sheetId?: string;
  ownerDepartmentId?: string;
  targetDepartmentId?: string;
};

export type TemplateVisibilityScope = "ALL" | "ROLES" | "USERS";
export type TemplateColumnDataType =
  | "text"
  | "number"
  | "date"
  | "time"
  | "datetime"
  | "text_file"
  | "auto_increment";

export type TemplateColumn = {
  id: string;
  key: string;
  title: string;
  headerPath: string[];
  width: number;
  visible: boolean;
  inputRoleCode: string;
  dataType: TemplateColumnDataType;
  /** Bắt buộc nhập khi giao/cập nhật nhiệm vụ. */
  required?: boolean;
};

export type TemplateHeaderGroup = {
  id: string;
  name: string;
  children: TemplateHeaderGroup[];
};

export type KpiTemplate = {
  _id: string;
  id?: string;
  name: string;
  code: string;
  columns: TemplateColumn[];
  headerGroups: TemplateHeaderGroup[];
  includedContentIds: string[];
  progressWeight: number;
  qualityWeight: number;
  visibilityScope: TemplateVisibilityScope;
  assignedRoleIds: string[];
  assignedUserIds: string[];
  isActive: boolean;
  scope?: CatalogScope;
  ownerDepartmentId?: DepartmentRef | string | null;
  createdAt?: string;
  updatedAt?: string;
};

export function isAutoIncrementColumn(
  column: Pick<TemplateColumn, "dataType">,
): boolean {
  return column.dataType === "auto_increment";
}

export function getAutoIncrementValue(rowIndex: number): number {
  return rowIndex + 1;
}

export type KpiTemplateInput = Omit<
  KpiTemplate,
  "_id" | "id" | "createdAt" | "updatedAt"
>;
