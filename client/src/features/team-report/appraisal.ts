import type { ApiResponse } from "@/features/auth/types";
import { api, unwrapData, unwrapPaginated } from "@/lib/api-client";
import type {
  TeamReportDayStatus,
  TeamReportFirstApproval,
  TeamReportRating,
  TeamReportRouteUnitView,
} from "@/features/team-report/types";

/* ------------------------------------------------------------------ kiểu */

export type AppraisalBonus = {
  itemId: string | null;
  itemName: string;
  maxScore: number | null;
  score: number | null;
  /** "Cụ thể nội dung minh chứng". */
  evidence: string;
};

export type AppraisalPenalty = {
  /** Tiêu chí của dòng trừ - cùng tiêu chí vừa cộng vừa trừ được. */
  itemId: string | null;
  itemName: string;
  /** "Cụ thể nội dung trừ điểm". */
  content: string;
  score: number | null;
};

export type AppraisalUnit = {
  departmentId: string;
  departmentName: string;
  selfScore: number | null;
  bonuses: AppraisalBonus[];
  penalties: AppraisalPenalty[];
  upgradeNote: string;
  proposedRating: TeamReportRating | "";
  ratingNote: string;
  /** Server tính - client tính lại tại chỗ khi đang sửa (`appraisalTotals`). */
  bonusTotal?: number;
  penaltyTotal?: number;
  finalScore?: number | null;
};

export type AppraisalCriterion = {
  id: string;
  name: string;
  rule: string;
  maxScore: number | null;
};

export type AppraisalSheet = {
  _id: string | null;
  periodMonth: string;
  status: TeamReportDayStatus;
  stage: "FIRST" | "FINAL";
  version: number;
  departmentName: string;
  leaderName: string;
  commanderName: string;
  recipientName: string;
  finalRecipientName: string;
  firstApproval: TeamReportFirstApproval | null;
  sentByName: string;
  sentAt: string | null;
  decidedByName: string;
  decidedAt: string | null;
  returnReason: string;
  updatedAt: string | null;
  units: AppraisalUnit[];
};

export type AppraisalComposerData = AppraisalSheet & {
  criteria: AppraisalCriterion[];
  /** Đơn vị theo luồng; `approved` = đã có báo cáo tháng được duyệt. */
  suggestedUnits: Array<{ id: string; name: string; approved: boolean }>;
  /** Đã duyệt báo cáo tháng nhưng chưa có trong bảng đã lưu. */
  newlyApprovedIds: string[];
  /** Nơi nhận theo luồng APPRAISAL; units null = chưa có luồng. */
  route: {
    units: TeamReportRouteUnitView[] | null;
    finalReviewer: TeamReportRouteUnitView | null;
  };
  /** Tổng điểm KPI tập thể trên báo cáo tháng đã duyệt của đơn vị. */
  selfScoreHints: Record<
    string,
    { score: number; maxScore: number; title: string }
  >;
  canEdit: boolean;
};

export type AppraisalIncomingData = AppraisalSheet & { canDecide: boolean };

export type AppraisalInboxRow = {
  _id: string;
  periodMonth: string;
  status: TeamReportDayStatus;
  stage: "FIRST" | "FINAL";
  departmentName: string;
  unitCount: number;
  recipientName: string;
  finalRecipientName: string;
  sentByName: string;
  sentAt: string | null;
  decidedByName: string;
  decidedAt: string | null;
  returnReason: string;
};

/* ---------------------------------------------------------------- công thức */

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * Cùng công thức với server (`appraisalTotals`): cộng theo tiêu chí rồi chặn
 * trần tiêu chí; trừ cộng thẳng; sau thẩm định = tự chấm + cộng − trừ.
 */
export function appraisalTotals(unit: AppraisalUnit) {
  const byItem = new Map<string, { sum: number; cap: number | null }>();
  for (const bonus of unit.bonuses) {
    if (bonus.score === null) continue;
    const key = bonus.itemId ?? "";
    const item = byItem.get(key) ?? { sum: 0, cap: bonus.maxScore };
    item.sum += bonus.score;
    byItem.set(key, item);
  }
  let bonusTotal = 0;
  for (const item of byItem.values()) {
    bonusTotal += item.cap === null ? item.sum : Math.min(item.sum, item.cap);
  }
  const penaltyTotal = unit.penalties.reduce(
    (sum, penalty) => sum + (penalty.score ?? 0),
    0,
  );
  return {
    bonusTotal: round2(bonusTotal),
    penaltyTotal: round2(penaltyTotal),
    finalScore:
      unit.selfScore === null
        ? null
        : round2(unit.selfScore + bonusTotal - penaltyTotal),
  };
}

/** Đơn vị đã đủ để trình: có tự chấm và đã chọn xếp loại. */
export function unitComplete(unit: AppraisalUnit) {
  return unit.selfScore !== null && !!unit.proposedRating;
}

/* -------------------------------------------------------------------- API */

export const appraisalKeys = {
  access: (userId: string) => ["team-report", "appraisal-access", userId],
  sheet: (month: string) => ["team-report", "appraisal", month],
  inbox: (status: string, page: number) =>
    ["team-report", "appraisal-inbox", status, page] as const,
  incoming: (id: string) => ["team-report", "appraisal-incoming", id],
};

export function fetchAppraisalAccess() {
  return unwrapData(
    api.get<ApiResponse<{ allowed: boolean; canReceive: boolean }>>(
      "/team-report/appraisals/access",
    ),
  );
}

export function fetchAppraisal(month: string) {
  return unwrapData(
    api.get<ApiResponse<AppraisalComposerData>>(
      `/team-report/appraisals/${month}`,
    ),
  );
}

export function saveAppraisal(
  month: string,
  input: {
    version?: number;
    leaderName?: string;
    commanderName?: string;
    units: AppraisalUnit[];
  },
) {
  return unwrapData(
    api.put<ApiResponse<AppraisalSheet>>(`/team-report/appraisals/${month}`, {
      version: input.version,
      leaderName: input.leaderName,
      commanderName: input.commanderName,
      // Chỉ gửi trường nhập - tổng là số server tự tính.
      units: input.units.map((unit) => ({
        departmentId: unit.departmentId,
        selfScore: unit.selfScore,
        bonuses: unit.bonuses
          .filter((bonus) => bonus.itemId)
          .map((bonus) => ({
            itemId: bonus.itemId,
            score: bonus.score,
            evidence: bonus.evidence,
          })),
        penalties: unit.penalties
          // Dòng trừ trống hẳn thì bỏ - người dùng bấm "Thêm" rồi thôi.
          .filter((penalty) => penalty.content.trim() || penalty.score !== null)
          .map((penalty) => ({
            itemId: penalty.itemId,
            content: penalty.content,
            score: penalty.score,
          })),
        upgradeNote: unit.upgradeNote,
        proposedRating: unit.proposedRating,
        ratingNote: unit.ratingNote,
      })),
    }),
  );
}

export function sendAppraisal(month: string) {
  return unwrapData(
    api.post<ApiResponse<AppraisalSheet>>(
      `/team-report/appraisals/${month}/send`,
    ),
  );
}

export function fetchAppraisalInbox(query: {
  status?: TeamReportDayStatus | "";
  page?: number;
  limit?: number;
}) {
  return unwrapPaginated(
    api.get<ApiResponse<AppraisalInboxRow[]>>(
      "/team-report/appraisals/incoming",
      {
        params: {
          page: query.page ?? 1,
          limit: query.limit ?? 20,
          ...(query.status ? { status: query.status } : {}),
        },
      },
    ),
  );
}

export function fetchAppraisalIncoming(id: string) {
  return unwrapData(
    api.get<ApiResponse<AppraisalIncomingData>>(
      `/team-report/appraisals/incoming/${id}`,
    ),
  );
}

export function decideAppraisal(
  id: string,
  input: { decision: "APPROVE" | "RETURN"; reason?: string },
) {
  return unwrapData(
    api.post<ApiResponse<AppraisalIncomingData>>(
      `/team-report/appraisals/incoming/${id}/decide`,
      input,
    ),
  );
}
