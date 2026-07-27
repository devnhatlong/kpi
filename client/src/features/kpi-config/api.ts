import { api, buildListQuery, unwrapData, unwrapPaginated } from "@/lib/api-client";
import type { ApiResponse } from "@/features/auth/types";
import type { Department } from "@/features/organization/types";
import type {
  AcceptHandoffInput,
  AssignTaskTargetInput,
  KpiMasterForm,
  KpiMasterFormInput,
  KpiPeriod,
  KpiPeriodInput,
  KpiTemplate,
  KpiTemplateInput,
  MasterFormStatus,
  MasterFormTracking,
  SheetTaskInput,
  TaskAssignment,
  TaskAssignmentInput,
  UnitHandoff,
  UnitHandoffInput,
  UnitKpiSheet,
  UnitKpiSheetInput,
  WorkContent,
  WorkContentInput,
  WorkGroup,
  WorkGroupInput,
} from "./types";

export const kpiConfigKeys = {
  groups: ["kpi-config", "groups"] as const,
  contents: ["kpi-config", "contents"] as const,
  tasks: ["kpi-config", "tasks"] as const,
  templates: ["kpi-config", "templates"] as const,
  periods: ["kpi-config", "periods"] as const,
  sheets: ["kpi-config", "sheets"] as const,
  handoffs: ["kpi-config", "handoffs"] as const,
  masterForms: ["kpi-config", "master-forms"] as const,
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

export function assignTaskTarget(id: string, input: AssignTaskTargetInput) {
  return unwrapData(
    api.post<ApiResponse<unknown>>(`/kpi-config/tasks/${id}/assign-target`, input),
  );
}

export function fetchKpiTemplates() {
  return fetchAll<KpiTemplate>("/kpi-config/templates/all");
}

export function createKpiTemplate(input: KpiTemplateInput) {
  return unwrapData(
    api.post<ApiResponse<KpiTemplate>>("/kpi-config/templates", input),
  );
}

export function updateKpiTemplate(id: string, input: Partial<KpiTemplateInput>) {
  return unwrapData(
    api.patch<ApiResponse<KpiTemplate>>(`/kpi-config/templates/${id}`, input),
  );
}

export async function deleteKpiTemplate(id: string) {
  return (await api.delete<ApiResponse<unknown>>(`/kpi-config/templates/${id}`))
    .data;
}

export function fetchKpiPeriods() {
  return fetchAll<KpiPeriod>("/kpi-config/periods/all");
}

export function createKpiPeriod(input: KpiPeriodInput) {
  return unwrapData(api.post<ApiResponse<KpiPeriod>>("/kpi-config/periods", input));
}

export function updateKpiPeriod(id: string, input: Partial<KpiPeriodInput>) {
  return unwrapData(
    api.patch<ApiResponse<KpiPeriod>>(`/kpi-config/periods/${id}`, input),
  );
}

export async function deleteKpiPeriod(id: string) {
  return (await api.delete<ApiResponse<unknown>>(`/kpi-config/periods/${id}`)).data;
}

export function fetchUnitKpiSheets(params?: {
  departmentId?: string;
  periodId?: string;
}) {
  return fetchAll<UnitKpiSheet>("/kpi-config/sheets/all", params);
}

export function createUnitKpiSheet(input: UnitKpiSheetInput) {
  return unwrapData(
    api.post<ApiResponse<UnitKpiSheet>>("/kpi-config/sheets", input),
  );
}

export function fetchUnitKpiSheet(id: string) {
  return unwrapData(api.get<ApiResponse<UnitKpiSheet>>(`/kpi-config/sheets/${id}`));
}

export function fetchSheetTasks(sheetId: string) {
  return unwrapData(
    api.get<ApiResponse<TaskAssignment[]>>(`/kpi-config/sheets/${sheetId}/tasks`),
  );
}

export function createSheetTask(sheetId: string, input: SheetTaskInput) {
  return unwrapData(
    api.post<ApiResponse<TaskAssignment>>(
      `/kpi-config/sheets/${sheetId}/tasks`,
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
  return fetchAll<UnitHandoff>("/kpi-config/handoffs/all", params);
}

export function createHandoff(input: UnitHandoffInput) {
  return unwrapData(
    api.post<ApiResponse<UnitHandoff>>("/kpi-config/handoffs", input),
  );
}

export function acceptHandoff(id: string, input: AcceptHandoffInput = {}) {
  return unwrapData(
    api.post<ApiResponse<{ handoff: UnitHandoff; task: TaskAssignment }>>(
      `/kpi-config/handoffs/${id}/accept`,
      input,
    ),
  );
}

export function rejectHandoff(id: string, rejectReason?: string) {
  return unwrapData(
    api.post<ApiResponse<UnitHandoff>>(`/kpi-config/handoffs/${id}/reject`, {
      rejectReason,
    }),
  );
}

export function cancelHandoff(id: string) {
  return unwrapData(
    api.post<ApiResponse<UnitHandoff>>(`/kpi-config/handoffs/${id}/cancel`),
  );
}

export function fetchMyWorkingDepartments() {
  return unwrapData(
    api.get<ApiResponse<Department[]>>("/kpi-config/my-departments"),
  );
}

export function fetchPeerDepartments(departmentId: string) {
  return unwrapData(
    api.get<ApiResponse<Department[]>>(
      `/kpi-config/departments/${departmentId}/peers`,
    ),
  );
}

export function fetchChildDepartments(departmentId: string) {
  return unwrapData(
    api.get<ApiResponse<Department[]>>(
      `/kpi-config/departments/${departmentId}/children`,
    ),
  );
}

export function fetchMasterForms() {
  return fetchAll<KpiMasterForm>("/kpi-config/master-forms/all");
}

export function fetchMasterForm(id: string) {
  return unwrapData(
    api.get<ApiResponse<KpiMasterForm>>(`/kpi-config/master-forms/${id}`),
  );
}

export function createMasterForm(input: KpiMasterFormInput) {
  return unwrapData(
    api.post<ApiResponse<KpiMasterForm>>("/kpi-config/master-forms", input),
  );
}

export function updateMasterForm(
  id: string,
  input: Partial<KpiMasterFormInput> & { status?: MasterFormStatus },
) {
  return unwrapData(
    api.patch<ApiResponse<KpiMasterForm>>(
      `/kpi-config/master-forms/${id}`,
      input,
    ),
  );
}

export function markMasterFormReady(id: string) {
  return unwrapData(
    api.post<ApiResponse<KpiMasterForm>>(
      `/kpi-config/master-forms/${id}/ready`,
    ),
  );
}

export function publishMasterForm(id: string) {
  return unwrapData(
    api.post<
      ApiResponse<{
        form: KpiMasterForm;
        phongCount: number;
        sheetsCreated: number;
        tasksCreated: number;
      }>
    >(`/kpi-config/master-forms/${id}/publish`),
  );
}

export function setMasterFormStatus(id: string, status: MasterFormStatus) {
  return unwrapData(
    api.post<ApiResponse<KpiMasterForm>>(
      `/kpi-config/master-forms/${id}/status`,
      { status },
    ),
  );
}

export function fetchMasterFormTracking(id: string) {
  return unwrapData(
    api.get<ApiResponse<MasterFormTracking>>(
      `/kpi-config/master-forms/${id}/tracking`,
    ),
  );
}

export async function deleteMasterForm(id: string) {
  return (
    await api.delete<ApiResponse<unknown>>(`/kpi-config/master-forms/${id}`)
  ).data;
}
