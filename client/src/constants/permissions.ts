/**
 * Mã quyền - phải khớp `server/src/common/enums/permission.enum.ts`.
 *
 * Client chỉ dùng để ẩn/hiện menu và chặn điều hướng cho đỡ bấm vào chỗ sẽ ăn
 * 403. Chốt chặn thật là PermissionsGuard bên server, nên lệch ở đây không mở
 * thêm quyền cho ai.
 */
export const PERM = {
  USER_VIEW: "user.view",
  USER_MANAGE: "user.manage",

  DEPARTMENT_VIEW: "department.view",
  DEPARTMENT_MANAGE: "department.manage",

  ROLE_ASSIGN: "role.assign",

  MISSION_MANAGE: "mission.manage",

  TASK_ASSIGN: "task.assign",
  TASK_VIEW: "task.view",

  EVALUATION_SELF: "evaluation.self",
  EVALUATION_APPROVE: "evaluation.approve",

  /* Bản nghiệp vụ mới - báo cáo ngày cấp đội. */
  TEAM_REPORT_ENTRY: "team_report.entry",
  TEAM_REPORT_REVIEW: "team_report.review",

  SYSTEM_CONFIG: "system.config",
} as const;

export type PermissionCode = (typeof PERM)[keyof typeof PERM];
