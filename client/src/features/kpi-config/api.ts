import { api, buildListQuery, unwrapData, unwrapPaginated } from "@/lib/api-client";
import type { ApiResponse } from "@/features/auth/types";
import type {
  TaskAssignment,
  TaskAssignmentInput,
  WorkContent,
  WorkContentInput,
  WorkGroup,
  WorkGroupInput,
} from "./types";

export const kpiConfigKeys = {
  groups: ["kpi-config", "groups"] as const,
  contents: ["kpi-config", "contents"] as const,
  tasks: ["kpi-config", "tasks"] as const,
};

async function fetchAll<T>(path: string): Promise<T[]> {
  const result = await unwrapPaginated(
    api.get<ApiResponse<T[]>>(path, { params: buildListQuery({ all: true }) }),
  );
  return result.data;
}

export function fetchWorkGroups() {
  return fetchAll<WorkGroup>("/kpi-config/groups/all");
}

export function createWorkGroup(input: WorkGroupInput) {
  return unwrapData(api.post<ApiResponse<WorkGroup>>("/kpi-config/groups", input));
}

export function updateWorkGroup(id: string, input: Partial<WorkGroupInput>) {
  return unwrapData(api.patch<ApiResponse<WorkGroup>>(`/kpi-config/groups/${id}`, input));
}

export async function deleteWorkGroup(id: string) {
  return (await api.delete<ApiResponse<unknown>>(`/kpi-config/groups/${id}`)).data;
}

export function fetchWorkContents() {
  return fetchAll<WorkContent>("/kpi-config/contents/all");
}

export function createWorkContent(input: WorkContentInput) {
  return unwrapData(api.post<ApiResponse<WorkContent>>("/kpi-config/contents", input));
}

export function updateWorkContent(id: string, input: Partial<WorkContentInput>) {
  return unwrapData(
    api.patch<ApiResponse<WorkContent>>(`/kpi-config/contents/${id}`, input),
  );
}

export async function deleteWorkContent(id: string) {
  return (await api.delete<ApiResponse<unknown>>(`/kpi-config/contents/${id}`)).data;
}

export function fetchTaskAssignments() {
  return fetchAll<TaskAssignment>("/kpi-config/tasks/all");
}

export function createTaskAssignment(input: TaskAssignmentInput) {
  return unwrapData(api.post<ApiResponse<TaskAssignment>>("/kpi-config/tasks", input));
}

export function updateTaskAssignment(
  id: string,
  input: Partial<TaskAssignmentInput>,
) {
  return unwrapData(
    api.patch<ApiResponse<TaskAssignment>>(`/kpi-config/tasks/${id}`, input),
  );
}

export async function deleteTaskAssignment(id: string) {
  return (await api.delete<ApiResponse<unknown>>(`/kpi-config/tasks/${id}`)).data;
}
