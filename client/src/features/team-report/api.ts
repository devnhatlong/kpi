import type { ApiResponse } from "@/features/auth/types";
import { api, unwrapData, unwrapPaginated } from "@/lib/api-client";
import type {
  TeamReportCatalogs,
  TeamReportClassifyBoard,
  TeamReportDay,
  TeamReportDayStatus,
  TeamReportSheet,
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
  input: { reason: string; rows: TeamReportReviewRow[] },
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
