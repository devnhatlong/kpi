import { Badge } from "@/components/ui/badge";
import { catalogScopeLabel, isDepartmentCatalog } from "../catalog-scope-utils";
import type { CatalogScope, DepartmentRef } from "../types";

export function CatalogScopeBadge({
  scope,
  ownerDepartmentId,
}: {
  scope?: CatalogScope;
  ownerDepartmentId?: DepartmentRef | string | null;
}) {
  const item = { scope, ownerDepartmentId };
  const isDept = isDepartmentCatalog(item);
  return (
    <Badge
      variant="outline"
      className={
        isDept
          ? "border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100"
          : "border-violet-300 bg-violet-50 text-violet-900 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-100"
      }
    >
      {catalogScopeLabel(item)}
    </Badge>
  );
}
