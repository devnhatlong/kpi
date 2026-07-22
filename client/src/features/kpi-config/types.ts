import type { UserAccount } from "@/features/organization/types";

export type WorkGroup = {
  _id: string;
  id?: string;
  code: string;
  name: string;
  description?: string;
  sortOrder: number;
  isActive: boolean;
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
  contentId: WorkContent | string;
  title: string;
  description?: string;
  assigneeId: UserAccount;
  dueDate: string;
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
};

export type WorkGroupInput = Omit<WorkGroup, "_id" | "id">;

export type WorkContentInput = Omit<WorkContent, "_id" | "id" | "groupId"> & {
  groupId: string;
};

export type TaskAssignmentInput = Omit<
  TaskAssignment,
  "_id" | "id" | "contentId" | "assigneeId"
> & {
  contentId: string;
  assigneeId: string;
};

export type TemplateVisibilityScope = "ALL" | "ROLES" | "USERS";
export type TemplateColumnDataType =
  | "text"
  | "number"
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
