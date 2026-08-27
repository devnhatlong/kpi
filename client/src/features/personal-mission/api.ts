import {
  api,
  buildListQuery,
  unwrapData,
  unwrapPaginated,
} from "@/lib/api-client";
import type { ApiResponse } from "@/features/auth/types";
import type {
  FormHeaderGroup,
  FormTemplateColumn,
  FormTemplateFooter,
} from "@/features/mission-form-config/types";
import type {
  PersonalMissionItem,
  PersonalMissionLogType,
  PersonalMissionProgressChange,
  PersonalMissionProgressLog,
  PersonalMissionStatus,
  PersonalTaskDraft,
  TaskAttachment,
} from "@/features/personal-mission/types";

type CatalogRef = {
  _id: string;
  code?: string;
  name?: string;
  description?: string;
  /** Ghi chú của nội dung công việc - cột "Ghi chú" do admin khai sẵn. */
  note?: string;
  fullName?: string;
  username?: string;
};

export type PersonalMissionApiRecord = {
  _id: string;
  /** Trạng thái duyệt tại cấp đang giữ nhiệm vụ. */
  reviewStatus: PersonalMissionStatus;
  holderLevel?: number;
  reportDate?: string;
  ownerId?: string | CatalogRef;
  axisId: string | CatalogRef;
  workContentId: string | CatalogRef;
  /** Cột danh mục theo khoá cột - server chép sẵn tên để khỏi join. */
  catalogValues?: Record<string, { id: string; name: string }>;
  fieldValues?: Record<string, string | number>;
  attachments?: Record<string, TaskAttachment[]>;
  /** Cán bộ phối hợp - server chép sẵn tên để khỏi join. */
  collaborators?: Array<{ userId?: string | CatalogRef; name?: string }>;
  /** Điểm chỉ huy chấm lại - số chốt khi tính điểm trục. */
  reviewValues?: Record<string, string | number>;
  reviewCatalogValues?: Record<string, { id: string; name: string }>;
  reviewNote?: string;
  reviewScoredByName?: string;
  reviewScoredAt?: string | null;
  lastSentAt?: string | null;
  /** Lần cán bộ cập nhật tiến độ gần nhất - dùng để tính "im lặng N ngày". */
  lastProgressAt?: string | null;
  progressLogs?: Array<{
    type?: PersonalMissionLogType;
    toName?: string;
    level?: number;
    byId?: string | CatalogRef;
    byName?: string;
    percent?: number | null;
    note?: string;
    onDate?: string;
    at: string;
    changes?: PersonalMissionProgressChange[];
  }>;
  currentRecipientId?: string | CatalogRef | null;
  lastSenderId?: string | CatalogRef | null;
  returnReason?: string;
  /** Người ra quyết định duyệt / trả lại gần nhất. */
  lastDecidedById?: string | CatalogRef | null;
  lastDecidedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PersonalMissionRecipient = {
  id: string;
  fullName: string;
  username: string;
  rank?: string;
  position?: string;
  departmentId: string | null;
  departmentCode: string;
  departmentName: string;
  roleCodes?: string[];
};

export type PersonalMissionRecipientsResponse = {
  higherRoles: string[];
  people: PersonalMissionRecipient[];
};

export type SubmitPersonalMissionPayload = {
  recipientId: string;
  note: string;
  /** Bỏ trống = gửi hết nhiệm vụ gửi được trong ngày. */
  itemIds?: string[];
  /** Gửi kèm bảng khối A của THÁNG chứa ngày báo cáo này. */
  includeCriteria?: boolean;
};

export type PersonalMissionDailyReport = {
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

export type PersonalMissionDashboardSummary = {
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
export type PersonalMissionSubmission = {
  _id: string;
  reportDate: string;
  level: number;
  senderId: string;
  senderName: string;
  recipientId: string;
  recipientName: string;
  itemIds: string[];
  /** Bảng khối A đi kèm lượt này - mảng riêng vì khác collection. */
  criteriaSheetIds: string[];
  note: string;
  status: "PENDING" | "REVIEWED";
  createdAt: string;
};

export type PersonalMissionWriteInput = {
  axisId: string;
  workContentId: string;
  /** Cột danh mục: { "<khoá cột>": "<id>" }. */
  catalogValues?: Record<string, string>;
  /** Giá trị các cột chữ/số của mẫu bảng gán cho trục. */
  fieldValues?: Record<string, string>;
  /** Tệp của các cột kiểu "Tệp đính kèm", key = khoá cột. */
  attachments?: Record<string, TaskAttachment[]>;
  /** Id cán bộ phối hợp; KHÔNG gồm người khai - server tự loại. */
  collaboratorIds?: string[];
};

export type PersonalMissionReportsQuery = {
  page?: number;
  limit?: number;
  fromDate?: string;
  toDate?: string;
  status?: PersonalMissionStatus | "";
  q?: string;
};

function refId(value: string | CatalogRef | null | undefined): string {
  if (!value) return "";
  return typeof value === "string" ? value : value._id;
}

/*
  Tham chiếu có thể là NULL chứ không chỉ là chuỗi id: danh mục bị xoá thì
  Mongoose populate trả về null. `typeof null === "object"` nên nhánh kiểm tra
  chuỗi không đỡ được - thiếu chốt này là cả trang trắng vì đọc `.name` của null.
*/
function refName(
  value: string | CatalogRef | null | undefined,
  fallback = "",
): string {
  if (!value || typeof value === "string") return fallback;
  return value.name ?? value.fullName ?? value.username ?? fallback;
}

function refCode(
  value: string | CatalogRef | null | undefined,
  fallback = "",
): string {
  if (!value || typeof value === "string") return fallback;
  return value.code ?? fallback;
}

export function mapPersonalMissionFromApi(
  row: PersonalMissionApiRecord,
): PersonalMissionItem {
  const task: PersonalTaskDraft = {
    key: row._id,
    itemId: row._id,
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
    collaboratorIds: (row.collaborators ?? []).flatMap((item) => {
      const userId = refId(item.userId);
      return userId ? [userId] : [];
    }),
  };

  return {
    id: row._id,
    status: row.reviewStatus ?? "DRAFT",
    holderLevel: row.holderLevel ?? 0,
    axisId: refId(row.axisId),
    // Danh mục bị xoá sau khi nhiệm vụ đã lưu: nói thẳng ra thay vì để ô trống,
    // người duyệt còn biết vì sao dòng này thiếu tên.
    axisName: refName(row.axisId, "Trục đã bị xoá"),
    workContentId: refId(row.workContentId),
    workContentName: refName(row.workContentId, "Nội dung đã bị xoá"),
    workContentCode: refCode(row.workContentId),
    task,
    // Bỏ mục thiếu id hoặc thiếu tên: tài khoản bị xoá sau khi nhiệm vụ đã lưu
    // để lại bản ghi rỗng, bày ra thành một huy hiệu trắng không ai hiểu là gì.
    collaborators: (row.collaborators ?? []).flatMap((item) => {
      const userId = refId(item.userId);
      const name = item.name?.trim();
      return userId && name ? [{ userId, name }] : [];
    }),
    reportDate: row.reportDate || undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    sentAt: row.lastSentAt || undefined,
    lastProgressAt: row.lastProgressAt || undefined,
    // Mới nhất lên đầu - timeline đọc từ trên xuống.
    progressLogs: [...(row.progressLogs ?? [])]
      .map((log) => ({
        // Bản ghi cũ chưa có `type` - coi như mốc cập nhật tiến độ.
        type: log.type ?? "PROGRESS",
        toName: log.toName ?? "",
        level: log.level ?? 0,
        at: log.at,
        onDate: log.onDate ?? "",
        percent: log.percent ?? null,
        note: log.note ?? "",
        byName: log.byName ?? "",
        changes: log.changes ?? [],
      }))
      .sort((a, b) => b.at.localeCompare(a.at)),
    ownerId: row.ownerId ? refId(row.ownerId) : undefined,
    ownerName: row.ownerId ? refName(row.ownerId) : undefined,
    recipientId: row.currentRecipientId
      ? refId(row.currentRecipientId)
      : undefined,
    recipientName: row.currentRecipientId
      ? refName(row.currentRecipientId) || undefined
      : undefined,
    rejectReason: row.returnReason?.trim() || undefined,
    reviewValues: Object.fromEntries(
      Object.entries(row.reviewValues ?? {}).map(([key, value]) => [
        key,
        value == null ? "" : String(value),
      ]),
    ),
    reviewCatalogValues: Object.fromEntries(
      Object.entries(row.reviewCatalogValues ?? {}).map(([key, value]) => [
        key,
        value?.id ?? "",
      ]),
    ),
    reviewNote: row.reviewNote?.trim() || undefined,
    reviewScoredByName: row.reviewScoredByName || undefined,
    reviewScoredAt: row.reviewScoredAt || undefined,
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
): PersonalMissionWriteInput {
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
    collaboratorIds: task.collaboratorIds ?? [],
  };
}

export type PersonalMissionMineQuery = {
  page?: number;
  limit?: number;
  status?: PersonalMissionStatus | "ALL" | "";
  /** Đúng một ngày; server bỏ qua fromDate/toDate khi có trường này. */
  reportDate?: string;
  fromDate?: string;
  toDate?: string;
  q?: string;
  axisId?: string;
};

export const personalMissionKeys = {
  all: ["personal-mission"] as const,
  summary: ["personal-mission", "summary"] as const,
  reports: (params: PersonalMissionReportsQuery) =>
    [
      "personal-mission",
      "reports",
      params.page ?? 1,
      params.limit ?? 10,
      params.fromDate ?? "",
      params.toDate ?? "",
      params.status ?? "",
      params.q ?? "",
    ] as const,
  byDate: (params: PersonalMissionMineQuery) =>
    [
      "personal-mission",
      "day",
      params.reportDate ?? "",
      params.fromDate ?? "",
      params.toDate ?? "",
      params.page ?? 1,
      params.limit ?? 10,
      params.status ?? "",
      params.q ?? "",
      params.axisId ?? "",
    ] as const,
  inboxReports: (params: PersonalMissionReportsQuery) =>
    [
      "personal-mission",
      "inbox-reports",
      params.page ?? 1,
      params.limit ?? 10,
      params.fromDate ?? "",
      params.toDate ?? "",
      params.status ?? "",
      params.q ?? "",
    ] as const,
  inboxItems: (params: PersonalMissionMineQuery & { ownerId?: string }) =>
    [
      "personal-mission",
      "inbox",
      params.ownerId ?? "",
      params.reportDate ?? "",
      params.page ?? 1,
      params.limit ?? 100,
      params.status ?? "",
      params.q ?? "",
    ] as const,
  staffDay: (ownerId: string, reportDate: string) =>
    ["personal-mission", "staff-day", ownerId, reportDate] as const,
};

export async function fetchPersonalMissionReports(
  params: PersonalMissionReportsQuery,
) {
  return unwrapPaginated(
    api.get<ApiResponse<PersonalMissionDailyReport[]>>(
      "/personal-mission/reports",
      {
        params: buildListQuery({
          page: params.page,
          limit: params.limit,
          q: params.q,
          fromDate: params.fromDate || undefined,
          toDate: params.toDate || undefined,
          status: params.status || undefined,
        }),
      },
    ),
  );
}

export async function fetchPersonalMissionSummary() {
  return unwrapData(
    api.get<ApiResponse<PersonalMissionDashboardSummary>>(
      "/personal-mission/summary",
    ),
  );
}

export async function fetchMyPersonalMission(
  params: PersonalMissionMineQuery = {},
) {
  return unwrapPaginated(
    api.get<ApiResponse<PersonalMissionApiRecord[]>>("/personal-mission/mine", {
      params: buildListQuery({
        page: params.page,
        limit: params.limit,
        q: params.q,
        reportDate: params.reportDate || undefined,
        fromDate: params.fromDate || undefined,
        toDate: params.toDate || undefined,
        status:
          params.status && params.status !== "ALL" ? params.status : undefined,
        axisId: params.axisId || undefined,
      }),
    }),
  ).then((result) => ({
    ...result,
    data: result.data.map(mapPersonalMissionFromApi),
  }));
}

export async function createPersonalMissionBatch(
  items: PersonalMissionWriteInput[],
  reportDate?: string,
) {
  const data = await unwrapData(
    api.post<ApiResponse<PersonalMissionApiRecord[]>>(
      "/personal-mission/batch",
      {
        items,
        reportDate: reportDate || undefined,
      },
    ),
  );
  return data.map(mapPersonalMissionFromApi);
}

/**
 * Cập nhật tiến độ hằng ngày.
 * Đường riêng, không đi qua PATCH sửa nội dung: chỉ ghi ba ô theo dõi và không
 * kéo trạng thái duyệt về nháp, nên chạy được cả khi việc đã gửi lên trên.
 */
export type PersonalMissionProgressInput = {
  /** Số 0-100, hoặc id mức chất lượng khi cột tiến độ là ô chọn. */
  progress?: string;
  quality?: string;
  note?: string;
  product?: string;
  /** Tệp minh chứng - gửi cả danh sách sau mỗi lần thêm / bớt. */
  evidence?: TaskAttachment[];
  /**
   * Trục chấm theo mục (Đạt / Không đạt): khoá cột -> giá trị thô.
   * Trục kiểu này không có cột phần trăm, khai điểm ở đây chính là cập nhật.
   */
  results?: Record<string, string>;
  /** Bỏ trống = giữ nguyên; mảng rỗng = gỡ hết người phối hợp. */
  collaboratorIds?: string[];
};

/**
 * Một dòng khối A trong báo cáo cá nhân - tiêu chí (bất biến) ghép với giá trị
 * các ô. Ô nào có gì là do mẫu `forCriteria` quyết định, nên giá trị nằm trong
 * hai túi theo khoá cột chứ không có trường cứng.
 */
export type PersonalCriterionRow = {
  criterionId: string;
  criterionName: string;
  /** Ghi chú admin khai sẵn ở danh mục tiêu chí - cán bộ chỉ đọc. */
  criterionNote: string;
  maxScore: number;
  fieldValues: Record<string, string | number | boolean>;
  catalogValues: Record<string, { id: string; name: string }>;
  /** Điểm chỉ huy chấm lại - ô nào có ở đây thì đây mới là số chốt. */
  reviewValues: Record<string, string | number | boolean>;
  reviewCatalogValues: Record<string, { id: string; name: string }>;
};

/** Các ô cán bộ gửi lên khi lưu / cập nhật bảng khối A. */
export type PersonalCriterionRowInput = {
  criterionId: string;
  fieldValues?: Record<string, string | number | boolean>;
  catalogValues?: Record<string, { id: string; name: string }>;
};

/**
 * Bảng khối A của một THÁNG kèm vị trí của nó trong chuỗi gửi duyệt.
 *
 * Khối A chốt kết quả theo tháng, cán bộ cập nhật ngày nào cũng được (hoặc
 * không) - mỗi lần sửa là một mốc nhật ký chứ không phải một bảng mới.
 *
 * Vòng đời giống nhiệm vụ: nháp thì sửa thoải mái, gửi rồi thì sửa qua đường
 * cập nhật và mọi thay đổi vào nhật ký, chốt thì khoá.
 */
export type PersonalCriteriaSheet = {
  /** Kỳ tháng YYYY-MM. */
  period: string;
  /** null = chưa lưu bản nào cho tháng này. */
  sheetId: string | null;
  reviewStatus: PersonalMissionStatus;
  holderLevel: number;
  returnReason: string;
  lastSentAt: string | null;
  lastProgressAt: string | null;
  reviewNote: string;
  reviewScoredByName: string;
  reviewScoredAt: string | null;
  progressLogs: PersonalMissionProgressLog[];
  /** Còn ở chỗ cán bộ: lưu nháp và gửi được. */
  canEdit: boolean;
  /** Đã gửi nhưng chưa chốt: sửa được qua đường cập nhật, có lưu vết. */
  canUpdate: boolean;
  /**
   * Bộ cột để dựng bảng - bản ĐÃ KHOÁ lúc gửi nếu bảng đã gửi, mẫu đang bật
   * nếu chưa. Dùng cái này chứ đừng tự đi lấy mẫu live: admin đổi cột giữa
   * chừng là bảng đã gửi bị vẽ sai bộ cột.
   */
  template: {
    code: string;
    name: string;
    version: number;
    columns: FormTemplateColumn[];
    headerGroups: FormHeaderGroup[];
    footer?: FormTemplateFooter;
  } | null;
  rows: PersonalCriterionRow[];
};

/**
 * Bảng khối A như server trả về ở bảng tổng của chỉ huy và ở lịch sử - bản ghi
 * thô, chưa ghép danh mục. Khác `PersonalCriteriaSheet` (bản của màn nhập) ở
 * chỗ có thêm người khai và người gửi.
 */
export type PersonalCriteriaSheetRecord = {
  _id: string;
  /** Kỳ tháng YYYY-MM. */
  periodMonth: string;
  reviewStatus: PersonalMissionStatus;
  holderLevel: number;
  returnReason: string;
  ownerId: string | CatalogRef;
  ownerDepartmentId?: string | CatalogRef | null;
  lastSenderId?: string | CatalogRef | null;
  lastSenderDepartmentId?: string | CatalogRef | null;
  lastSentAt: string | null;
  lastProgressAt: string | null;
  reviewNote: string;
  reviewScoredByName: string;
  reviewScoredAt: string | null;
  progressLogs: PersonalMissionProgressLog[];
  rows: Array<{
    criterionId: string;
    criterionName: string;
    maxScore: number;
    fieldValues: Record<string, string | number | boolean>;
    catalogValues: Record<string, { id: string; name: string }>;
    reviewValues: Record<string, string | number | boolean>;
    reviewCatalogValues: Record<string, { id: string; name: string }>;
  }>;
  createdAt: string;
  updatedAt: string;
};

export const personalCriteriaKeys = {
  /** Khoá theo KỲ THÁNG - khối A một tháng đúng một bản. */
  sheet: (period: string) => ["personal-criteria", period] as const,
  history: (id: string) => ["personal-criteria-history", id] as const,
  list: (fromDate: string, toDate: string) =>
    ["personal-criteria-list", fromDate, toDate] as const,
};

/** Kỳ tháng YYYY-MM của một ngày YYYY-MM-DD (hoặc của chính chuỗi tháng). */
export function criteriaPeriodOf(value: string): string {
  return value.length >= 7 ? value.slice(0, 7) : value;
}

/** Nhãn "tháng 8/2026" từ chuỗi YYYY-MM. */
export function formatCriteriaPeriod(period: string): string {
  const [year, month] = period.split("-");
  return month ? `tháng ${Number(month)}/${year}` : period;
}

/**
 * Một dòng khối A trong danh sách - bản tóm tắt của cả THÁNG, không kèm các ô.
 * Điểm tổng do server cộng: client không biết cột nào là cột điểm của mẫu.
 */
export type PersonalCriteriaSheetSummary = {
  sheetId: string | null;
  /** Kỳ tháng YYYY-MM. */
  period: string;
  reviewStatus: PersonalMissionStatus;
  holderLevel: number;
  returnReason: string;
  lastSentAt: string | null;
  lastProgressAt: string | null;
  reviewNote: string;
  reviewScoredByName: string;
  reviewScoredAt: string | null;
  canEdit: boolean;
  canUpdate: boolean;
  /** Tổng điểm đạt; ô nào chỉ huy đã chấm thì tính số của chỉ huy. */
  totalScore: number;
  maxScore: number;
  /** Số tiêu chí đã đụng vào - tích ô "Không đảm bảo" cũng tính là đã chấm. */
  scoredCount: number;
  rowCount: number;
  recipientName: string;
  updatedAt: string | null;
};

/**
 * Bảng khối A của tôi, lọc theo khoảng NGÀY nhưng trả về theo THÁNG.
 * Xem một tuần vắt qua hai tháng thì ra hai bảng.
 */
export function fetchPersonalCriteriaList(params: {
  fromDate?: string;
  toDate?: string;
}) {
  const query: Record<string, string> = {};
  if (params.fromDate) query.fromDate = params.fromDate;
  if (params.toDate) query.toDate = params.toDate;
  return unwrapData(
    api.get<ApiResponse<PersonalCriteriaSheetSummary[]>>(
      "/personal-mission/criteria/list",
      { params: query },
    ),
  );
}

/**
 * Bảng khối A của một tháng; bỏ trống thì server lấy tháng này.
 * Nhận cả YYYY-MM lẫn YYYY-MM-DD - server tự cắt lấy tháng.
 */
export function fetchPersonalCriteriaSheet(period?: string) {
  return unwrapData(
    api.get<ApiResponse<PersonalCriteriaSheet>>("/personal-mission/criteria", {
      params: period ? { period } : undefined,
    }),
  );
}

/** Lưu nháp - chỉ chạy khi bảng còn ở chỗ cán bộ, ghi đè im lặng. */
export function savePersonalCriteriaSheet(input: {
  period?: string;
  rows: PersonalCriterionRowInput[];
}) {
  return unwrapData(
    api.put<ApiResponse<{ period: string; rowCount: number }>>(
      "/personal-mission/criteria",
      input,
    ),
  );
}

/**
 * Cập nhật bảng ĐÃ GỬI - chạy được cả khi bảng đang ở tay cấp trên, đổi lại mọi
 * ô đổi giá trị đều vào nhật ký. Cùng cặp với `updatePersonalMissionProgress`.
 */
export function updatePersonalCriteriaSheet(input: {
  period?: string;
  rows: PersonalCriterionRowInput[];
  note?: string;
}) {
  return unwrapData(
    api.patch<ApiResponse<PersonalCriteriaSheet>>(
      "/personal-mission/criteria/progress",
      input,
    ),
  );
}

/** Chỉ huy chấm lại cả bảng khối A rồi chốt - chấm và chốt đi liền một nhịp. */
export function scorePersonalCriteriaSheet(
  id: string,
  input: {
    rows: Array<{
      criterionId: string;
      /** Theo khoá cột, cùng kiểu với ô cán bộ tự chấm (ô tích là boolean). */
      values: Record<string, string | number | boolean>;
    }>;
    note?: string;
  },
) {
  return unwrapData(
    api.post<ApiResponse<{ id: string }>>(
      `/personal-mission/criteria/${id}/score`,
      input,
    ),
  );
}

/** Lịch sử một bảng khối A: đã đi qua những lượt gửi nào. */
export function fetchPersonalCriteriaHistory(id: string) {
  return unwrapData(
    api.get<
      ApiResponse<{
        sheet: PersonalCriteriaSheetRecord;
        submissions: PersonalMissionSubmission[];
      }>
    >(`/personal-mission/criteria/${id}/history`),
  );
}

export async function updatePersonalMissionProgress(
  id: string,
  input: PersonalMissionProgressInput,
) {
  const data = await unwrapData(
    api.patch<ApiResponse<PersonalMissionApiRecord>>(
      `/personal-mission/${id}/progress`,
      input,
    ),
  );
  return mapPersonalMissionFromApi(data);
}

/**
 * Chỉ huy chấm điểm rồi chốt hoàn thành.
 * `values` theo khoá cột; server chỉ nhận đúng các cột trong công thức của mẫu.
 */
export type PersonalMissionScoreInput = {
  values: Record<string, string>;
  note?: string;
};

export async function scorePersonalMission(
  id: string,
  input: PersonalMissionScoreInput,
) {
  const data = await unwrapData(
    api.post<ApiResponse<PersonalMissionApiRecord>>(
      `/personal-mission/${id}/score`,
      input,
    ),
  );
  return mapPersonalMissionFromApi(data);
}

export async function updatePersonalMission(
  id: string,
  input: PersonalMissionWriteInput,
) {
  const data = await unwrapData(
    api.patch<ApiResponse<PersonalMissionApiRecord>>(
      `/personal-mission/${id}`,
      input,
    ),
  );
  return mapPersonalMissionFromApi(data);
}

export async function fetchPersonalMissionRecipients(q?: string) {
  return unwrapData(
    api.get<ApiResponse<PersonalMissionRecipientsResponse>>(
      "/personal-mission/recipients",
      {
        params: q?.trim() ? { q: q.trim() } : undefined,
      },
    ),
  );
}

export type Colleague = {
  id: string;
  fullName: string;
  rank: string;
  departmentName: string;
};

/**
 * Cán bộ chọn được làm người phối hợp - đơn vị mình và cấp dưới.
 *
 * Không dùng `/users`: đường đó đòi quyền USER_VIEW mà cán bộ không có, trong
 * khi chính họ là người cần chọn đồng đội lúc khai nhiệm vụ.
 */
export async function fetchColleagues(q?: string) {
  return unwrapData(
    api.get<ApiResponse<{ people: Colleague[] }>>(
      "/personal-mission/colleagues",
      { params: q?.trim() ? { q: q.trim() } : undefined },
    ),
  );
}

export const colleagueKeys = {
  all: ["personal-mission", "colleagues"] as const,
};

/** Cán bộ gửi báo cáo ngày lên cấp trên. */
export async function submitPersonalMissionReport(
  reportDate: string,
  payload: SubmitPersonalMissionPayload,
) {
  return unwrapData(
    api.post<
      ApiResponse<{
        submissionId: string;
        reportDate: string;
        level: number;
        sentCount: number;
        /** 1 = lượt này có kèm bảng khối A. */
        criteriaSentCount: number;
        recipientId: string;
        recipientName: string;
      }>
    >(`/personal-mission/reports/${reportDate}/submit`, payload),
  );
}

export async function deletePersonalMission(id: string) {
  await api.delete(`/personal-mission/${id}`);
}

// ----------------------------------------------------------- cấp trên duyệt

export type PersonalMissionBoardRow = PersonalMissionApiRecord & {
  ownerDepartmentId?: string | CatalogRef | null;
  lastSenderDepartmentId?: string | CatalogRef | null;
};

export type PersonalMissionBoardGroup = {
  workContentId: string;
  workContentCode: string;
  workContentName: string;
  workContentDescription: string;
  rows: PersonalMissionBoardRow[];
};

export type PersonalMissionBoardAxis = {
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
  groups: PersonalMissionBoardGroup[];
};

/**
 * Khối A trong bảng tổng: các bảng đang nằm ở chỗ tôi, gom theo phiên bản mẫu.
 * null = lượt xem này không có bảng A nào (hoặc đang lọc theo trục / từ khoá,
 * lúc đó khối A không thuộc phạm vi hỏi).
 */
export type PersonalMissionBoardCriteriaBlock = {
  formTemplateId: string | null;
  formTemplateVersion: number | null;
  template: {
    code: string;
    name: string;
    version: number;
    columns: FormTemplateColumn[];
    headerGroups: FormHeaderGroup[];
    footer?: FormTemplateFooter;
  } | null;
  /**
   * Ghi chú admin khai sẵn ở danh mục, tra theo id tiêu chí.
   * Không nằm trong bản chụp của bảng vì nó là chữ mô tả chứ không phải số -
   * nhưng chỉ huy cần đọc mới biết căn cứ trừ điểm.
   */
  criterionNotes: Record<string, string>;
  sheets: PersonalCriteriaSheetRecord[];
};

export type PersonalMissionBoard = {
  axes: PersonalMissionBoardAxis[];
  criteria: PersonalMissionBoardCriteriaBlock[] | null;
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

export type PersonalMissionBoardQuery = {
  reportDate?: string;
  fromDate?: string;
  toDate?: string;
  status?: PersonalMissionStatus | "";
  axisId?: string;
  workContentId?: string;
  departmentId?: string;
  senderId?: string;
  ownerId?: string;
  q?: string;
  includeDecided?: boolean;
};

export async function fetchPersonalMissionBoard(
  params: PersonalMissionBoardQuery,
) {
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
    api.get<ApiResponse<PersonalMissionBoard>>("/personal-mission/board", {
      params: query,
    }),
  );
}

/**
 * Duyệt hoặc trả lại các dòng đã tích trong bảng tổng.
 * Nhiệm vụ và bảng khối A tích chung một lượt được - server nhận hai mảng id
 * riêng vì chúng nằm ở hai collection.
 */
export async function reviewPersonalMission(input: {
  itemIds?: string[];
  criteriaSheetIds?: string[];
  decision: "RETURN" | "COMPLETE";
  reason?: string;
}) {
  return unwrapData(
    api.post<ApiResponse<{ count: number; criteriaCount: number }>>(
      "/personal-mission/review",
      input,
    ),
  );
}

export type StaffDayReport = {
  reportDate: string;
  owner: {
    id: string;
    name: string;
    /** Cấp bậc hàm; tài khoản chưa gán thì rỗng. */
    rank: string;
    departmentName: string;
  };
  items: PersonalMissionApiRecord[];
  /** Bảng khối A của THÁNG chứa ngày này - màn nhập cũng bày nó chung bảng. */
  criteria: PersonalCriteriaSheetSummary[];
};

/**
 * Trọn báo cáo một ngày của một cán bộ, cho chỉ huy đọc lại.
 *
 * Khác `fetchPersonalMissionBoard` ở chỗ hỏi theo CHỦ nhiệm vụ chứ không theo
 * người đang giữ: việc đã duyệt và chuyển tiếp lên trên không còn nằm ở bàn chỉ
 * huy nữa, nhưng nó vẫn là một dòng của báo cáo ngày hôm đó.
 */
export function fetchStaffDayReport(input: {
  ownerId: string;
  reportDate: string;
}) {
  return unwrapData(
    api.get<ApiResponse<StaffDayReport>>("/personal-mission/staff-day", {
      params: { ownerId: input.ownerId, reportDate: input.reportDate },
    }),
  );
}

/** Cấp trên gửi tiếp các dòng đã duyệt lên cấp cao hơn. */
export async function forwardPersonalMission(input: {
  itemIds?: string[];
  criteriaSheetIds?: string[];
  recipientId: string;
  note: string;
}) {
  return unwrapData(
    api.post<
      ApiResponse<{
        submissionId: string;
        level: number;
        sentCount: number;
        criteriaSentCount: number;
        recipientName: string;
      }>
    >("/personal-mission/forward", input),
  );
}

/** Cấp trên sửa nội dung nhiệm vụ - bắt buộc nêu lý do, luôn lưu vết. */
export async function reviewerEditPersonalMission(
  id: string,
  input: PersonalMissionWriteInput & { reason: string },
) {
  const data = await unwrapData(
    api.patch<ApiResponse<PersonalMissionApiRecord>>(
      `/personal-mission/${id}/reviewer-edit`,
      input,
    ),
  );
  return mapPersonalMissionFromApi(data);
}

export async function fetchPersonalMissionSubmissions(
  params: PersonalMissionReportsQuery,
) {
  return unwrapPaginated(
    api.get<ApiResponse<PersonalMissionSubmission[]>>(
      "/personal-mission/submissions",
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

export async function fetchPersonalMissionHistory(id: string) {
  return unwrapData(
    api.get<
      ApiResponse<{
        item: PersonalMissionApiRecord;
        submissions: PersonalMissionSubmission[];
      }>
    >(`/personal-mission/${id}/history`),
  );
}
