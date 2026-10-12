import type { ApiResponse } from "@/features/auth/types";
import { api, unwrapData, unwrapPaginated } from "@/lib/api-client";
import type {
  TeamReportDayStatus,
  TeamReportFirstApproval,
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
  /** Tên chép lúc lưu - dòng chưa lưu thì client tự tra từ danh mục. */
  departmentNames: string[];
  /** Tên gọn khi in (phòng in mã, cấp xã giữ tên) - server trả. */
  departmentShortNames?: string[];
  /** Biểu dương: nội dung, kết quả nổi bật. Phê bình: tồn tại, hạn chế. */
  content: string;
  /** Căn cứ, tài liệu kiểm chứng. */
  evidence: string;
  note: string;
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
  /** Nơi nhận theo luồng COMMENDATION; units null = chưa có luồng. */
  route: {
    units: TeamReportRouteUnitView[] | null;
    finalReviewer: TeamReportRouteUnitView | null;
  };
  canEdit: boolean;
};

export type CommendationIncomingData = CommendationSheet & {
  criteria: Array<{ id: string; name: string }>;
  viewerRole: "RECIPIENT" | "COORDINATOR" | "INFORMED";
  canDecide: boolean;
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
  inbox: (box: string, status: string, page: number) =>
    ["team-report", "commendation-inbox", box, status, page] as const,
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
    itemId: row.itemId,
    departmentIds: row.departmentIds,
    content: row.content,
    evidence: row.evidence,
    note: row.note,
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

export function sendCommendation(month: string) {
  return unwrapData(
    api.post<ApiResponse<CommendationSheet>>(
      `/team-report/commendations/${month}/send`,
    ),
  );
}

export function fetchCommendationInbox(query: {
  box: CommendationInboxBox;
  status?: TeamReportDayStatus | "";
  page?: number;
  limit?: number;
}) {
  return unwrapPaginated(
    api.get<ApiResponse<CommendationInboxRow[]>>(
      "/team-report/commendations/incoming",
      {
        params: {
          box: query.box,
          page: query.page ?? 1,
          limit: query.limit ?? 20,
          ...(query.status ? { status: query.status } : {}),
        },
      },
    ),
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
