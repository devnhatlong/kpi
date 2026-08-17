import { api, buildListQuery, unwrapData, unwrapPaginated } from "@/lib/api-client";
import type { ApiResponse } from "@/features/auth/types";
import type {
  FormHeaderGroup,
  FormTemplateColumn,
  FormTemplateFooter,
} from "@/features/kpi-form-config/types";
import type {
  PersonalKpiItem,
  PersonalKpiStatus,
  PersonalTaskDraft,
  TaskAttachment,
} from "@/features/personal-kpi/types";

type CatalogRef = {
  _id: string;
  code?: string;
  name?: string;
  description?: string;
  fullName?: string;
  username?: string;
};

export type PersonalKpiApiRecord = {
  _id: string;
  /** Trạng thái duyệt tại cấp đang giữ nhiệm vụ. */
  reviewStatus: PersonalKpiStatus;
  holderLevel?: number;
  reportDate?: string;
  ownerId?: string | CatalogRef;
  axisId: string | CatalogRef;
  workContentId: string | CatalogRef;
  /** Cột danh mục theo khoá cột - server chép sẵn tên để khỏi join. */
  catalogValues?: Record<string, { id: string; name: string }>;
  fieldValues?: Record<string, string | number>;
  attachments?: Record<string, TaskAttachment[]>;
  lastSentAt?: string | null;
  /** Lần cán bộ cập nhật tiến độ gần nhất - dùng để tính "im lặng N ngày". */
  lastProgressAt?: string | null;
  currentRecipientId?: string | CatalogRef | null;
  lastSenderId?: string | CatalogRef | null;
  returnReason?: string;
  /** Người ra quyết định duyệt / trả lại gần nhất. */
  lastDecidedById?: string | CatalogRef | null;
  lastDecidedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PersonalKpiRecipient = {
  id: string;
  fullName: string;
  username: string;
  position?: string;
  departmentId: string | null;
  departmentCode: string;
  departmentName: string;
  roleCodes?: string[];
};

export type PersonalKpiRecipientsResponse = {
  higherRoles: string[];
  people: PersonalKpiRecipient[];
};

export type SubmitPersonalKpiPayload = {
  recipientId: string;
  note: string;
  /** Bỏ trống = gửi hết nhiệm vụ gửi được trong ngày. */
  itemIds?: string[];
};

export type PersonalKpiDailyReport = {
  reportDate: string;
  taskCount: number;
  draftCount: number;
  pendingCount: number;
  approvedCount: number;
  returnedCount: number;
  createdAt: string;
  updatedAt: string;
  lastSentAt?: string | null;
};

export type PersonalKpiDashboardSummary = {
  today: string;
  streakDays: number;
  weekReportedDays: number;
  weekWindowDays: number;
  todayTaskCount: number;
  todayDraftCount: number;
  pendingSentCount: number;
  rejectedCount: number;
  approvedCount?: number;
};

/** Một lượt gửi đến tôi. */
export type PersonalKpiSubmission = {
  _id: string;
  reportDate: string;
  level: number;
  senderId: string;
  senderName: string;
  recipientId: string;
  recipientName: string;
  itemIds: string[];
  note: string;
  status: "PENDING" | "REVIEWED";
  createdAt: string;
};

export type PersonalKpiWriteInput = {
  axisId: string;
  workContentId: string;
  /** Cột danh mục: { "<khoá cột>": "<id>" }. */
  catalogValues?: Record<string, string>;
  /** Giá trị các cột chữ/số của mẫu bảng gán cho trục. */
  fieldValues?: Record<string, string>;
  /** Tệp của các cột kiểu "Tệp đính kèm", key = khoá cột. */
  attachments?: Record<string, TaskAttachment[]>;
};

export type PersonalKpiReportsQuery = {
  page?: number;
  limit?: number;
  fromDate?: string;
  toDate?: string;
  status?: PersonalKpiStatus | "";
  q?: string;
};

function refId(value: string | CatalogRef | null | undefined): string {
  if (!value) return "";
  return typeof value === "string" ? value : value._id;
}

function refName(value: string | CatalogRef, fallback = ""): string {
  if (typeof value === "string") return fallback;
  return value.name ?? value.fullName ?? value.username ?? fallback;
}

function refCode(value: string | CatalogRef, fallback = ""): string {
  if (typeof value === "string") return fallback;
  return value.code ?? fallback;
}

export function mapPersonalKpiFromApi(
  row: PersonalKpiApiRecord,
): PersonalKpiItem {
  const task: PersonalTaskDraft = {
    key: row._id,
    // Dropdown cần id; tên do server chép sẵn chỉ dùng cho bảng duyệt.
    catalogValues: Object.fromEntries(
      Object.entries(row.catalogValues ?? {}).map(([key, value]) => [
        key,
        value?.id ?? "",
      ]),
    ),
    fieldValues: Object.fromEntries(
      Object.entries(row.fieldValues ?? {}).map(([key, value]) => [
        key,
        value == null ? "" : String(value),
      ]),
    ),
    attachments: row.attachments ?? {},
  };

  return {
    id: row._id,
    status: row.reviewStatus ?? "DRAFT",
    holderLevel: row.holderLevel ?? 0,
    axisId: refId(row.axisId),
    axisName: refName(row.axisId),
    workContentId: refId(row.workContentId),
    workContentName: refName(row.workContentId),
    workContentCode: refCode(row.workContentId),
    task,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    sentAt: row.lastSentAt || undefined,
    lastProgressAt: row.lastProgressAt || undefined,
    ownerId: row.ownerId ? refId(row.ownerId) : undefined,
    ownerName: row.ownerId ? refName(row.ownerId) : undefined,
    recipientId: row.currentRecipientId
      ? refId(row.currentRecipientId)
      : undefined,
    recipientName: row.currentRecipientId
      ? refName(row.currentRecipientId) || undefined
      : undefined,
    rejectReason: row.returnReason?.trim() || undefined,
    decidedByName: row.lastDecidedById
      ? refName(row.lastDecidedById) || undefined
      : undefined,
    decidedAt: row.lastDecidedAt || undefined,
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
    catalogValues: Object.fromEntries(
      Object.entries(task.catalogValues ?? {}).filter(([, id]) => id),
    ),
    fieldValues: Object.fromEntries(
      Object.entries(task.fieldValues ?? {}).filter(([, value]) =>
        value.trim(),
      ),
    ),
    // Bỏ cột không còn tệp nào, khỏi lưu mảng rỗng vô nghĩa.
    attachments: Object.fromEntries(
      Object.entries(task.attachments ?? {}).filter(
        ([, files]) => files.length > 0,
      ),
    ),
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
  summary: ["personal-kpi", "summary"] as const,
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
  inboxReports: (params: PersonalKpiReportsQuery) =>
    [
      "personal-kpi",
      "inbox-reports",
      params.page ?? 1,
      params.limit ?? 10,
      params.fromDate ?? "",
      params.toDate ?? "",
      params.status ?? "",
      params.q ?? "",
    ] as const,
  inboxItems: (params: PersonalKpiMineQuery & { ownerId?: string }) =>
    [
      "personal-kpi",
      "inbox",
      params.ownerId ?? "",
      params.reportDate ?? "",
      params.page ?? 1,
      params.limit ?? 100,
      params.status ?? "",
      params.q ?? "",
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

export async function fetchPersonalKpiSummary() {
  return unwrapData(
    api.get<ApiResponse<PersonalKpiDashboardSummary>>("/personal-kpi/summary"),
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

/**
 * Cập nhật tiến độ hằng ngày.
 * Đường riêng, không đi qua PATCH sửa nội dung: chỉ ghi ba ô theo dõi và không
 * kéo trạng thái duyệt về nháp, nên chạy được cả khi việc đã gửi lên trên.
 */
export type PersonalKpiProgressInput = {
  /** Số 0-100, hoặc id mức chất lượng khi cột tiến độ là ô chọn. */
  progress?: string;
  quality?: string;
  note?: string;
};

export async function updatePersonalKpiProgress(
  id: string,
  input: PersonalKpiProgressInput,
) {
  const data = await unwrapData(
    api.patch<ApiResponse<PersonalKpiApiRecord>>(
      `/personal-kpi/${id}/progress`,
      input,
    ),
  );
  return mapPersonalKpiFromApi(data);
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

/** Cán bộ gửi báo cáo ngày lên cấp trên. */
export async function submitPersonalKpiReport(
  reportDate: string,
  payload: SubmitPersonalKpiPayload,
) {
  return unwrapData(
    api.post<
      ApiResponse<{
        submissionId: string;
        reportDate: string;
        level: number;
        sentCount: number;
        recipientId: string;
        recipientName: string;
      }>
    >(`/personal-kpi/reports/${reportDate}/submit`, payload),
  );
}

export async function deletePersonalKpi(id: string) {
  await api.delete(`/personal-kpi/${id}`);
}

// ----------------------------------------------------------- cấp trên duyệt

export type PersonalKpiBoardRow = PersonalKpiApiRecord & {
  ownerDepartmentId?: string | CatalogRef | null;
  lastSenderDepartmentId?: string | CatalogRef | null;
};

export type PersonalKpiBoardGroup = {
  workContentId: string;
  workContentCode: string;
  workContentName: string;
  workContentDescription: string;
  rows: PersonalKpiBoardRow[];
};

export type PersonalKpiBoardAxis = {
  axisId: string;
  axisCode: string;
  axisName: string;
  axisDescription: string;
  /** Điểm tối đa của trục - nhân với tỉ lệ hoàn thành ra dòng "Điểm quy đổi". */
  axisMaxScore: number;
  /** Bộ cột đã resolve theo phiên bản mẫu lúc gửi; null = trục chưa gán mẫu. */
  template: {
    code: string;
    name: string;
    version: number;
    columns: FormTemplateColumn[];
    headerGroups: FormHeaderGroup[];
    footer?: FormTemplateFooter;
  } | null;
  groups: PersonalKpiBoardGroup[];
};

export type PersonalKpiBoard = {
  axes: PersonalKpiBoardAxis[];
  counts: {
    pending: number;
    approved: number;
    returned: number;
    completed: number;
  };
  /** false = không còn ai ở trên, đây là cấp cuối của chuỗi. */
  canForwardUp: boolean;
  rowCount: number;
  truncated: boolean;
};

export type PersonalKpiBoardQuery = {
  reportDate?: string;
  fromDate?: string;
  toDate?: string;
  status?: PersonalKpiStatus | "";
  axisId?: string;
  workContentId?: string;
  departmentId?: string;
  senderId?: string;
  ownerId?: string;
  q?: string;
  includeDecided?: boolean;
};

export async function fetchPersonalKpiBoard(params: PersonalKpiBoardQuery) {
  // KHÔNG dùng buildListQuery: nó luôn thêm page/limit, mà /board không phân
  // trang nên DTO không khai hai trường đó -> ValidationPipe trả 400.
  const query: Record<string, string | boolean> = {};
  const put = (key: string, value?: string) => {
    if (value?.trim()) query[key] = value.trim();
  };
  put("reportDate", params.reportDate);
  put("fromDate", params.fromDate);
  put("toDate", params.toDate);
  put("status", params.status || undefined);
  put("axisId", params.axisId);
  put("workContentId", params.workContentId);
  put("departmentId", params.departmentId);
  put("senderId", params.senderId);
  put("ownerId", params.ownerId);
  put("q", params.q);
  if (params.includeDecided) query.includeDecided = true;

  return unwrapData(
    api.get<ApiResponse<PersonalKpiBoard>>("/personal-kpi/board", {
      params: query,
    }),
  );
}

/** Duyệt hoặc trả lại các nhiệm vụ đã tích trong bảng tổng. */
export async function reviewPersonalKpi(input: {
  itemIds: string[];
  decision: "RETURN" | "COMPLETE";
  reason?: string;
}) {
  return unwrapData(
    api.post<ApiResponse<{ count: number }>>("/personal-kpi/review", input),
  );
}

/** Cấp trên gửi tiếp các nhiệm vụ đã duyệt lên cấp cao hơn. */
export async function forwardPersonalKpi(input: {
  itemIds: string[];
  recipientId: string;
  note: string;
}) {
  return unwrapData(
    api.post<
      ApiResponse<{
        submissionId: string;
        level: number;
        sentCount: number;
        recipientName: string;
      }>
    >("/personal-kpi/forward", input),
  );
}

/** Cấp trên sửa nội dung nhiệm vụ - bắt buộc nêu lý do, luôn lưu vết. */
export async function reviewerEditPersonalKpi(
  id: string,
  input: PersonalKpiWriteInput & { reason: string },
) {
  const data = await unwrapData(
    api.patch<ApiResponse<PersonalKpiApiRecord>>(
      `/personal-kpi/${id}/reviewer-edit`,
      input,
    ),
  );
  return mapPersonalKpiFromApi(data);
}

export async function fetchPersonalKpiSubmissions(
  params: PersonalKpiReportsQuery,
) {
  return unwrapPaginated(
    api.get<ApiResponse<PersonalKpiSubmission[]>>(
      "/personal-kpi/submissions",
      {
        params: buildListQuery({
          page: params.page,
          limit: params.limit,
          fromDate: params.fromDate || undefined,
          toDate: params.toDate || undefined,
        }),
      },
    ),
  );
}

export async function fetchPersonalKpiHistory(id: string) {
  return unwrapData(
    api.get<
      ApiResponse<{
        item: PersonalKpiApiRecord;
        submissions: PersonalKpiSubmission[];
      }>
    >(`/personal-kpi/${id}/history`),
  );
}
