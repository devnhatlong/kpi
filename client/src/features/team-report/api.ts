import type { ApiResponse } from "@/features/auth/types";
import { api, unwrapData, unwrapPaginated } from "@/lib/api-client";
import type {
  TeamReportAxisScore,
  TeamReportCatalogs,
  TeamReportClassifyBoard,
  TeamReportCriteriaData,
  TeamReportDay,
  TeamReportDayStatus,
  TeamReportPeriod,
  TeamReportRecipient,
  TeamReportSheet,
  TeamReportSummary,
  TeamReportSummaryCandidates,
  TeamReportTask,
  TeamReportTemplate,
  TeamReportUnitDay,
} from "@/features/team-report/types";

/**
 * Khoá SWR của bản nghiệp vụ mới.
 *
 * Tiền tố riêng `team-report` để không đụng khoá của bản cũ - hai bản có thể
 * cùng mở trong một phiên, trùng khoá là màn này nạp lại làm hỏng cache màn kia.
 */
export const teamReportKeys = {
  sheet: (reportDate: string, q: string) =>
    ["team-report", "sheet", reportDate, q] as const,
  classify: (reportDate: string) =>
    ["team-report", "classify", reportDate] as const,
  incoming: (params: TeamReportInboxQuery) =>
    [
      "team-report",
      "incoming",
      params.fromDate ?? "",
      params.toDate ?? "",
      params.status ?? "",
      params.departmentId ?? "",
      params.page ?? 1,
      params.limit ?? 20,
    ] as const,
  unitIncoming: (params: TeamReportInboxQuery) =>
    [
      "team-report",
      "incoming-units",
      params.fromDate ?? "",
      params.toDate ?? "",
      params.status ?? "",
      params.page ?? 1,
      params.limit ?? 20,
    ] as const,
  day: (id: string) => ["team-report", "day", id] as const,
  /* Cấp lập bản nằm trong khoá: cùng một tài khoản phòng vừa xem bản mình lập
     vừa xem bản các đội trình lên, hai thứ khác nhau mà trùng khoá thì màn này
     nạp lại làm hỏng cache màn kia. */
  summaries: (status: string, page: number, level = "TEAM") =>
    ["team-report", "summaries", level, status, page] as const,
  summaryInbox: (status: string, page: number) =>
    ["team-report", "summary-inbox", status, page] as const,
  summary: (id: string, level = "TEAM") =>
    ["team-report", "summary", level, id] as const,
  summaryCandidates: (
    fromDate: string,
    toDate: string,
    q: string,
    scope: "PERIOD" | "ALL" = "PERIOD",
    level = "TEAM",
    departmentIds = "",
  ) =>
    [
      "team-report",
      "summary-candidates",
      level,
      fromDate,
      toDate,
      q,
      scope,
      departmentIds,
    ] as const,
  recipients: (level = "TEAM") => ["team-report", "recipients", level] as const,
  criteria: (periodMonth: string) =>
    ["team-report", "criteria", periodMonth] as const,
};

// ------------------------------------------------------ giai đoạn 1: nhập thô

export function fetchTeamReportSheet(params: {
  reportDate?: string;
  q?: string;
}) {
  return unwrapData(
    api.get<ApiResponse<TeamReportSheet>>("/team-report/sheet", {
      params: {
        ...(params.reportDate ? { reportDate: params.reportDate } : {}),
        ...(params.q?.trim() ? { q: params.q.trim() } : {}),
      },
    }),
  );
}

export type TeamReportTaskInput = {
  name: string;
  deadline?: string;
  /** Sản phẩm phải ra - ô chữ tự do, đội tự đặt lúc khai. */
  product?: string;
};

export function createTeamReportTask(input: TeamReportTaskInput) {
  return unwrapData(
    api.post<ApiResponse<TeamReportTask>>("/team-report/tasks", input),
  );
}

/**
 * Sửa một dòng. `version` là bắt buộc và phải là số bản vừa đọc về.
 *
 * Cả đội gõ chung một bảng qua một tài khoản, nên đây là thứ duy nhất ngăn hai
 * người đè mất phần của nhau. Server lệch version thì trả 409.
 */
export function updateTeamReportTask(
  id: string,
  input: TeamReportTaskInput & { version: number },
) {
  return unwrapData(
    api.patch<ApiResponse<TeamReportTask>>(`/team-report/tasks/${id}`, input),
  );
}

export function deleteTeamReportTask(id: string) {
  return unwrapData(
    api.delete<ApiResponse<{ id: string }>>(`/team-report/tasks/${id}`),
  );
}

/**
 * Đóng một nhiệm vụ. Có hiệu lực NGAY, không chờ tới lượt gửi.
 *
 * `done: true` là làm xong - không hỏi lý do. Không có `done` thì bắt buộc
 * `reason`: dừng một việc đang chạy là chuyện cấp trên cần đọc được vì sao.
 *
 * Việc đóng hôm nay vẫn nằm trong bảng hôm nay, chỉ vắng mặt từ ngày mai - nên
 * đánh dấu sớm không làm nó rơi khỏi báo cáo đang soạn.
 */
export function closeTeamReportTask(
  id: string,
  input: { version: number; done?: boolean; reason?: string },
) {
  return unwrapData(
    api.patch<ApiResponse<TeamReportTask>>(
      `/team-report/tasks/${id}/close`,
      input,
    ),
  );
}

/** Đường lùi cho lần bấm nhầm - đóng có hiệu lực ngay nên phải mở lại được. */
export function reopenTeamReportTask(id: string, input: { version: number }) {
  return unwrapData(
    api.patch<ApiResponse<TeamReportTask>>(
      `/team-report/tasks/${id}/reopen`,
      input,
    ),
  );
}

// ------------------------------------------------------ giai đoạn 2: phân loại

export function fetchTeamReportClassify(params: { reportDate?: string }) {
  return unwrapData(
    api.get<ApiResponse<TeamReportClassifyBoard>>("/team-report/classify", {
      params: params.reportDate ? { reportDate: params.reportDate } : {},
    }),
  );
}

/**
 * Phân loại một dòng.
 *
 * Không có trường cứng cho tiến độ hay chất lượng: chọn trục xong là bộ cột do
 * quản trị cấu hình quyết định, mỗi trục một khác. Giá trị đi theo KHOÁ CỘT.
 */
export type TeamReportClassifyInput = {
  version: number;
  /** Đổi trục là đổi luôn bộ cột - server xoá giá trị cột của trục cũ. */
  axisId?: string | null;
  workContentId?: string | null;
  fieldValues?: Record<string, string>;
  /** Cột danh mục: gửi id, server tra lại tên rồi chép sẵn. */
  catalogValues?: Record<string, string>;
};

export function classifyTeamReportTask(
  id: string,
  input: TeamReportClassifyInput,
) {
  return unwrapData(
    api.patch<ApiResponse<TeamReportTask>>(
      `/team-report/tasks/${id}/classify`,
      input,
    ),
  );
}

/**
 * Gửi cả bảng ngày.
 *
 * Không mang theo danh sách việc cần đóng: đóng là hành động riêng, làm ngay
 * trên từng nhiệm vụ. Một ngày vài chục nhiệm vụ thì không ai dò nổi một danh
 * sách tích ở bước cuối.
 */
export function submitTeamReportDay(input: {
  reportDate: string;
  note?: string;
}) {
  return unwrapData(
    api.post<ApiResponse<{ dayId: string; rowCount: number }>>(
      "/team-report/days/submit",
      input,
    ),
  );
}

// ------------------------------------------------------------ cấp trên duyệt

export type TeamReportInboxQuery = {
  fromDate?: string;
  toDate?: string;
  status?: TeamReportDayStatus | "";
  departmentId?: string;
  page?: number;
  limit?: number;
};

function inboxParams(query: TeamReportInboxQuery) {
  const params: Record<string, string | number> = {
    page: query.page ?? 1,
    limit: query.limit ?? 20,
  };
  if (query.fromDate) params.fromDate = query.fromDate;
  if (query.toDate) params.toDate = query.toDate;
  if (query.status) params.status = query.status;
  if (query.departmentId) params.departmentId = query.departmentId;
  return params;
}

export function fetchTeamReportInbox(query: TeamReportInboxQuery) {
  return unwrapPaginated(
    api.get<ApiResponse<TeamReportDay[]>>("/team-report/incoming", {
      params: inboxParams(query),
    }),
  );
}

export function fetchTeamReportUnitInbox(query: TeamReportInboxQuery) {
  return unwrapPaginated(
    api.get<ApiResponse<TeamReportUnitDay[]>>("/team-report/incoming/units", {
      params: inboxParams(query),
    }),
  );
}

/**
 * Chi tiết một báo cáo ngày, KÈM bộ cột của các mẫu có mặt trong đó.
 *
 * Danh sách không mang theo bộ cột, mà bảng chấm phải dựng đúng cột do quản trị
 * cấu hình - nên màn chi tiết phải gọi riêng.
 */
export type TeamReportDayDetail = {
  day: TeamReportDay;
  /** Tra bằng "<id mẫu>:<phiên bản>" - mỗi dòng đóng dấu phiên bản riêng. */
  templates: Record<string, TeamReportTemplate>;
  catalogs: TeamReportCatalogs;
  axisScores: TeamReportAxisScore[];
};

export function fetchTeamReportDay(id: string) {
  return unwrapData(
    api.get<ApiResponse<TeamReportDayDetail>>(`/team-report/days/${id}`),
  );
}

export type TeamReportReviewRow = {
  taskId: string;
  /** Giá trị chỉnh theo khoá cột của mẫu gắn với nhiệm vụ. */
  fieldValues?: Record<string, string>;
  catalogValues?: Record<string, string>;
};

/**
 * Cấp trên chỉnh số. Ghi vào cả bản chụp lẫn nhiệm vụ sống, nên hôm sau đội bắt
 * đầu từ con số đã chỉnh chứ không phải số cũ.
 */
export function reviewTeamReportDay(
  id: string,
  input: { reason?: string; rows: TeamReportReviewRow[] },
) {
  return unwrapData(
    api.patch<ApiResponse<TeamReportDay>>(
      `/team-report/days/${id}/review`,
      input,
    ),
  );
}

export function decideTeamReportDay(
  id: string,
  input: { decision: "APPROVE" | "RETURN"; reason?: string },
) {
  return unwrapData(
    api.post<ApiResponse<TeamReportDay>>(
      `/team-report/days/${id}/decide`,
      input,
    ),
  );
}

// ------------------------------------------------------- báo cáo tổng hợp

/**
 * Bản này do ĐỘI lập hay do PHÒNG lập.
 *
 * Nghiệp vụ y hệt nhau - cùng luật trạng thái, cùng cách chấm, cùng đường trình
 * lên. Khác duy nhất là ĐƯỜNG GỌI: server gác hai đầu bằng hai quyền khác nhau
 * (đội có ENTRY, phòng có REVIEW) nên phải có hai bộ route, gọi nhầm đường là
 * nhận 403. Phạm vi lấy nhiệm vụ thì server tự suy từ cây đơn vị: đội lấy việc
 * của mình, phòng lấy việc của các đội bên dưới.
 */
export type TeamReportSummaryLevel = "TEAM" | "UNIT";

const summaryBase = (level: TeamReportSummaryLevel = "TEAM") =>
  level === "UNIT" ? "/team-report/unit-summary" : "/team-report/summary";

export function fetchTeamReportSummaryCandidates(params: {
  fromDate: string;
  toDate: string;
  q?: string;
  /** `ALL` = cả kho, mỗi việc kèm cờ `inPeriod`. Mặc định chỉ trong kỳ. */
  scope?: "PERIOD" | "ALL";
  /** Lọc theo đội - chỉ có nghĩa với bản của phòng. */
  departmentIds?: string[];
  level?: TeamReportSummaryLevel;
}) {
  return unwrapData(
    api.get<ApiResponse<TeamReportSummaryCandidates>>(
      `${summaryBase(params.level)}/candidates`,
      {
        params: {
          fromDate: params.fromDate,
          toDate: params.toDate,
          ...(params.q?.trim() ? { q: params.q.trim() } : {}),
          ...(params.scope ? { scope: params.scope } : {}),
          // Gộp thành chuỗi: server tự tách, khỏi phụ thuộc cách nối mảng của axios.
          ...(params.departmentIds?.length
            ? { departmentIds: params.departmentIds.join(",") }
            : {}),
        },
      },
    ),
  );
}

/**
 * Điểm của một tập nhiệm vụ đang tích, CHƯA lập báo cáo.
 *
 * Để cân nhắc trước khi chốt: thêm bớt vài việc rồi nhìn tổng điểm đổi theo.
 * Server tính bằng đúng công thức của bản đã lập, nên con số xem trước chính là
 * con số sẽ ra.
 */
export function previewTeamReportSummaryScore(
  taskIds: string[],
  level?: TeamReportSummaryLevel,
) {
  return unwrapData(
    api.post<ApiResponse<{ axisScores: TeamReportAxisScore[] }>>(
      `${summaryBase(level)}/preview`,
      { taskIds },
    ),
  ).then((data) => data.axisScores);
}

export function fetchTeamReportRecipients(
  q?: string,
  level?: TeamReportSummaryLevel,
) {
  return unwrapData(
    api.get<ApiResponse<{ people: TeamReportRecipient[] }>>(
      `${summaryBase(level)}/recipients`,
      { params: q?.trim() ? { q: q.trim() } : {} },
    ),
  ).then((data) => data.people);
}

export function fetchTeamReportSummaries(query: {
  status?: TeamReportDayStatus | "";
  page?: number;
  limit?: number;
  level?: TeamReportSummaryLevel;
}) {
  return unwrapPaginated(
    api.get<ApiResponse<TeamReportSummary[]>>(summaryBase(query.level), {
      params: {
        page: query.page ?? 1,
        limit: query.limit ?? 20,
        ...(query.status ? { status: query.status } : {}),
      },
    }),
  );
}

/**
 * Lập một bản tổng hợp ở dạng nháp.
 *
 * `taskIds` là tập chọn tay - khoảng ngày chỉ dùng để lọc kho cho dễ nhìn, đưa
 * việc nào vào báo cáo vẫn là quyết định của người lập.
 */
export function createTeamReportSummary(input: {
  title: string;
  period: TeamReportPeriod;
  fromDate: string;
  toDate: string;
  taskIds: string[];
  note?: string;
  level?: TeamReportSummaryLevel;
}) {
  const { level, ...body } = input;
  return unwrapData(
    api.post<ApiResponse<TeamReportSummary>>(summaryBase(level), body),
  );
}

export function sendTeamReportSummary(
  id: string,
  input: { recipientId: string; note?: string },
  level?: TeamReportSummaryLevel,
) {
  return unwrapData(
    api.post<ApiResponse<TeamReportSummary>>(
      `${summaryBase(level)}/${id}/send`,
      input,
    ),
  );
}

export type TeamReportSummaryDetail = {
  summary: TeamReportSummary;
  /** Đơn vị lập bản - server trả riêng vì `summary.departmentId` không populate. */
  department?: { id: string; name: string };
  templates: Record<string, TeamReportTemplate>;
  catalogs: TeamReportCatalogs;
  /** Điểm từng trục, do server tính theo công thức khai trong mẫu. */
  axisScores: TeamReportAxisScore[];
};

export function fetchTeamReportSummary(
  id: string,
  level?: TeamReportSummaryLevel,
) {
  return unwrapData(
    api.get<ApiResponse<TeamReportSummaryDetail>>(
      `${summaryBase(level)}/${id}`,
    ),
  );
}

/**
 * Hộp đến bản tổng hợp của cấp trên.
 *
 * Đường riêng chứ không dùng chung với danh sách của đội: server gác hai đầu
 * bằng hai quyền khác nhau (đội có ENTRY, cấp trên có REVIEW), gọi nhầm đường
 * là nhận 403 chứ không phải danh sách rỗng.
 */
export function fetchTeamReportSummaryInbox(query: {
  status?: TeamReportDayStatus | "";
  page?: number;
  limit?: number;
}) {
  return unwrapPaginated(
    api.get<ApiResponse<TeamReportSummary[]>>("/team-report/summary/incoming", {
      params: {
        page: query.page ?? 1,
        limit: query.limit ?? 20,
        ...(query.status ? { status: query.status } : {}),
      },
    }),
  );
}

export function fetchIncomingTeamReportSummary(id: string) {
  return unwrapData(
    api.get<ApiResponse<TeamReportSummaryDetail>>(
      `/team-report/summary/incoming/${id}`,
    ),
  );
}

export function decideTeamReportSummary(
  id: string,
  input: { decision: "APPROVE" | "RETURN"; reason?: string },
) {
  return unwrapData(
    api.post<ApiResponse<TeamReportSummary>>(
      `/team-report/summary/${id}/decide`,
      input,
    ),
  );
}

/**
 * Đội chấm lại một dòng ngay trên bản tổng hợp CÒN NHÁP.
 *
 * Ghi thẳng vào nhiệm vụ sống rồi chụp lại dòng, nên số ở đây và số ở bảng ngày
 * luôn là một. Bản đã trình thì server chặn - lúc đó chỉ cấp trên chỉnh được.
 */
export function editTeamReportSummaryRows(
  id: string,
  rows: TeamReportReviewRow[],
  level?: TeamReportSummaryLevel,
) {
  return unwrapData(
    api.patch<ApiResponse<TeamReportSummary>>(
      `${summaryBase(level)}/${id}/rows`,
      { rows },
    ),
  );
}

/**
 * Thêm / bớt nhiệm vụ của một bản đã lập.
 *
 * Gộp hai danh sách vào một lượt gọi: đổi tập nhiệm vụ xong server phải chụp
 * lại toàn bộ dòng, gọi hai lượt là chụp hai lần và giữa hai lượt bản đang dở.
 */
export function changeTeamReportSummaryTasks(
  id: string,
  input: { add?: string[]; remove?: string[] },
  level?: TeamReportSummaryLevel,
) {
  return unwrapData(
    api.patch<ApiResponse<TeamReportSummary>>(
      `${summaryBase(level)}/${id}/tasks`,
      input,
    ),
  );
}

/**
 * Cấp trên chỉnh số trên bản đã nhận. Không cần lý do: ai sửa, sửa gì, lúc nào
 * đã nằm trong nhật ký của bản lẫn của nhiệm vụ.
 */
export function reviewTeamReportSummary(
  id: string,
  input: { reason?: string; rows: TeamReportReviewRow[] },
) {
  return unwrapData(
    api.patch<ApiResponse<TeamReportSummary>>(
      `/team-report/summary/${id}/review`,
      input,
    ),
  );
}

export function deleteTeamReportSummary(
  id: string,
  level?: TeamReportSummaryLevel,
) {
  return unwrapData(
    api.delete<ApiResponse<{ id: string }>>(`${summaryBase(level)}/${id}`),
  );
}

export function promoteTeamReport(input: {
  reportDate: string;
  dayIds: string[];
  note?: string;
}) {
  return unwrapData(
    api.post<ApiResponse<{ unitDayId: string; rowCount: number }>>(
      "/team-report/promote",
      input,
    ),
  );
}

// ------------------------------------------------- bảng A: tiêu chí chung

export function fetchTeamReportCriteria(periodMonth?: string) {
  return unwrapData(
    api.get<ApiResponse<TeamReportCriteriaData>>("/team-report/criteria", {
      params: periodMonth ? { periodMonth } : {},
    }),
  );
}

/**
 * Chấm các ô của bảng A. Gửi từng ô như tab Phân loại - cả đội chấm chung qua
 * một tài khoản, gửi cả bảng là đè mất phần người khác vừa gõ. Lần lưu đầu
 * tiên của tháng tạo ra bản thật; `version` lệch thì server trả 409.
 */
export function saveTeamReportCriteria(
  periodMonth: string,
  input: {
    version: number;
    rows: Array<{
      criterionId: string;
      fieldValues: Record<string, string | number>;
    }>;
  },
) {
  return unwrapData(
    api.patch<ApiResponse<TeamReportCriteriaData>>(
      `/team-report/criteria/${periodMonth}`,
      input,
    ),
  );
}
