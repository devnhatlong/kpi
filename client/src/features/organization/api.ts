import { api, unwrapData } from "@/lib/api-client";
import type {
  ApiResponse,
  CreateDepartmentInput,
  Department,
  DepartmentLevel,
  ImportDepartmentRow,
  ImportDepartmentsResult,
  UpdateDepartmentInput,
  UserAccount,
} from "@/features/organization/types";

export const departmentKeys = {
  all: ["departments"] as const,
  levels: ["department-levels"] as const,
  users: ["users"] as const,
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

export async function fetchUsers() {
  return unwrapData(api.get<ApiResponse<UserAccount[]>>("/users/all"));
}
