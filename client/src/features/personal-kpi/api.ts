import { api, buildListQuery, unwrapData, unwrapPaginated } from "@/lib/api-client";
import type { ApiResponse } from "@/features/auth/types";
import type {
  PersonalKpiItem,
  PersonalKpiStatus,
  PersonalTaskDraft,
  TaskEvidenceFile,
} from "@/features/personal-kpi/types";

type CatalogRef = {
  _id: string;
  code?: string;
  name?: string;
  description?: string;
};

export type PersonalKpiApiRecord = {
  _id: string;
  status: PersonalKpiStatus;
  reportDate?: string;
  axisId: string | CatalogRef;
  workContentId: string | CatalogRef;
  title: string;
  deadline?: string;
  product?: string;
  standardScore?: number;
  executingUnit?: string;
  progressPercent?: number | null;
  progressSelfScore?: number | null;
  qualityPercent?: number | null;
  qualitySelfScore?: number | null;
  note?: string;
  evidenceFiles?: TaskEvidenceFile[];
  sentAt?: string | null;
  recipientId?: string | CatalogRef | null;
  recipientName?: string;
  sendNote?: string;
  rejectReason?: string;
  createdAt: string;
  updatedAt: string;
};

export type PersonalKpiRecipient = {
  id: string;
  fullName: string;
  username: string;
  departmentId: string | null;
  departmentCode: string;
  departmentName: string;
};

export type PersonalKpiRecipientDepartment = {
  id: string;
  code: string;
  name: string;
};

export type PersonalKpiRecipientsResponse = {
  department: PersonalKpiRecipientDepartment | null;
  people: PersonalKpiRecipient[];
};

export type SendPersonalKpiPayload = {
  recipientId?: string;
  recipientDepartmentId?: string;
  note: string;
};

export type PersonalKpiDailyReport = {
  reportDate: string;
  taskCount: number;
  draftCount: number;
  sentCount: number;
  rejectedCount: number;
  completedCount: number;
  createdAt: string;
  updatedAt: string;
  lastSentAt?: string | null;
};

export type PersonalKpiWriteInput = {
  axisId: string;
  workContentId: string;
  title: string;
  deadline?: string;
  product?: string;
  standardScore: number;
  executingUnit?: string;
  progressPercent?: number;
  qualityPercent?: number;
  progressSelfScore?: number;
  qualitySelfScore?: number;
  note?: string;
  evidenceFiles?: Array<{
    key: string;
    name: string;
    size: number;
    mimeType: string;
  }>;
};

export type PersonalKpiReportsQuery = {
  page?: number;
  limit?: number;
  fromDate?: string;
  toDate?: string;
  status?: PersonalKpiStatus | "";
  q?: string;
};

function refId(value: string | CatalogRef): string {
  return typeof value === "string" ? value : value._id;
}

function refName(value: string | CatalogRef, fallback = ""): string {
  if (typeof value === "string") return fallback;
  return value.name ?? fallback;
}

function refCode(value: string | CatalogRef, fallback = ""): string {
  if (typeof value === "string") return fallback;
  return value.code ?? fallback;
}

function numToStr(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "";
  return String(value);
}

function optionalNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : undefined;
}

export function mapPersonalKpiFromApi(
  row: PersonalKpiApiRecord,
): PersonalKpiItem {
  const task: PersonalTaskDraft = {
    key: row._id,
    title: row.title ?? "",
    deadline: row.deadline ?? "",
    product: row.product ?? "",
    standardScore: numToStr(row.standardScore),
    executingUnit: row.executingUnit ?? "",
    progressPercent: numToStr(row.progressPercent),
    progressSelfScore: numToStr(row.progressSelfScore),
    qualityPercent: numToStr(row.qualityPercent),
    qualitySelfScore: numToStr(row.qualitySelfScore),
    note: row.note ?? "",
    evidenceFiles: (row.evidenceFiles ?? []).map((file) => ({
      key: file.key,
      name: file.name,
      size: file.size,
      mimeType: file.mimeType,
    })),
  };

  return {
    id: row._id,
    status: row.status,
    axisId: refId(row.axisId),
    axisName: refName(row.axisId),
    workContentId: refId(row.workContentId),
    workContentName: refName(row.workContentId),
    workContentCode: refCode(row.workContentId),
    task,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    sentAt: row.sentAt || undefined,
    recipientId: row.recipientId ? refId(row.recipientId) : undefined,
    recipientName: row.recipientName?.trim() || undefined,
    sendNote: row.sendNote?.trim() || undefined,
    rejectReason: row.rejectReason?.trim() || undefined,
  };
}

export function taskToWriteInput(
  axisId: string,
  workContentId: string,
  task: PersonalTaskDraft,
): PersonalKpiWriteInput {
  return {
    axisId,
    workContentId,
    title: task.title.trim(),
    deadline: task.deadline || undefined,
    product: task.product || undefined,
    standardScore: Number(task.standardScore),
    executingUnit: task.executingUnit || undefined,
    progressPercent: optionalNumber(task.progressPercent),
    progressSelfScore: optionalNumber(task.progressSelfScore),
    qualityPercent: optionalNumber(task.qualityPercent),
    qualitySelfScore: optionalNumber(task.qualitySelfScore),
    note: task.note || undefined,
    evidenceFiles: (task.evidenceFiles ?? []).map((file) => ({
      key: file.key,
      name: file.name,
      size: file.size,
      mimeType: file.mimeType,
    })),
  };
}

export type PersonalKpiMineQuery = {
  page?: number;
  limit?: number;
  status?: PersonalKpiStatus | "ALL" | "";
  reportDate?: string;
  q?: string;
  axisId?: string;
};

export const personalKpiKeys = {
  all: ["personal-kpi"] as const,
  reports: (params: PersonalKpiReportsQuery) =>
    [
      "personal-kpi",
      "reports",
      params.page ?? 1,
      params.limit ?? 10,
      params.fromDate ?? "",
      params.toDate ?? "",
      params.status ?? "",
      params.q ?? "",
    ] as const,
  byDate: (params: PersonalKpiMineQuery) =>
    [
      "personal-kpi",
      "day",
      params.reportDate ?? "",
      params.page ?? 1,
      params.limit ?? 10,
      params.status ?? "",
      params.q ?? "",
      params.axisId ?? "",
    ] as const,
};

export async function fetchPersonalKpiReports(params: PersonalKpiReportsQuery) {
  return unwrapPaginated(
    api.get<ApiResponse<PersonalKpiDailyReport[]>>("/personal-kpi/reports", {
      params: buildListQuery({
        page: params.page,
        limit: params.limit,
        q: params.q,
        fromDate: params.fromDate || undefined,
        toDate: params.toDate || undefined,
        status: params.status || undefined,
      }),
    }),
  );
}

export async function fetchMyPersonalKpi(params: PersonalKpiMineQuery = {}) {
  return unwrapPaginated(
    api.get<ApiResponse<PersonalKpiApiRecord[]>>("/personal-kpi/mine", {
      params: buildListQuery({
        page: params.page,
        limit: params.limit,
        q: params.q,
        reportDate: params.reportDate || undefined,
        status:
          params.status && params.status !== "ALL"
            ? params.status
            : undefined,
        axisId: params.axisId || undefined,
      }),
    }),
  ).then((result) => ({
    ...result,
    data: result.data.map(mapPersonalKpiFromApi),
  }));
}

export async function createPersonalKpiBatch(
  items: PersonalKpiWriteInput[],
  reportDate?: string,
) {
  const data = await unwrapData(
    api.post<ApiResponse<PersonalKpiApiRecord[]>>("/personal-kpi/batch", {
      items,
      reportDate: reportDate || undefined,
    }),
  );
  return data.map(mapPersonalKpiFromApi);
}

export async function updatePersonalKpi(
  id: string,
  input: PersonalKpiWriteInput,
) {
  const data = await unwrapData(
    api.patch<ApiResponse<PersonalKpiApiRecord>>(
      `/personal-kpi/${id}`,
      input,
    ),
  );
  return mapPersonalKpiFromApi(data);
}

export async function fetchPersonalKpiRecipients(q?: string) {
  return unwrapData(
    api.get<ApiResponse<PersonalKpiRecipientsResponse>>(
      "/personal-kpi/recipients",
      {
        params: q?.trim() ? { q: q.trim() } : undefined,
      },
    ),
  );
}

export async function sendPersonalKpi(
  id: string,
  payload: SendPersonalKpiPayload,
) {
  const data = await unwrapData(
    api.post<ApiResponse<PersonalKpiApiRecord>>(
      `/personal-kpi/${id}/send`,
      payload,
    ),
  );
  return mapPersonalKpiFromApi(data);
}

export async function sendPersonalKpiReport(
  reportDate: string,
  payload: SendPersonalKpiPayload,
) {
  return unwrapData(
    api.post<
      ApiResponse<{
        reportDate: string;
        sentCount: number;
        recipientId: string;
        recipientName: string;
      }>
    >(`/personal-kpi/reports/${reportDate}/send`, payload),
  );
}

export async function deletePersonalKpi(id: string) {
  await api.delete(`/personal-kpi/${id}`);
}
