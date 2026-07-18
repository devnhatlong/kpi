import { api, unwrapData } from "@/lib/api-client";
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
  Role,
  UpdateDepartmentInput,
  UpdateDepartmentLevelInput,
  UpdatePermissionInput,
  UpdateRoleInput,
  UserAccount,
} from "@/features/organization/types";

export const departmentKeys = {
  all: ["departments"] as const,
  levels: ["department-levels"] as const,
  users: ["users"] as const,
};

export const roleKeys = {
  all: ["roles"] as const,
};

export const permissionKeys = {
  all: ["permissions"] as const,
};

export async function fetchDepartments() {
  return unwrapData(api.get<ApiResponse<Department[]>>("/departments/all"));
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

export async function fetchDepartmentLevels() {
  return unwrapData(api.get<ApiResponse<DepartmentLevel[]>>("/department-levels/all"));
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

export async function fetchRoles() {
  return unwrapData(api.get<ApiResponse<Role[]>>("/roles/all"));
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

export async function fetchPermissions() {
  return unwrapData(api.get<ApiResponse<AppPermission[]>>("/permissions/all"));
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

export async function fetchUsers() {
  return unwrapData(api.get<ApiResponse<UserAccount[]>>("/users/all"));
}
