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
  CANCELLED: "Đã hủy",
} as const;

export type TaskStatus = keyof typeof TASK_STATUSES;

export type TaskAssignment = {
  _id: string;
  id?: string;
  sheetId?:
    | string
    | {
        _id: string;
        departmentId?: string;
        periodId?: string;
        status?: string;
      };
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
  CANCELLED: "Đã hủy",
} as const;

export type HandoffStatus = keyof typeof HANDOFF_STATUSES;

export const SHEET_STATUSES = {
  DRAFT: "Nháp",
  ACTIVE: "Đang dùng",
  CLOSED: "Đã đóng",
} as const;

export type SheetStatus = keyof typeof SHEET_STATUSES;

export type MissionPeriod = {
  _id: string;
  id?: string;
  code: string;
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
};

export type UnitMissionSheet = {
  _id: string;
  id?: string;
  departmentId: DepartmentRef | string;
  periodId: MissionPeriod | string;
  templateId:
    { _id: string; code: string; name: string; isActive?: boolean } | string;
  status: SheetStatus;
};

export type UnitHandoff = {
  _id: string;
  id?: string;
  periodId?: MissionPeriod | string;
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

export type MissionPeriodInput = Omit<MissionPeriod, "_id" | "id">;

export type UnitMissionSheetInput = {
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

export type MissionIndicator = {
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

export type MissionMasterForm = {
  _id: string;
  id?: string;
  name: string;
  code: string;
  description?: string;
  formType: string;
  periodId: MissionPeriod | string;
  templateId:
    | string
    | {
        _id: string;
        code: string;
        name: string;
        columns?: unknown;
        headerGroups?: unknown;
      };
  scopeType: MasterFormScope;
  provinceDepartmentId?: DepartmentRef | string;
  targetDepartmentIds?: Array<DepartmentRef | string>;
  indicators: MissionIndicator[];
  status: MasterFormStatus;
  publishedAt?: string;
  version: number;
};

export type MissionMasterFormInput = {
  name: string;
  code: string;
  description?: string;
  formType?: string;
  periodId: string;
  templateId: string;
  scopeType?: MasterFormScope;
  provinceDepartmentId?: string;
  targetDepartmentIds?: string[];
  indicators: MissionIndicator[];
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
  /** Để trống khi tạo mới - server tự sinh (ND-0001, …). */
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

export type TemplatePublishMode = "ONE_ROW" | "MANY_TASKS";
export type TemplateExecuteMode = "ONE_ROW" | "MANY_TASKS";
export type TemplateTaskCreatorRole = "SUPER_ADMIN" | "UNIT_ADMIN" | "MANAGER";

export type TemplateWorkflowRules = {
  publishMode: TemplatePublishMode;
  executeMode: TemplateExecuteMode;
  taskCreators: TemplateTaskCreatorRole[];
  contentColumnLocked: boolean;
};

export const DEFAULT_TEMPLATE_WORKFLOW_RULES: TemplateWorkflowRules = {
  publishMode: "ONE_ROW",
  executeMode: "MANY_TASKS",
  taskCreators: ["UNIT_ADMIN"],
  contentColumnLocked: true,
};

export const TEMPLATE_PUBLISH_MODE_LABELS: Record<TemplatePublishMode, string> =
  {
    ONE_ROW: "1 nội dung = 1 dòng (không tạo NV sẵn)",
    MANY_TASKS: "Cho phép tạo nhiều nhiệm vụ ngay khi phát hành",
  };

export const TEMPLATE_EXECUTE_MODE_LABELS: Record<TemplateExecuteMode, string> =
  {
    ONE_ROW: "1 nội dung = tối đa 1 nhiệm vụ",
    MANY_TASKS: "1 nội dung = nhiều nhiệm vụ",
  };

export const TEMPLATE_TASK_CREATOR_LABELS: Record<
  TemplateTaskCreatorRole,
  string
> = {
  SUPER_ADMIN: "Super Admin",
  UNIT_ADMIN: "Unit Admin",
  MANAGER: "Manager",
};

export function resolveTemplateWorkflowRules(
  rules?: Partial<TemplateWorkflowRules> | null,
): TemplateWorkflowRules {
  return {
    publishMode:
      rules?.publishMode ?? DEFAULT_TEMPLATE_WORKFLOW_RULES.publishMode,
    executeMode:
      rules?.executeMode ?? DEFAULT_TEMPLATE_WORKFLOW_RULES.executeMode,
    taskCreators: rules?.taskCreators?.length
      ? [...rules.taskCreators]
      : [...DEFAULT_TEMPLATE_WORKFLOW_RULES.taskCreators],
    contentColumnLocked:
      rules?.contentColumnLocked ??
      DEFAULT_TEMPLATE_WORKFLOW_RULES.contentColumnLocked,
  };
}
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

export type MissionTemplate = {
  _id: string;
  id?: string;
  name: string;
  code: string;
  columns: TemplateColumn[];
  headerGroups: TemplateHeaderGroup[];
  includedContentIds: string[];
  workflowRules?: TemplateWorkflowRules;
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

export type MissionTemplateInput = Omit<
  MissionTemplate,
  "_id" | "id" | "createdAt" | "updatedAt"
>;
