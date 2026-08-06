export enum Permission {
    USER_VIEW = 'user.view',
    USER_MANAGE = 'user.manage',

    DEPARTMENT_VIEW = 'department.view',
    DEPARTMENT_MANAGE = 'department.manage',

    ROLE_ASSIGN = 'role.assign',

    KPI_MANAGE = 'kpi.manage',

    /** Giao nhiệm vụ KPI xuống đơn vị / cán bộ. */
    TASK_ASSIGN = 'task.assign',
    TASK_VIEW = 'task.view',

    EVALUATION_SELF = 'evaluation.self',
    EVALUATION_APPROVE = 'evaluation.approve',

    SYSTEM_CONFIG = 'system.config',
}