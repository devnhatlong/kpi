export const KPI_SCOPES = [
  "SELF",
  "USERS_IN_OWN_UNIT",
  "USERS_IN_SUB_UNITS",
  "OWN_UNIT",
  "CHILD_UNITS",
  "DESCENDANT_UNITS",
] as const;

export type KpiScope = (typeof KPI_SCOPES)[number];

export type KpiScopeGroup = "PERSON" | "UNIT";

export const KPI_SCOPE_GROUP_LABEL: Record<KpiScopeGroup, string> = {
  PERSON: "Cá nhân",
  UNIT: "Đơn vị",
};

export type KpiScopeMeta = {
  key: KpiScope;
  group: KpiScopeGroup;
  label: string;
  description: string;
};

export type KpiScopeConfigItem = {
  roleCode: string;
  roleName: string;
  sortOrder: number;
  isEnabled: boolean;
  scopes: KpiScope[];
  requireApproval: boolean;
  note: string;
};

export type KpiScopeConfigResponse = {
  items: KpiScopeConfigItem[];
  scopeMeta: KpiScopeMeta[];
};

export type SaveKpiScopeConfigInput = {
  items: Array<{
    roleCode: string;
    isEnabled: boolean;
    scopes: KpiScope[];
    requireApproval: boolean;
    note: string;
  }>;
};

/** Mô tả ngắn cấp quản lý của vai trò, hiện trên thẻ tóm tắt. */
export const ROLE_LEVEL_HINT: Record<string, string> = {
  SUPER_ADMIN: "Toàn hệ thống",
  UNIT_ADMIN: "Đơn vị phụ trách",
  MANAGER: "Đơn vị phụ trách",
  STAFF: "Cá nhân",
};

export function sameConfig(
  a: KpiScopeConfigItem[],
  b: KpiScopeConfigItem[],
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
