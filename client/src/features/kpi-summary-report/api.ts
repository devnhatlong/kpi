import {
  api,
  buildListQuery,
  unwrapData,
  unwrapPaginated,
} from "@/lib/api-client";
import type { ApiResponse } from "@/features/auth/types";
import type {
  SummaryCandidates,
  SummaryCandidatesQuery,
  SummaryReport,
  SummaryReportDetail,
  SummaryReportListQuery,
  SummaryReportStats,
} from "@/features/kpi-summary-report/types";

const BASE = "/kpi-summary-reports";

export const summaryReportKeys = {
  all: ["kpi-summary-reports"] as const,
  stats: ["kpi-summary-reports", "stats"] as const,
  candidates: (params: SummaryCandidatesQuery) =>
    [
      "kpi-summary-reports",
      "candidates",
      params.fromDate ?? "",
      params.toDate ?? "",
      params.axisId ?? "",
      params.workContentId ?? "",
      params.departmentId ?? "",
      params.ownerId ?? "",
      params.q ?? "",
      params.excludeUsed ? "1" : "",
      params.reportId ?? "",
    ] as const,
  list: (params: SummaryReportListQuery) =>
    [
      "kpi-summary-reports",
      "list",
      params.scope ?? "mine",
      params.page ?? 1,
      params.limit ?? 10,
      params.status ?? "",
      params.q ?? "",
    ] as const,
  detail: (id: string) => ["kpi-summary-reports", "detail", id] as const,
};

/**
 * Kho nhiệm vụ đã hoàn thành để nhặt vào báo cáo.
 * KHÔNG dùng buildListQuery: nó luôn kèm page/limit, mà endpoint này không phân
 * trang nên DTO không khai hai trường đó -> ValidationPipe trả 400.
 */
export async function fetchSummaryCandidates(params: SummaryCandidatesQuery) {
  const query: Record<string, string | boolean> = {};
  const put = (key: string, value?: string) => {
    if (value?.trim()) query[key] = value.trim();
  };
  put("fromDate", params.fromDate);
  put("toDate", params.toDate);
  put("axisId", params.axisId);
  put("workContentId", params.workContentId);
  put("departmentId", params.departmentId);
  put("ownerId", params.ownerId);
  put("q", params.q);
  put("reportId", params.reportId);
  if (params.excludeUsed) query.excludeUsed = true;

  return unwrapData(
    api.get<ApiResponse<SummaryCandidates>>(`${BASE}/candidates`, {
      params: query,
    }),
  );
}

export async function fetchSummaryReports(params: SummaryReportListQuery) {
  return unwrapPaginated(
    api.get<ApiResponse<SummaryReport[]>>(BASE, {
      params: buildListQuery({
        page: params.page,
        limit: params.limit,
        q: params.q,
        status: params.status || undefined,
        scope: params.scope,
      }),
    }),
  );
}

export async function fetchSummaryReportStats() {
  return unwrapData(api.get<ApiResponse<SummaryReportStats>>(`${BASE}/stats`));
}

export async function fetchSummaryReport(id: string) {
  return unwrapData(api.get<ApiResponse<SummaryReportDetail>>(`${BASE}/${id}`));
}

export type CreateSummaryReportInput = {
  title: string;
  fromDate?: string;
  toDate?: string;
  scopeDepartmentId?: string;
  note?: string;
  itemIds?: string[];
};

export async function createSummaryReport(input: CreateSummaryReportInput) {
  return unwrapData(api.post<ApiResponse<SummaryReport>>(BASE, input));
}

export type UpdateSummaryReportInput = {
  title?: string;
  fromDate?: string;
  toDate?: string;
  scopeDepartmentId?: string;
  note?: string;
  itemIds?: string[];
};

export async function updateSummaryReport(
  id: string,
  input: UpdateSummaryReportInput,
) {
  return unwrapData(
    api.patch<ApiResponse<SummaryReport>>(`${BASE}/${id}`, input),
  );
}

export async function addSummaryReportItems(id: string, itemIds: string[]) {
  return unwrapData(
    api.post<ApiResponse<{ added: number; itemCount: number }>>(
      `${BASE}/${id}/items`,
      { itemIds },
    ),
  );
}

export async function removeSummaryReportItems(id: string, itemIds: string[]) {
  return unwrapData(
    api.post<ApiResponse<{ removed: number; itemCount: number }>>(
      `${BASE}/${id}/items/remove`,
      { itemIds },
    ),
  );
}

export type SummaryManualItemInput = {
  title: string;
  note?: string;
  axisId?: string;
  ownerName?: string;
  departmentName?: string;
  score?: number;
};

export async function addSummaryManualItem(
  id: string,
  input: SummaryManualItemInput,
) {
  return unwrapData(
    api.post<ApiResponse<SummaryReport>>(`${BASE}/${id}/manual-items`, input),
  );
}

/** Ô chấm gửi lên - tên tiêu chí và điểm tối đa do server chụp lại, không gửi. */
export type SummaryCriterionScoreInput = {
  subjectType: "DEPARTMENT" | "USER";
  subjectId?: string | null;
  criterionId: string;
  fieldValues?: Record<string, string | number | boolean>;
  catalogValues?: Record<string, { id: string; name: string }>;
};

/** Lưu cả bảng khối A một lượt - server ghi đè nguyên bộ. */
export async function saveSummaryCriteriaScores(
  id: string,
  scores: SummaryCriterionScoreInput[],
) {
  return unwrapData(
    api.patch<ApiResponse<SummaryReport>>(`${BASE}/${id}/criteria`, { scores }),
  );
}

/** Sửa một dòng tự nhập - chỉ đụng dữ liệu trong báo cáo. */
export async function updateSummaryManualItem(
  id: string,
  manualId: string,
  input: SummaryManualItemInput,
) {
  return unwrapData(
    api.patch<ApiResponse<SummaryReport>>(
      BASE + "/" + id + "/manual-items/" + manualId,
      input,
    ),
  );
}

export async function removeSummaryManualItem(id: string, manualId: string) {
  return unwrapData(
    api.delete<ApiResponse<SummaryReport>>(
      `${BASE}/${id}/manual-items/${manualId}`,
    ),
  );
}

/** Trình báo cáo lên cấp trên - người nhận theo đúng luật của báo cáo ngày. */
export async function sendSummaryReport(
  id: string,
  input: { recipientId: string; note?: string },
) {
  return unwrapData(
    api.post<ApiResponse<SummaryReport>>(`${BASE}/${id}/send`, input),
  );
}

/** Cấp trên duyệt bản trình - điểm dừng của chuỗi. */
export async function approveSummaryReport(id: string, note?: string) {
  return unwrapData(
    api.post<ApiResponse<SummaryReport>>(`${BASE}/${id}/approve`, { note }),
  );
}

/** Cấp trên trả lại kèm lý do - báo cáo về tay người lập để sửa. */
export async function returnSummaryReport(id: string, reason: string) {
  return unwrapData(
    api.post<ApiResponse<SummaryReport>>(`${BASE}/${id}/return`, { reason }),
  );
}

export async function deleteSummaryReport(id: string) {
  await api.delete(`${BASE}/${id}`);
}
