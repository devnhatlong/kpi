import { api, unwrapData, unwrapPaginated } from "@/lib/api-client";
import type { ApiResponse } from "@/features/auth/types";
import type {
  AssignmentListQuery,
  AssignmentTargets,
  CreateAssignmentBatchInput,
  DelegateAssignmentInput,
  KpiAssignment,
  ReportAssignmentInput,
} from "./types";

export const assignmentKeys = {
  received: (query: AssignmentListQuery) =>
    [
      "kpi-assignments-received",
      query.page,
      query.limit,
      query.status ?? "",
      query.q ?? "",
      query.axisId ?? "",
    ] as const,
  issued: (query: AssignmentListQuery) =>
    [
      "kpi-assignments-issued",
      query.page,
      query.limit,
      query.status ?? "",
      query.q ?? "",
      query.axisId ?? "",
      query.batchId ?? "",
    ] as const,
  targets: () => ["kpi-assignment-targets"] as const,
};

function listParams(query: AssignmentListQuery) {
  const params: Record<string, string | number> = {
    page: query.page ?? 1,
    limit: query.limit ?? 10,
  };
  if (query.status) params.status = query.status;
  if (query.q?.trim()) params.q = query.q.trim();
  if (query.axisId) params.axisId = query.axisId;
  if (query.batchId) params.batchId = query.batchId;
  return params;
}

export async function fetchReceivedAssignments(query: AssignmentListQuery) {
  return unwrapPaginated(
    api.get<ApiResponse<KpiAssignment[]>>("/kpi-assignments/received", {
      params: listParams(query),
    }),
  );
}

export async function fetchIssuedAssignments(query: AssignmentListQuery) {
  return unwrapPaginated(
    api.get<ApiResponse<KpiAssignment[]>>("/kpi-assignments/issued", {
      params: listParams(query),
    }),
  );
}

/** Nơi nhận hợp lệ - server áp phạm vi theo vai trò của người giao. */
export function fetchAssignmentTargets() {
  return unwrapData(
    api.get<ApiResponse<AssignmentTargets>>("/kpi-assignments/targets"),
  );
}

export function createAssignments(input: CreateAssignmentBatchInput) {
  return unwrapData(
    api.post<
      ApiResponse<{ batchId: string; taskCount: number; count: number }>
    >("/kpi-assignments", input),
  );
}

export function delegateAssignment(
  id: string,
  input: DelegateAssignmentInput,
) {
  return unwrapData(
    api.patch<ApiResponse<KpiAssignment>>(
      `/kpi-assignments/${id}/delegate`,
      input,
    ),
  );
}

export function startAssignment(id: string) {
  return unwrapData(
    api.patch<ApiResponse<KpiAssignment>>(`/kpi-assignments/${id}/start`, {}),
  );
}

export function reportAssignment(id: string, input: ReportAssignmentInput) {
  return unwrapData(
    api.patch<ApiResponse<KpiAssignment>>(
      `/kpi-assignments/${id}/report`,
      input,
    ),
  );
}

export function submitAssignment(id: string) {
  return unwrapData(
    api.patch<ApiResponse<KpiAssignment>>(`/kpi-assignments/${id}/submit`, {}),
  );
}

export function approveAssignment(id: string, approvedScore?: number) {
  return unwrapData(
    api.patch<ApiResponse<KpiAssignment>>(`/kpi-assignments/${id}/approve`, {
      ...(approvedScore !== undefined ? { approvedScore } : {}),
    }),
  );
}

export function rejectAssignment(id: string, reason: string) {
  return unwrapData(
    api.patch<ApiResponse<KpiAssignment>>(`/kpi-assignments/${id}/reject`, {
      reason,
    }),
  );
}
