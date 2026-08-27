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
  rank?: string;
  departmentId?: string;
  departmentName?: string | null;
  roleAssignments: AuthRoleAssignment[];
  /** Mã quyền gộp từ các vai trò đang giữ - server tính trong /auth/me. */
  permissions?: string[];
  isActive: boolean;
  lastLoginAt?: string | null;
};

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

/**
 * Nhãn dự phòng khi chỉ có mã vai trò trong tay - tên thật lấy từ bảng vai trò
 * bên server. Xếp từ cao xuống thấp đúng bậc nghiệp vụ.
 */
export const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Quản trị hệ thống",
  CAT_ADMIN: "Công an tỉnh",
  UNIT_ADMIN: "Trưởng phòng, trưởng xã",
  VICE_UNIT_ADMIN: "Phó phòng, phó xã",
  MANAGER: "Đội trưởng",
  STAFF: "Cán bộ chiến sĩ",
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

/** Bậc vai trò từ thấp lên cao - để chọn vai trò "chính" khi giữ nhiều vai trò. */
const ROLE_RANK: string[] = [
  "STAFF",
  "MANAGER",
  "VICE_UNIT_ADMIN",
  "UNIT_ADMIN",
  "CAT_ADMIN",
  "SUPER_ADMIN",
];

/**
 * Vai trò cao nhất người này đang giữ.
 *
 * Một tài khoản có chức vụ nay giữ nhiều vai trò cùng lúc, mà `roleAssignments`
 * xếp theo thứ tự lúc gán chứ không theo bậc - lấy phần tử đầu là đội trưởng
 * hiện ra thành "Cán bộ chiến sĩ" chỉ vì vai trò đó được gán trước.
 */
export function highestRoleCode(user: AuthUser | null | undefined): string {
  let best = "";
  let bestRank = -1;
  for (const { roleCode } of user?.roleAssignments ?? []) {
    const rank = ROLE_RANK.indexOf(roleCode);
    // Vai trò tự tạo không có trong bảng bậc: vẫn nhận, nhưng nhường mọi vai
    // trò hệ thống - dùng làm nhãn khi người này không giữ vai trò nào khác.
    if (rank > bestRank || (bestRank < 0 && !best)) {
      best = roleCode;
      bestRank = rank;
    }
  }
  return best;
}

export function primaryRoleLabel(user: AuthUser): string {
  const code = highestRoleCode(user);
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

/**
 * Có ít nhất một trong các quyền yêu cầu.
 * Chỉ dùng để ẩn/hiện giao diện - chốt chặn thật nằm ở PermissionsGuard bên
 * server, nên sai lệch ở đây không mở thêm được gì.
 */
export function userHasAnyPermission(
  user: AuthUser | null | undefined,
  permissions: readonly string[],
): boolean {
  if (permissions.length === 0) return true;
  if (!user?.permissions?.length) return false;
  const set = new Set(user.permissions);
  return permissions.some((code) => set.has(code));
}
