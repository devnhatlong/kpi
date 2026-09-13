export enum Permission {
  USER_VIEW = 'user.view',
  USER_MANAGE = 'user.manage',

  DEPARTMENT_VIEW = 'department.view',
  DEPARTMENT_MANAGE = 'department.manage',

  ROLE_ASSIGN = 'role.assign',

  MISSION_MANAGE = 'mission.manage',

  /** Giao nhiệm vụ xuống đơn vị / cán bộ. */
  TASK_ASSIGN = 'task.assign',
  TASK_VIEW = 'task.view',

  EVALUATION_SELF = 'evaluation.self',
  EVALUATION_APPROVE = 'evaluation.approve',

  /*
    Báo cáo ngày cấp đội - bản nghiệp vụ mới, cả đội dùng chung một tài khoản.

    Cố tình KHÔNG dùng lại hai mã EVALUATION_* ở trên: hai bản nghiệp vụ chạy
    song song trên cùng một hệ, dùng chung mã quyền thì bật bản mới cho một đơn
    vị là menu của bản cũ hiện theo.
  */
  TEAM_REPORT_ENTRY = 'team_report.entry',
  TEAM_REPORT_REVIEW = 'team_report.review',

  /*
    Bảng đề xuất điểm cộng, điểm trừ & xếp loại - mã riêng, không dùng chung
    với báo cáo ngày: chỉ cấp phòng / xã nhập và duyệt, đội không dính.
  */
  ADJUSTMENT_ENTRY = 'adjustment.entry',
  ADJUSTMENT_REVIEW = 'adjustment.review',

  SYSTEM_CONFIG = 'system.config',
}
