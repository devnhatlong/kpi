"use client";

import useSWR from "swr";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchDepartments } from "@/features/organization/api";
import { entityId } from "@/features/organization/types";
import type { CatalogScope, DepartmentRef } from "../types";
import { CatalogScopeBadge } from "./catalog-scope-badge";

type CatalogScopeFieldsProps = {
  /** Super Admin chọn phạm vi khi tạo mới. */
  allowSelectScope: boolean;
  scope: CatalogScope;
  ownerDepartmentId: string;
  onScopeChange: (scope: CatalogScope) => void;
  onOwnerDepartmentIdChange: (id: string) => void;
  /** Khi sửa: chỉ hiển thị phạm vi, không đổi. */
  readOnly?: boolean;
  readOnlyOwnerDepartmentId?: {
    scope?: CatalogScope;
    ownerDepartmentId?: DepartmentRef | string | null;
  };
};

export function CatalogScopeFields({
  allowSelectScope,
  scope,
  ownerDepartmentId,
  onScopeChange,
  onOwnerDepartmentIdChange,
  readOnly,
  readOnlyOwnerDepartmentId,
}: CatalogScopeFieldsProps) {
  const departmentsQuery = useSWR(
    allowSelectScope && !readOnly ? ["departments", "all"] : null,
    fetchDepartments,
  );
  const departments =
    departmentsQuery.data?.filter((item) => item.isActive) ?? [];

  if (readOnly && readOnlyOwnerDepartmentId) {
    return (
      <div className="space-y-2">
        <Label>Phạm vi</Label>
        <div>
          <CatalogScopeBadge
            scope={readOnlyOwnerDepartmentId.scope}
            ownerDepartmentId={readOnlyOwnerDepartmentId.ownerDepartmentId}
          />
        </div>
      </div>
    );
  }

  if (!allowSelectScope) return null;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label>Phạm vi</Label>
        <Select
          value={scope}
          onValueChange={(value) => onScopeChange(value as CatalogScope)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="SYSTEM">Hệ thống</SelectItem>
            <SelectItem value="DEPARTMENT">Đơn vị</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {scope === "DEPARTMENT" ? (
        <div className="space-y-2">
          <Label>
            Đơn vị <span className="text-destructive">*</span>
          </Label>
          <Select
            value={ownerDepartmentId || undefined}
            onValueChange={onOwnerDepartmentIdChange}
          >
            <SelectTrigger>
              <SelectValue placeholder="Chọn đơn vị" />
            </SelectTrigger>
            <SelectContent>
              {departments.map((department) => (
                <SelectItem key={entityId(department)} value={entityId(department)}>
                  {department.name} ({department.code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
    </div>
  );
}
