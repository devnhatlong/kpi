import { api, buildListQuery, unwrapData, unwrapPaginated } from "@/lib/api-client";
import type { ApiResponse } from "@/features/auth/types";
import type {
  Axis,
  AxisInput,
  ContentGroup,
  ContentGroupInput,
  ListQueryParams,
  PaginatedResult,
  ScoreGroup,
  ScoreGroupInput,
  WorkContent,
  WorkContentInput,
} from "./types";

export const axisKeys = {
  all: ["axes"] as const,
  list: (params: ListQueryParams) =>
    ["axes", params.page, params.limit, params.q ?? "", params.all ?? false] as const,
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

export const contentGroupKeys = {
  all: ["content-groups"] as const,
  list: (params: ListQueryParams) =>
    [
      "content-groups",
      params.page,
      params.limit,
      params.q ?? "",
      params.all ?? false,
    ] as const,
};

export async function fetchContentGroupsPage(
  params: ListQueryParams,
): Promise<PaginatedResult<ContentGroup>> {
  return unwrapPaginated(
    api.get<ApiResponse<ContentGroup[]>>("/kpi-form-config/content-groups/all", {
      params: buildListQuery(params),
    }),
  );
}

export async function fetchContentGroupsAll() {
  const result = await fetchContentGroupsPage({ all: true });
  return result.data.filter((item) => item.isActive);
}

export function createContentGroup(input: ContentGroupInput) {
  return unwrapData(
    api.post<ApiResponse<ContentGroup>>("/kpi-form-config/content-groups", input),
  );
}

export function updateContentGroup(id: string, input: Partial<ContentGroupInput>) {
  return unwrapData(
    api.patch<ApiResponse<ContentGroup>>(
      `/kpi-form-config/content-groups/${id}`,
      input,
    ),
  );
}

export async function deleteContentGroup(id: string) {
  await api.delete(`/kpi-form-config/content-groups/${id}`);
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

export function updateWorkContent(id: string, input: Partial<WorkContentInput>) {
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
