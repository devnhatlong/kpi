import { api, buildListQuery, unwrapData, unwrapPaginated } from "@/lib/api-client";
import type {
  ApiResponse,
  AppPermission,
  CreateDepartmentInput,
  CreateDepartmentLevelInput,
  CreatePermissionInput,
  CreateRoleInput,
  Department,
  DepartmentLevel,
  ImportDepartmentRow,
  ImportDepartmentsResult,
  ListQueryParams,
  PaginatedResult,
  Role,
  UpdateDepartmentInput,
  UpdateDepartmentLevelInput,
  UpdatePermissionInput,
  UpdateRoleInput,
  UserAccount,
} from "@/features/organization/types";

export const departmentKeys = {
  all: ["departments"] as const,
  list: (params: ListQueryParams) =>
    ["departments", params.page, params.limit, params.q ?? "", params.all ?? false] as const,
  levels: ["department-levels"] as const,
  levelsList: (params: ListQueryParams) =>
    [
      "department-levels",
      params.page,
      params.limit,
      params.q ?? "",
      params.all ?? false,
    ] as const,
  users: ["users"] as const,
  usersList: (params: ListQueryParams) =>
    ["users", params.page, params.limit, params.q ?? "", params.all ?? false] as const,
};

export const roleKeys = {
  all: ["roles"] as const,
  list: (params: ListQueryParams) =>
    ["roles", params.page, params.limit, params.q ?? "", params.all ?? false] as const,
};

export const permissionKeys = {
  all: ["permissions"] as const,
  list: (params: ListQueryParams) =>
    ["permissions", params.page, params.limit, params.q ?? "", params.all ?? false] as const,
};

export async function fetchDepartments() {
  const result = await unwrapPaginated(
    api.get<ApiResponse<Department[]>>("/departments/all", {
      params: buildListQuery({ all: true }),
    }),
  );
  return result.data;
}

export async function fetchDepartmentsPage(
  params: ListQueryParams,
): Promise<PaginatedResult<Department>> {
  return unwrapPaginated(
    api.get<ApiResponse<Department[]>>("/departments/all", {
      params: buildListQuery(params),
    }),
  );
}

export async function createDepartment(input: CreateDepartmentInput) {
  return unwrapData(api.post<ApiResponse<Department>>("/departments", input));
}

export async function updateDepartment(id: string, input: UpdateDepartmentInput) {
  return unwrapData(api.patch<ApiResponse<Department>>(`/departments/${id}`, input));
}

export async function deleteDepartment(id: string) {
  const { data } = await api.delete<ApiResponse<unknown>>(`/departments/${id}`);
  return data;
}

export async function importDepartments(rows: ImportDepartmentRow[]) {
  return unwrapData(
    api.post<ApiResponse<ImportDepartmentsResult>>("/departments/import", { rows }),
  );
}

/** Dropdown / tree: lấy toàn bộ */
export async function fetchDepartmentLevels() {
  const result = await unwrapPaginated(
    api.get<ApiResponse<DepartmentLevel[]>>("/department-levels/all", {
      params: buildListQuery({ all: true }),
    }),
  );
  return result.data;
}

export async function fetchDepartmentLevelsPage(
  params: ListQueryParams,
): Promise<PaginatedResult<DepartmentLevel>> {
  return unwrapPaginated(
    api.get<ApiResponse<DepartmentLevel[]>>("/department-levels/all", {
      params: buildListQuery(params),
    }),
  );
}

export async function createDepartmentLevel(input: CreateDepartmentLevelInput) {
  return unwrapData(
    api.post<ApiResponse<DepartmentLevel>>("/department-levels", input),
  );
}

export async function updateDepartmentLevel(id: string, input: UpdateDepartmentLevelInput) {
  return unwrapData(
    api.patch<ApiResponse<DepartmentLevel>>(`/department-levels/${id}`, input),
  );
}

export async function deleteDepartmentLevel(id: string) {
  const { data } = await api.delete<ApiResponse<unknown>>(`/department-levels/${id}`);
  return data;
}

export async function fetchRolesPage(
  params: ListQueryParams,
): Promise<PaginatedResult<Role>> {
  return unwrapPaginated(
    api.get<ApiResponse<Role[]>>("/roles/all", {
      params: buildListQuery(params),
    }),
  );
}

export async function createRole(input: CreateRoleInput) {
  return unwrapData(api.post<ApiResponse<Role>>("/roles", input));
}

export async function updateRole(id: string, input: UpdateRoleInput) {
  return unwrapData(api.patch<ApiResponse<Role>>(`/roles/${id}`, input));
}

export async function deleteRole(id: string) {
  const { data } = await api.delete<ApiResponse<unknown>>(`/roles/${id}`);
  return data;
}

/** Dropdown form: lấy toàn bộ quyền */
export async function fetchPermissions() {
  const result = await unwrapPaginated(
    api.get<ApiResponse<AppPermission[]>>("/permissions/all", {
      params: buildListQuery({ all: true }),
    }),
  );
  return result.data;
}

export async function fetchPermissionsPage(
  params: ListQueryParams,
): Promise<PaginatedResult<AppPermission>> {
  return unwrapPaginated(
    api.get<ApiResponse<AppPermission[]>>("/permissions/all", {
      params: buildListQuery(params),
    }),
  );
}

export async function createPermission(input: CreatePermissionInput) {
  return unwrapData(api.post<ApiResponse<AppPermission>>("/permissions", input));
}

export async function updatePermission(id: string, input: UpdatePermissionInput) {
  return unwrapData(
    api.patch<ApiResponse<AppPermission>>(`/permissions/${id}`, input),
  );
}

export async function deletePermission(id: string) {
  const { data } = await api.delete<ApiResponse<unknown>>(`/permissions/${id}`);
  return data;
}

/** Units view: lấy toàn bộ users để lọc theo đơn vị */
export async function fetchUsers() {
  const result = await unwrapPaginated(
    api.get<ApiResponse<UserAccount[]>>("/users/all", {
      params: buildListQuery({ all: true }),
    }),
  );
  return result.data;
}

export async function fetchUsersPage(
  params: ListQueryParams,
): Promise<PaginatedResult<UserAccount>> {
  return unwrapPaginated(
    api.get<ApiResponse<UserAccount[]>>("/users/all", {
      params: buildListQuery(params),
    }),
  );
}
