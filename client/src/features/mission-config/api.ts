import {
  api,
  buildListQuery,
  unwrapData,
  unwrapPaginated,
} from "@/lib/api-client";
import type { ApiResponse } from "@/features/auth/types";
import type { Department } from "@/features/organization/types";
import type {
  AcceptHandoffInput,
  AssignTaskTargetInput,
  CatalogScope,
  MissionMasterForm,
  MissionMasterFormInput,
  MissionPeriod,
  MissionPeriodInput,
  MissionTemplate,
  MissionTemplateInput,
  MasterFormStatus,
  MasterFormTracking,
  SheetTaskInput,
  TaskAssignment,
  TaskAssignmentInput,
  UnitHandoff,
  UnitHandoffInput,
  UnitMissionSheet,
  UnitMissionSheetInput,
  WorkContent,
  WorkContentInput,
  WorkGroup,
  WorkGroupInput,
} from "./types";

export const missionConfigKeys = {
  groups: (scope?: CatalogScope) =>
    ["mission-config", "groups", scope ?? "default"] as const,
  contents: (scope?: CatalogScope) =>
    ["mission-config", "contents", scope ?? "default"] as const,
  tasks: ["mission-config", "tasks"] as const,
  templates: (scope?: CatalogScope | "all") =>
    ["mission-config", "templates", scope ?? "all"] as const,
  periods: ["mission-config", "periods"] as const,
  sheets: ["mission-config", "sheets"] as const,
  handoffs: ["mission-config", "handoffs"] as const,
  masterForms: ["mission-config", "master-forms"] as const,
};

async function fetchAll<T>(
  path: string,
  extraParams?: Record<string, string | number | boolean | undefined>,
): Promise<T[]> {
  const result = await unwrapPaginated(
    api.get<ApiResponse<T[]>>(path, {
      params: buildListQuery({ all: true, ...extraParams }),
    }),
  );
  return result.data;
}

export function fetchWorkGroups(scope?: CatalogScope) {
  return fetchAll<WorkGroup>(
    "/mission-config/groups/all",
    scope ? { scope } : undefined,
  );
}

export function createWorkGroup(input: WorkGroupInput) {
  return unwrapData(
    api.post<ApiResponse<WorkGroup>>("/mission-config/groups", input),
  );
}

export function updateWorkGroup(id: string, input: Partial<WorkGroupInput>) {
  return unwrapData(
    api.patch<ApiResponse<WorkGroup>>(`/mission-config/groups/${id}`, input),
  );
}

export async function deleteWorkGroup(id: string) {
  return (
    await api.delete<ApiResponse<unknown>>(`/mission-config/groups/${id}`)
  ).data;
}

export function fetchWorkContents(scope?: CatalogScope) {
  return fetchAll<WorkContent>(
    "/mission-config/contents/all",
    scope ? { scope } : undefined,
  );
}

export function createWorkContent(input: WorkContentInput) {
  return unwrapData(
    api.post<ApiResponse<WorkContent>>("/mission-config/contents", input),
  );
}

export function updateWorkContent(
  id: string,
  input: Partial<WorkContentInput>,
) {
  return unwrapData(
    api.patch<ApiResponse<WorkContent>>(
      `/mission-config/contents/${id}`,
      input,
    ),
  );
}

export async function deleteWorkContent(id: string) {
  return (
    await api.delete<ApiResponse<unknown>>(`/mission-config/contents/${id}`)
  ).data;
}

export function fetchTaskAssignments() {
  return fetchAll<TaskAssignment>("/mission-config/tasks/all");
}

export function createTaskAssignment(input: TaskAssignmentInput) {
  return unwrapData(
    api.post<ApiResponse<TaskAssignment>>("/mission-config/tasks", input),
  );
}

export function updateTaskAssignment(
  id: string,
  input: Partial<TaskAssignmentInput>,
) {
  return unwrapData(
    api.patch<ApiResponse<TaskAssignment>>(
      `/mission-config/tasks/${id}`,
      input,
    ),
  );
}

export async function deleteTaskAssignment(id: string) {
  return (await api.delete<ApiResponse<unknown>>(`/mission-config/tasks/${id}`))
    .data;
}

export function assignTaskTarget(id: string, input: AssignTaskTargetInput) {
  return unwrapData(
    api.post<ApiResponse<unknown>>(
      `/mission-config/tasks/${id}/assign-target`,
      input,
    ),
  );
}

export function fetchMissionTemplates(scope?: CatalogScope) {
  return fetchAll<MissionTemplate>(
    "/mission-config/templates/all",
    scope ? { scope } : undefined,
  );
}

export function createMissionTemplate(input: MissionTemplateInput) {
  return unwrapData(
    api.post<ApiResponse<MissionTemplate>>("/mission-config/templates", input),
  );
}

export function updateMissionTemplate(
  id: string,
  input: Partial<MissionTemplateInput>,
) {
  return unwrapData(
    api.patch<ApiResponse<MissionTemplate>>(
      `/mission-config/templates/${id}`,
      input,
    ),
  );
}

export async function deleteMissionTemplate(id: string) {
  return (
    await api.delete<ApiResponse<unknown>>(`/mission-config/templates/${id}`)
  ).data;
}

export function fetchMissionPeriods() {
  return fetchAll<MissionPeriod>("/mission-config/periods/all");
}

export function createMissionPeriod(input: MissionPeriodInput) {
  return unwrapData(
    api.post<ApiResponse<MissionPeriod>>("/mission-config/periods", input),
  );
}

export function updateMissionPeriod(
  id: string,
  input: Partial<MissionPeriodInput>,
) {
  return unwrapData(
    api.patch<ApiResponse<MissionPeriod>>(
      `/mission-config/periods/${id}`,
      input,
    ),
  );
}

export async function deleteMissionPeriod(id: string) {
  return (
    await api.delete<ApiResponse<unknown>>(`/mission-config/periods/${id}`)
  ).data;
}

export function fetchUnitMissionSheets(params?: {
  departmentId?: string;
  periodId?: string;
}) {
  return fetchAll<UnitMissionSheet>("/mission-config/sheets/all", params);
}

export function createUnitMissionSheet(input: UnitMissionSheetInput) {
  return unwrapData(
    api.post<ApiResponse<UnitMissionSheet>>("/mission-config/sheets", input),
  );
}

export function fetchUnitMissionSheet(id: string) {
  return unwrapData(
    api.get<ApiResponse<UnitMissionSheet>>(`/mission-config/sheets/${id}`),
  );
}

export function fetchSheetTasks(sheetId: string) {
  return unwrapData(
    api.get<ApiResponse<TaskAssignment[]>>(
      `/mission-config/sheets/${sheetId}/tasks`,
    ),
  );
}

export function createSheetTask(sheetId: string, input: SheetTaskInput) {
  return unwrapData(
    api.post<ApiResponse<TaskAssignment>>(
      `/mission-config/sheets/${sheetId}/tasks`,
      input,
    ),
  );
}

export function fetchHandoffs(params: {
  departmentId: string;
  direction: "out" | "in";
  periodId?: string;
  status?: string;
}) {
  return fetchAll<UnitHandoff>("/mission-config/handoffs/all", params);
}

export function createHandoff(input: UnitHandoffInput) {
  return unwrapData(
    api.post<ApiResponse<UnitHandoff>>("/mission-config/handoffs", input),
  );
}

export function acceptHandoff(id: string, input: AcceptHandoffInput = {}) {
  return unwrapData(
    api.post<ApiResponse<{ handoff: UnitHandoff; task: TaskAssignment }>>(
      `/mission-config/handoffs/${id}/accept`,
      input,
    ),
  );
}

export function rejectHandoff(id: string, rejectReason?: string) {
  return unwrapData(
    api.post<ApiResponse<UnitHandoff>>(
      `/mission-config/handoffs/${id}/reject`,
      {
        rejectReason,
      },
    ),
  );
}

export function cancelHandoff(id: string) {
  return unwrapData(
    api.post<ApiResponse<UnitHandoff>>(`/mission-config/handoffs/${id}/cancel`),
  );
}

export function fetchMyWorkingDepartments() {
  return unwrapData(
    api.get<ApiResponse<Department[]>>("/mission-config/my-departments"),
  );
}

export function fetchPeerDepartments(departmentId: string) {
  return unwrapData(
    api.get<ApiResponse<Department[]>>(
      `/mission-config/departments/${departmentId}/peers`,
    ),
  );
}

export function fetchChildDepartments(departmentId: string) {
  return unwrapData(
    api.get<ApiResponse<Department[]>>(
      `/mission-config/departments/${departmentId}/children`,
    ),
  );
}

export function fetchMasterForms() {
  return fetchAll<MissionMasterForm>("/mission-config/master-forms/all");
}

export function fetchMasterForm(id: string) {
  return unwrapData(
    api.get<ApiResponse<MissionMasterForm>>(
      `/mission-config/master-forms/${id}`,
    ),
  );
}

export function createMasterForm(input: MissionMasterFormInput) {
  return unwrapData(
    api.post<ApiResponse<MissionMasterForm>>(
      "/mission-config/master-forms",
      input,
    ),
  );
}

export function updateMasterForm(
  id: string,
  input: Partial<MissionMasterFormInput> & { status?: MasterFormStatus },
) {
  return unwrapData(
    api.patch<ApiResponse<MissionMasterForm>>(
      `/mission-config/master-forms/${id}`,
      input,
    ),
  );
}

export function markMasterFormReady(id: string) {
  return unwrapData(
    api.post<ApiResponse<MissionMasterForm>>(
      `/mission-config/master-forms/${id}/ready`,
    ),
  );
}

export function publishMasterForm(id: string) {
  return unwrapData(
    api.post<
      ApiResponse<{
        form: MissionMasterForm;
        phongCount: number;
        sheetsCreated: number;
        tasksCreated: number;
      }>
    >(`/mission-config/master-forms/${id}/publish`),
  );
}

export function setMasterFormStatus(id: string, status: MasterFormStatus) {
  return unwrapData(
    api.post<ApiResponse<MissionMasterForm>>(
      `/mission-config/master-forms/${id}/status`,
      { status },
    ),
  );
}

export function fetchMasterFormTracking(id: string) {
  return unwrapData(
    api.get<ApiResponse<MasterFormTracking>>(
      `/mission-config/master-forms/${id}/tracking`,
    ),
  );
}

export async function deleteMasterForm(id: string) {
  return (
    await api.delete<ApiResponse<unknown>>(`/mission-config/master-forms/${id}`)
  ).data;
}

export async function fetchServerTime(): Promise<{
  serverTime: string;
  timezone: string;
}> {
  return (
    await api.get<{ serverTime: string; timezone: string }>(
      "/system/server-time",
    )
  ).data;
}
