import { api, unwrapData, unwrapPaginated } from "@/lib/api-client";
import type { ApiResponse } from "@/features/auth/types";
import type {
  AssignmentListQuery,
  AssignmentTargets,
  CreateAssignmentBatchInput,
  DelegateAssignmentInput,
  MissionAssignment,
  ReportAssignmentInput,
} from "./types";

export const assignmentKeys = {
  received: (query: AssignmentListQuery) =>
    [
      "mission-assignments-received",
      query.page,
      query.limit,
      query.status ?? "",
      query.q ?? "",
      query.axisId ?? "",
    ] as const,
  issued: (query: AssignmentListQuery) =>
    [
      "mission-assignments-issued",
      query.page,
      query.limit,
      query.status ?? "",
      query.q ?? "",
      query.axisId ?? "",
      query.batchId ?? "",
    ] as const,
  targets: () => ["mission-assignment-targets"] as const,
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
    api.get<ApiResponse<MissionAssignment[]>>("/mission-assignments/received", {
      params: listParams(query),
    }),
  );
}

export async function fetchIssuedAssignments(query: AssignmentListQuery) {
  return unwrapPaginated(
    api.get<ApiResponse<MissionAssignment[]>>("/mission-assignments/issued", {
      params: listParams(query),
    }),
  );
}

/** Nơi nhận hợp lệ - server áp phạm vi theo vai trò của người giao. */
export function fetchAssignmentTargets() {
  return unwrapData(
    api.get<ApiResponse<AssignmentTargets>>("/mission-assignments/targets"),
  );
}

export function createAssignments(input: CreateAssignmentBatchInput) {
  return unwrapData(
    api.post<
      ApiResponse<{ batchId: string; taskCount: number; count: number }>
    >("/mission-assignments", input),
  );
}

export function delegateAssignment(id: string, input: DelegateAssignmentInput) {
  return unwrapData(
    api.patch<ApiResponse<MissionAssignment>>(
      `/mission-assignments/${id}/delegate`,
      input,
    ),
  );
}

export function startAssignment(id: string) {
  return unwrapData(
    api.patch<ApiResponse<MissionAssignment>>(
      `/mission-assignments/${id}/start`,
      {},
    ),
  );
}

export function reportAssignment(id: string, input: ReportAssignmentInput) {
  return unwrapData(
    api.patch<ApiResponse<MissionAssignment>>(
      `/mission-assignments/${id}/report`,
      input,
    ),
  );
}

export function submitAssignment(id: string) {
  return unwrapData(
    api.patch<ApiResponse<MissionAssignment>>(
      `/mission-assignments/${id}/submit`,
      {},
    ),
  );
}

export function approveAssignment(id: string, approvedScore?: number) {
  return unwrapData(
    api.patch<ApiResponse<MissionAssignment>>(
      `/mission-assignments/${id}/approve`,
      {
        ...(approvedScore !== undefined ? { approvedScore } : {}),
      },
    ),
  );
}

export function rejectAssignment(id: string, reason: string) {
  return unwrapData(
    api.patch<ApiResponse<MissionAssignment>>(
      `/mission-assignments/${id}/reject`,
      {
        reason,
      },
    ),
  );
}
