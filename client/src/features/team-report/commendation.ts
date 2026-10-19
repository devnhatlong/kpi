import type { ApiResponse } from "@/features/auth/types";
import type { CommendationUnitOrder } from "@/features/team-report/commendation-excel";
import { api, unwrapData, unwrapPaginated } from "@/lib/api-client";
import type {
  TeamReportDayStatus,
  TeamReportFirstApproval,
  TeamReportRecipient,
  TeamReportRouteUnitView,
} from "@/features/team-report/types";

/* ------------------------------------------------------------------ kiểu */

/** Một dòng biểu dương hoặc phê bình. */
export type CommendationRow = {
  /** null = dòng vừa thêm trên màn, chưa lưu. */
  _id: string | null;
  /** Chỉ dòng biểu dương: nhóm nội dung (mục Điểm cộng I). */
  itemId: string | null;
  itemName: string;
  departmentIds: string[];
  /** Chọn tường minh "Không có đơn vị" (khi không nêu đơn vị nào). */
  noUnit?: boolean;
  /** Tên chép lúc lưu - dòng chưa lưu thì client tự tra từ danh mục. */
  departmentNames: string[];
  /** Tên gọn khi in (phòng in mã, cấp xã giữ tên) - server trả. */
  departmentShortNames?: string[];
  /** Biểu dương: nội dung, kết quả nổi bật. Phê bình: tồn tại, hạn chế. */
  content: string;
  /** Căn cứ, tài liệu kiểm chứng. */
  evidence: string;
  note: string;
  /** Dòng phòng lấy từ bảng của một đội trong phòng - id dòng gốc + tên đội. */
  sourceRowId?: string | null;
  sourceName?: string;
};

/** Bảng của một đội trong phòng gửi lên trưởng phòng - nguồn lấy dòng. */
export type CommendationTeamSheet = {
  _id: string;
  departmentName: string;
  status: TeamReportDayStatus;
  sentAt: string | null;
  praises: CommendationRow[];
  criticisms: CommendationRow[];
};

export type CommendationDepartmentChoice = {
  id: string;
  code: string;
  name: string;
  /** "Phòng" | "Công an cấp xã" - để nhóm trong ô chọn. */
  group: string;
};

export type CommendationParticipant = {
  departmentName: string;
  userName: string;
  role: "COORDINATE" | "INFORM";
  seenAt: string | null;
};

export type CommendationSheet = {
  _id: string | null;
  periodMonth: string;
  /** Phòng lập bảng. */
  departmentName: string;
  status: TeamReportDayStatus;
  stage: "FIRST" | "FINAL";
  version: number;
  praises: CommendationRow[];
  criticisms: CommendationRow[];
  recipientName: string;
  finalRecipientName: string;
  firstApproval: TeamReportFirstApproval | null;
  participants: CommendationParticipant[];
  sentByName: string;
  sentAt: string | null;
  decidedByName: string;
  decidedAt: string | null;
  returnReason: string;
  updatedAt: string | null;
};

export type CommendationComposerData = CommendationSheet & {
  criteria: Array<{ id: string; name: string }>;
  departmentChoices: CommendationDepartmentChoice[];
  /**
   * Nơi nhận theo luồng COMMENDATION:
   * - `units`: bảng nơi nhận cố định (trưởng phòng → các đội PV01);
   * - `people`: luồng tự chọn (đội → trưởng phòng trực thuộc);
   * cả hai null = chưa có luồng.
   */
  route: {
    units: TeamReportRouteUnitView[] | null;
    finalReviewer: TeamReportRouteUnitView | null;
    people: TeamReportRecipient[] | null;
  };
  /** Bảng các đội trong phòng gửi lên tôi tháng này (trưởng phòng). */
  teamSheets: CommendationTeamSheet[];
  canEdit: boolean;
};

export type CommendationIncomingData = CommendationSheet & {
  criteria: Array<{ id: string; name: string }>;
  viewerRole: "RECIPIENT" | "COORDINATOR" | "INFORMED";
  canDecide: boolean;
  /** Người chốt bảng - trả lại được cả khi bảng đã duyệt. */
  canReturnApproved?: boolean;
};

export type CommendationInboxBox = "LEAD" | "INFORM";

export type CommendationInboxRow = {
  _id: string;
  periodMonth: string;
  status: TeamReportDayStatus;
  stage: "FIRST" | "FINAL";
  departmentName: string;
  praiseCount: number;
  criticismCount: number;
  recipientName: string;
  finalRecipientName: string;
  sentByName: string;
  sentAt: string | null;
  decidedByName: string;
  decidedAt: string | null;
  returnReason: string;
  seen: boolean;
};

export function blankCommendationRow(): CommendationRow {
  return {
    _id: null,
    itemId: null,
    itemName: "",
    departmentIds: [],
    departmentNames: [],
    content: "",
    evidence: "",
    note: "",
  };
}

/** Dòng đã đủ để gửi: có đơn vị, có nội dung (biểu dương thêm nhóm nội dung). */
export function commendationRowComplete(row: CommendationRow, praise: boolean) {
  return (
    row.departmentIds.length > 0 &&
    row.content.trim().length > 0 &&
    (!praise || !!row.itemId)
  );
}

/* -------------------------------------------------------------------- API */

export const commendationKeys = {
  access: (userId: string) => ["team-report", "commendation-access", userId],
  sheet: (month: string) => ["team-report", "commendation", month],
  inbox: (box: string, status: string, page: number, month = "") =>
    ["team-report", "commendation-inbox", box, status, page, month] as const,
  incoming: (id: string) => ["team-report", "commendation-incoming", id],
};

export function fetchCommendationAccess() {
  return unwrapData(
    api.get<ApiResponse<{ allowed: boolean; canReceive: boolean }>>(
      "/team-report/commendations/access",
    ),
  );
}

export function fetchCommendation(month: string) {
  return unwrapData(
    api.get<ApiResponse<CommendationComposerData>>(
      `/team-report/commendations/${month}`,
    ),
  );
}

export function saveCommendation(
  month: string,
  input: {
    version?: number;
    praises: CommendationRow[];
    criticisms: CommendationRow[];
  },
) {
  // Chỉ gửi trường nhập - tên đơn vị / tên nhóm là server tự chép.
  const pick = (row: CommendationRow) => ({
    _id: row._id,
    itemId: row.itemId,
    departmentIds: row.departmentIds,
    noUnit: !row.departmentIds.length && !!row.noUnit,
    content: row.content,
    evidence: row.evidence,
    note: row.note,
    sourceRowId: row.sourceRowId ?? null,
  });
  return unwrapData(
    api.put<ApiResponse<CommendationSheet>>(
      `/team-report/commendations/${month}`,
      {
        version: input.version,
        praises: input.praises.map(pick),
        criticisms: input.criticisms.map((row) => ({
          ...pick(row),
          itemId: null,
        })),
      },
    ),
  );
}

/** Gửi bảng. `recipientId` chỉ dùng cho luồng tự chọn (đội → trưởng phòng). */
export function sendCommendation(month: string, recipientId?: string) {
  return unwrapData(
    api.post<ApiResponse<CommendationSheet>>(
      `/team-report/commendations/${month}/send`,
      recipientId ? { recipientId } : {},
    ),
  );
}

/** Chép một dòng của bảng đội thành dòng của bảng phòng (giữ nguồn). */
export function rowFromTeam(
  row: CommendationRow,
  teamName: string,
): CommendationRow {
  return {
    ...row,
    _id: null,
    sourceRowId: row._id,
    sourceName: teamName,
  };
}

/** Số đếm cho huy hiệu trên các tab của hộp đến. */
export type CommendationInboxCounts = {
  /** LEAD = bảng chờ tôi duyệt; INFORM = bảng theo dõi chưa mở. */
  boxes: Record<CommendationInboxBox, number>;
  /** Số bảng theo trạng thái, trong hộp đang xem. */
  statuses: Record<"PENDING" | "APPROVED" | "RETURNED" | "ALL", number>;
};

export async function fetchCommendationInbox(query: {
  box: CommendationInboxBox;
  status?: TeamReportDayStatus | "";
  /** "YYYY-MM" - chỉ bảng của tháng đó. */
  periodMonth?: string;
  page?: number;
  limit?: number;
}) {
  const response = await api.get<
    ApiResponse<CommendationInboxRow[]> & { counts?: CommendationInboxCounts }
  >("/team-report/commendations/incoming", {
    params: {
      box: query.box,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      ...(query.status ? { status: query.status } : {}),
      ...(query.periodMonth ? { periodMonth: query.periodMonth } : {}),
    },
  });
  const list = await unwrapPaginated(Promise.resolve(response));
  return { ...list, counts: response.data.counts ?? null };
}

/** Toàn bộ bảng trong hộp đến đang lọc, đủ dòng - để xuất Excel tổng hợp. */
export function fetchCommendationInboxExport(query: {
  box: CommendationInboxBox;
  status?: TeamReportDayStatus | "";
  periodMonth?: string;
}) {
  return unwrapData(
    api.get<
      ApiResponse<{
        criteria: Array<{ id: string; name: string }>;
        /** Mọi đơn vị theo thứ tự cây, kèm khối - cho bản xuất nâng cao. */
        units: CommendationUnitOrder[];
        sheets: CommendationSheet[];
      }>
    >("/team-report/commendations/incoming/export", {
      params: {
        box: query.box,
        ...(query.status ? { status: query.status } : {}),
        ...(query.periodMonth ? { periodMonth: query.periodMonth } : {}),
      },
    }),
  );
}

export function fetchCommendationIncoming(id: string) {
  return unwrapData(
    api.get<ApiResponse<CommendationIncomingData>>(
      `/team-report/commendations/incoming/${id}`,
    ),
  );
}

export function decideCommendation(
  id: string,
  input: { decision: "APPROVE" | "RETURN"; reason?: string },
) {
  return unwrapData(
    api.post<ApiResponse<CommendationIncomingData>>(
      `/team-report/commendations/incoming/${id}/decide`,
      input,
    ),
  );
}
