import {
  api,
  buildListQuery,
  unwrapData,
  unwrapPaginated,
} from "@/lib/api-client";
import type { ApiResponse } from "@/features/auth/types";
import type {
  Axis,
  AxisInput,
  FormTemplate,
  FormTemplateInput,
  ListQueryParams,
  PaginatedResult,
  QualityLevel,
  QualityLevelInput,
  ScoreGroup,
  ScoreGroupInput,
  WorkContent,
  WorkContentInput,
  WorkTask,
  WorkTaskInput,
} from "./types";

export const axisKeys = {
  all: ["axes"] as const,
  list: (params: ListQueryParams) =>
    [
      "axes",
      params.page,
      params.limit,
      params.q ?? "",
      params.all ?? false,
    ] as const,
};

export async function fetchAxesPage(
  params: ListQueryParams,
): Promise<PaginatedResult<Axis>> {
  return unwrapPaginated(
    api.get<ApiResponse<Axis[]>>("/kpi-form-config/axes/all", {
      params: buildListQuery(params),
    }),
  );
}

export async function fetchAxesAll() {
  const result = await fetchAxesPage({ all: true });
  return result.data.filter((item) => item.isActive);
}

export function createAxis(input: AxisInput) {
  return unwrapData(
    api.post<ApiResponse<Axis>>("/kpi-form-config/axes", input),
  );
}

export function updateAxis(id: string, input: Partial<AxisInput>) {
  return unwrapData(
    api.patch<ApiResponse<Axis>>(`/kpi-form-config/axes/${id}`, input),
  );
}

export async function deleteAxis(id: string) {
  await api.delete(`/kpi-form-config/axes/${id}`);
}

export const workContentKeys = {
  all: ["work-contents"] as const,
  list: (params: ListQueryParams) =>
    [
      "work-contents",
      params.page,
      params.limit,
      params.q ?? "",
      params.all ?? false,
    ] as const,
};

export async function fetchWorkContentsPage(
  params: ListQueryParams,
): Promise<PaginatedResult<WorkContent>> {
  return unwrapPaginated(
    api.get<ApiResponse<WorkContent[]>>("/kpi-form-config/work-contents/all", {
      params: buildListQuery(params),
    }),
  );
}

export async function fetchWorkContentsAll() {
  const result = await fetchWorkContentsPage({ all: true });
  return result.data.filter((item) => item.isActive);
}

export function createWorkContent(input: WorkContentInput) {
  return unwrapData(
    api.post<ApiResponse<WorkContent>>("/kpi-form-config/work-contents", input),
  );
}

export function updateWorkContent(
  id: string,
  input: Partial<WorkContentInput>,
) {
  return unwrapData(
    api.patch<ApiResponse<WorkContent>>(
      `/kpi-form-config/work-contents/${id}`,
      input,
    ),
  );
}

export async function deleteWorkContent(id: string) {
  await api.delete(`/kpi-form-config/work-contents/${id}`);
}

export const workTaskKeys = {
  all: ["work-tasks"] as const,
  list: (params: ListQueryParams & { workContentId?: string }) =>
    [
      "work-tasks",
      params.page,
      params.limit,
      params.q ?? "",
      params.all ?? false,
      params.workContentId ?? "",
    ] as const,
};

export async function fetchWorkTasksPage(
  params: ListQueryParams & { workContentId?: string },
): Promise<PaginatedResult<WorkTask>> {
  return unwrapPaginated(
    api.get<ApiResponse<WorkTask[]>>("/kpi-form-config/work-tasks/all", {
      params: {
        ...buildListQuery(params),
        ...(params.workContentId
          ? { workContentId: params.workContentId }
          : {}),
      },
    }),
  );
}

/** Nhiệm vụ đang dùng được; truyền nội dung công việc để lọc cho form nhập. */
export async function fetchWorkTasksAll(workContentId?: string) {
  const result = await fetchWorkTasksPage({ all: true, workContentId });
  return result.data.filter((item) => item.isActive);
}

export function createWorkTask(input: WorkTaskInput) {
  return unwrapData(
    api.post<ApiResponse<WorkTask>>("/kpi-form-config/work-tasks", input),
  );
}

export function updateWorkTask(id: string, input: Partial<WorkTaskInput>) {
  return unwrapData(
    api.patch<ApiResponse<WorkTask>>(
      `/kpi-form-config/work-tasks/${id}`,
      input,
    ),
  );
}

export async function deleteWorkTask(id: string) {
  await api.delete(`/kpi-form-config/work-tasks/${id}`);
}
export const scoreGroupKeys = {
  all: ["score-groups"] as const,
  list: (params: ListQueryParams) =>
    [
      "score-groups",
      params.page,
      params.limit,
      params.q ?? "",
      params.all ?? false,
    ] as const,
};

export async function fetchScoreGroupsPage(
  params: ListQueryParams,
): Promise<PaginatedResult<ScoreGroup>> {
  return unwrapPaginated(
    api.get<ApiResponse<ScoreGroup[]>>("/kpi-form-config/score-groups/all", {
      params: buildListQuery(params),
    }),
  );
}

export async function fetchScoreGroupsAll() {
  const result = await fetchScoreGroupsPage({ all: true });
  return result.data.filter((item) => item.isActive);
}

export function createScoreGroup(input: ScoreGroupInput) {
  return unwrapData(
    api.post<ApiResponse<ScoreGroup>>("/kpi-form-config/score-groups", input),
  );
}

export function updateScoreGroup(id: string, input: Partial<ScoreGroupInput>) {
  return unwrapData(
    api.patch<ApiResponse<ScoreGroup>>(
      `/kpi-form-config/score-groups/${id}`,
      input,
    ),
  );
}

export async function deleteScoreGroup(id: string) {
  await api.delete(`/kpi-form-config/score-groups/${id}`);
}

export const qualityLevelKeys = {
  all: ["quality-levels"] as const,
  list: (params: ListQueryParams) =>
    [
      "quality-levels",
      params.page,
      params.limit,
      params.q ?? "",
      params.all ?? false,
    ] as const,
};

export async function fetchQualityLevelsPage(
  params: ListQueryParams,
): Promise<PaginatedResult<QualityLevel>> {
  return unwrapPaginated(
    api.get<ApiResponse<QualityLevel[]>>(
      "/kpi-form-config/quality-levels/all",
      { params: buildListQuery(params) },
    ),
  );
}

export async function fetchQualityLevelsAll() {
  const result = await fetchQualityLevelsPage({ all: true });
  return result.data.filter((item) => item.isActive);
}

export function createQualityLevel(input: QualityLevelInput) {
  return unwrapData(
    api.post<ApiResponse<QualityLevel>>(
      "/kpi-form-config/quality-levels",
      input,
    ),
  );
}

export function updateQualityLevel(
  id: string,
  input: Partial<QualityLevelInput>,
) {
  return unwrapData(
    api.patch<ApiResponse<QualityLevel>>(
      `/kpi-form-config/quality-levels/${id}`,
      input,
    ),
  );
}

export async function deleteQualityLevel(id: string) {
  await api.delete(`/kpi-form-config/quality-levels/${id}`);
}

export const formTemplateKeys = {
  all: ["form-templates"] as const,
  list: (params: ListQueryParams) =>
    [
      "form-templates",
      params.page,
      params.limit,
      params.q ?? "",
      params.all ?? false,
    ] as const,
  byAxis: (axisId: string) => ["form-template-by-axis", axisId] as const,
};

export async function fetchFormTemplatesPage(
  params: ListQueryParams,
): Promise<PaginatedResult<FormTemplate>> {
  return unwrapPaginated(
    api.get<ApiResponse<FormTemplate[]>>(
      "/kpi-form-config/form-templates/all",
      {
        params: buildListQuery(params),
      },
    ),
  );
}

export async function fetchFormTemplatesAll() {
  const result = await fetchFormTemplatesPage({ all: true });
  return result.data.filter((item) => item.isActive);
}

/** Mẫu áp dụng cho trục - null nghĩa là trục chưa gán, dùng bộ cột mặc định. */
export async function fetchFormTemplateByAxis(
  axisId: string,
): Promise<FormTemplate | null> {
  if (!axisId) return null;
  const data = await unwrapData(
    api.get<ApiResponse<FormTemplate | null>>(
      `/kpi-form-config/form-templates/by-axis/${axisId}`,
    ),
  );
  return data ?? null;
}

export function createFormTemplate(input: FormTemplateInput) {
  return unwrapData(
    api.post<ApiResponse<FormTemplate>>(
      "/kpi-form-config/form-templates",
      input,
    ),
  );
}

export function updateFormTemplate(
  id: string,
  input: Partial<FormTemplateInput>,
) {
  return unwrapData(
    api.patch<ApiResponse<FormTemplate>>(
      `/kpi-form-config/form-templates/${id}`,
      input,
    ),
  );
}

export async function deleteFormTemplate(id: string) {
  await api.delete(`/kpi-form-config/form-templates/${id}`);
}
