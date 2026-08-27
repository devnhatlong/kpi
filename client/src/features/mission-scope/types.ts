export const MISSION_SCOPES = [
  "SELF",
  "USERS_IN_OWN_UNIT",
  "USERS_IN_SUB_UNITS",
  "OWN_UNIT",
  "CHILD_UNITS",
  "DESCENDANT_UNITS",
] as const;

export type MissionScope = (typeof MISSION_SCOPES)[number];

export type MissionScopeGroup = "PERSON" | "UNIT";

export const MISSION_SCOPE_GROUP_LABEL: Record<MissionScopeGroup, string> = {
  PERSON: "Cá nhân",
  UNIT: "Đơn vị",
};

export type MissionScopeMeta = {
  key: MissionScope;
  group: MissionScopeGroup;
  label: string;
  description: string;
};

export type MissionScopeConfigItem = {
  roleCode: string;
  roleName: string;
  sortOrder: number;
  isEnabled: boolean;
  scopes: MissionScope[];
  requireApproval: boolean;
  note: string;
};

export type MissionScopeConfigResponse = {
  items: MissionScopeConfigItem[];
  scopeMeta: MissionScopeMeta[];
};

export type SaveMissionScopeConfigInput = {
  items: Array<{
    roleCode: string;
    isEnabled: boolean;
    scopes: MissionScope[];
    requireApproval: boolean;
    note: string;
  }>;
};

/** Mô tả ngắn cấp quản lý của vai trò, hiện trên thẻ tóm tắt. */
export const ROLE_LEVEL_HINT: Record<string, string> = {
  SUPER_ADMIN: "Chỉ cấu hình",
  CAT_ADMIN: "Toàn hệ thống",
  UNIT_ADMIN: "Đơn vị phụ trách",
  VICE_UNIT_ADMIN: "Đơn vị phụ trách",
  MANAGER: "Đơn vị phụ trách",
  STAFF: "Cá nhân",
};

export function sameConfig(
  a: MissionScopeConfigItem[],
  b: MissionScopeConfigItem[],
): boolean {
  if (a.length !== b.length) return false;
  return a.every((item, index) => {
    const other = b[index];
    if (!other) return false;
    return (
      item.roleCode === other.roleCode &&
      item.isEnabled === other.isEnabled &&
      item.requireApproval === other.requireApproval &&
      item.note === other.note &&
      item.scopes.length === other.scopes.length &&
      item.scopes.every((scope) => other.scopes.includes(scope))
    );
  });
}
