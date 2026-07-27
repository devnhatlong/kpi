import {
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { RoleCode } from '@/common/enums/role-code.enum';
import type { JwtPayloadUser } from '@/common/interfaces';
import { CatalogScope } from './schemas/catalog-scope.enum';

export function userIsSuperAdmin(user: JwtPayloadUser): boolean {
  return user.role.some((item) => item.roleCode === RoleCode.SUPER_ADMIN);
}

export function userScopeDepartmentId(user: JwtPayloadUser): string | null {
  for (const assignment of user.role) {
    if (assignment.scopeDepartmentId) {
      return assignment.scopeDepartmentId;
    }
  }
  return null;
}

export function resolveCatalogScopeForCreate(user: JwtPayloadUser): {
  scope: CatalogScope;
  ownerDepartmentId: Types.ObjectId | null;
} {
  if (userIsSuperAdmin(user)) {
    return { scope: CatalogScope.SYSTEM, ownerDepartmentId: null };
  }
  const deptId = userScopeDepartmentId(user);
  if (!deptId) {
    throw new ForbiddenException('Không xác định được đơn vị làm việc.');
  }
  return {
    scope: CatalogScope.DEPARTMENT,
    ownerDepartmentId: new Types.ObjectId(deptId),
  };
}

export function resolveCatalogScopeForCreateRequest(
  user: JwtPayloadUser,
  requestedScope?: CatalogScope,
  requestedOwnerDepartmentId?: string,
): {
  scope: CatalogScope;
  ownerDepartmentId: Types.ObjectId | null;
} {
  if (userIsSuperAdmin(user)) {
    const scope = requestedScope ?? CatalogScope.SYSTEM;
    if (scope === CatalogScope.SYSTEM) {
      return { scope, ownerDepartmentId: null };
    }
    if (!requestedOwnerDepartmentId) {
      throw new BadRequestException('Vui lòng chọn đơn vị cho phạm vi Đơn vị.');
    }
    return {
      scope,
      ownerDepartmentId: new Types.ObjectId(requestedOwnerDepartmentId),
    };
  }
  return resolveCatalogScopeForCreate(user);
}

export function buildCatalogListFilter(
  user: JwtPayloadUser,
  scope?: CatalogScope,
  ownerDepartmentId?: string,
): Record<string, unknown> {
  if (scope === CatalogScope.SYSTEM) {
    return {
      $or: [
        { scope: CatalogScope.SYSTEM, ownerDepartmentId: null },
        { scope: { $exists: false } },
      ],
    };
  }

  if (userIsSuperAdmin(user)) {
    if (scope === CatalogScope.DEPARTMENT) {
      const filter: Record<string, unknown> = {
        scope: CatalogScope.DEPARTMENT,
      };
      if (ownerDepartmentId) {
        filter.ownerDepartmentId = new Types.ObjectId(ownerDepartmentId);
      }
      return filter;
    }
    if (scope === CatalogScope.SYSTEM) {
      return {
        $or: [
          { scope: CatalogScope.SYSTEM, ownerDepartmentId: null },
          { scope: { $exists: false } },
        ],
      };
    }
    // Super Admin không truyền scope → xem tất cả (hệ thống + đơn vị).
    return {};
  }

  const deptId = userScopeDepartmentId(user);
  if (!deptId) {
    return { _id: { $in: [] } };
  }
  return {
    scope: CatalogScope.DEPARTMENT,
    ownerDepartmentId: new Types.ObjectId(deptId),
  };
}

export function assertCanMutateCatalog(
  user: JwtPayloadUser,
  doc: {
    scope?: CatalogScope;
    ownerDepartmentId?: Types.ObjectId | null;
  },
): void {
  if (userIsSuperAdmin(user)) {
    return;
  }
  const scope = doc.scope ?? CatalogScope.SYSTEM;
  if (scope !== CatalogScope.DEPARTMENT) {
    throw new ForbiddenException('Không có quyền sửa danh mục hệ thống.');
  }
  const deptId = userScopeDepartmentId(user);
  if (!deptId || String(doc.ownerDepartmentId ?? '') !== deptId) {
    throw new ForbiddenException('Không có quyền sửa danh mục đơn vị khác.');
  }
}

export function scopedOwnerDepartmentId(
  scope: CatalogScope,
  ownerDepartmentId?: Types.ObjectId | null,
): Types.ObjectId | null {
  return scope === CatalogScope.DEPARTMENT ? (ownerDepartmentId ?? null) : null;
}

export function assertSameCatalogScope(
  label: string,
  expected: { scope: CatalogScope; ownerDepartmentId?: Types.ObjectId | null },
  actual: { scope?: CatalogScope; ownerDepartmentId?: Types.ObjectId | null },
): void {
  const actualScope = actual.scope ?? CatalogScope.SYSTEM;
  if (actualScope !== expected.scope) {
    throw new BadRequestException(`${label} không cùng phạm vi danh mục.`);
  }
  if (expected.scope === CatalogScope.DEPARTMENT) {
    if (
      String(actual.ownerDepartmentId ?? '') !==
      String(expected.ownerDepartmentId ?? '')
    ) {
      throw new BadRequestException(`${label} không thuộc đơn vị này.`);
    }
  }
}
