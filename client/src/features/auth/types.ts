export type ApiResponse<T> = {
  success: boolean;
  message: string;
  data?: T;
  meta?: PaginationMeta;
  timestamp?: string;
  path?: string;
  responseTime?: string;
};

export type PaginationMeta = {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export type PaginatedResult<T> = {
  data: T[];
  meta: PaginationMeta;
};

export type ListQueryParams = {
  page?: number;
  limit?: number;
  q?: string;
  all?: boolean;
};

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
};

export type AuthRoleAssignment = {
  roleCode: string;
  scopeDepartmentId?: string | null;
};

export type AuthUser = {
  id: string;
  username: string;
  fullName?: string;
  email?: string;
  phone?: string;
  position?: string;
  departmentId?: string;
  departmentName?: string | null;
  roleAssignments: AuthRoleAssignment[];
  isActive: boolean;
  lastLoginAt?: string | null;
};

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

export const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Quản trị hệ thống",
  UNIT_ADMIN: "Quản trị đơn vị",
  MANAGER: "Quản lý",
  STAFF: "Cán bộ",
};

export function displayNameOf(user: AuthUser): string {
  return user.fullName?.trim() || user.username;
}

export function initialsOf(user: AuthUser): string {
  const name = displayNameOf(user).trim();
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase() || "?";
}

export function primaryRoleLabel(user: AuthUser): string {
  const code = user.roleAssignments[0]?.roleCode;
  if (!code) return "Người dùng";
  return ROLE_LABELS[code] ?? code;
}

export function userHasAnyRole(
  user: AuthUser | null | undefined,
  roles: readonly string[],
): boolean {
  if (!user?.roleAssignments?.length || roles.length === 0) return false;
  const set = new Set(user.roleAssignments.map((r) => r.roleCode));
  return roles.some((role) => set.has(role));
}

export function isSuperAdmin(user: AuthUser | null | undefined): boolean {
  return userHasAnyRole(user, ["SUPER_ADMIN"]);
}
