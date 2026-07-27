import { entityId } from "@/features/organization/types";
import type { CatalogScope, DepartmentRef } from "./types";

type ScopedCatalogItem = {
  scope?: CatalogScope;
  ownerDepartmentId?: DepartmentRef | string | null;
};

export function resolveCatalogScope(item: ScopedCatalogItem): CatalogScope {
  return item.scope ?? "SYSTEM";
}

export function isDepartmentCatalog(item: ScopedCatalogItem): boolean {
  return resolveCatalogScope(item) === "DEPARTMENT";
}

export function departmentLabel(
  ownerDepartmentId?: DepartmentRef | string | null,
): string {
  if (!ownerDepartmentId) return "";
  if (typeof ownerDepartmentId === "object") {
    return ownerDepartmentId.name?.trim() || ownerDepartmentId.code || "";
  }
  return "";
}

export function catalogScopeLabel(item: ScopedCatalogItem): string {
  if (isDepartmentCatalog(item)) {
    const dept = departmentLabel(item.ownerDepartmentId);
    return dept ? `Đơn vị · ${dept}` : "Đơn vị";
  }
  return "Hệ thống";
}

/** Super Admin quản lý tất cả; Unit Admin chỉ sửa nội bộ phòng. */
export function canUserMutateCatalogItem(
  isSuperAdminUser: boolean,
  item: ScopedCatalogItem,
): boolean {
  if (isSuperAdminUser) return true;
  return isDepartmentCatalog(item);
}

export function groupsForCatalogScope(
  groups: Array<{ scope?: CatalogScope; ownerDepartmentId?: DepartmentRef | string | null }>,
  scope: CatalogScope,
  ownerDepartmentId: string,
): typeof groups {
  if (scope === "SYSTEM") {
    return groups.filter((group) => !isDepartmentCatalog(group));
  }
  return groups.filter(
    (group) =>
      isDepartmentCatalog(group) &&
      ownerDepartmentIdString(group.ownerDepartmentId) === ownerDepartmentId,
  );
}

export function ownerDepartmentIdString(
  ownerDepartmentId?: DepartmentRef | string | null,
): string {
  if (!ownerDepartmentId) return "";
  if (typeof ownerDepartmentId === "string") return ownerDepartmentId;
  return entityId(ownerDepartmentId);
}
