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
