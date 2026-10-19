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

/**
 * Vòng đời trình / duyệt của MỘT đơn vị - mỗi đơn vị trình và duyệt riêng.
 * Đơn vị vừa thêm trên màn (chưa lưu) chưa có, coi như nháp.
 */
export type AppraisalUnitLifecycle = {
  /** Id đơn vị trong bảng - hộp đến mở theo id này. null = chưa lưu. */
  _id?: string | null;
  status?: TeamReportDayStatus;
  stage?: "FIRST" | "FINAL";
  recipientName?: string;
  finalRecipientName?: string;
  firstApproval?: TeamReportFirstApproval | null;
  sentByName?: string;
  sentAt?: string | null;
  decidedByName?: string;
  decidedAt?: string | null;
  returnReason?: string;
  /** Người ký chụp lúc trình đơn vị này. */
  leaderName?: string;
  commanderName?: string;
};

/** Đơn vị còn sửa / trình được: chưa trình hoặc bị trả lại. */
export function unitEditable(unit: AppraisalUnitLifecycle) {
  return !unit.status || unit.status === "DRAFT" || unit.status === "RETURNED";
}

export type AppraisalUnit = AppraisalUnitLifecycle & {
  departmentId: string;
  departmentName: string;
  /**
   * Tên gọn cho cột "Đơn vị" khi in: mã đơn vị; xã / phường / đồn giữ tên.
   * Server trả - đơn vị vừa thêm tay chưa lưu thì chưa có, in tên đầy đủ.
   */
  shortName?: string;
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

/**
 * Một dòng biểu dương / phê bình của bảng các phòng gửi cùng tháng có nhắc tới
 * đơn vị đang thẩm định - để soi chiếu và đưa nhanh vào điểm cộng / trừ.
 */
export type AppraisalCommendationHint = {
  rowId: string;
  /** Biểu dương: nhóm nội dung = tiêu chí cộng điểm. Phê bình: null. */
  itemId: string | null;
  itemName: string;
  content: string;
  evidence: string;
  /** Ghi chú của phòng - thường là mức đề xuất ("đề nghị trừ 1 điểm"). */
  note: string;
  /** Phòng đã gửi đề xuất. */
  fromName: string;
  status: TeamReportDayStatus;
};

export type AppraisalCommendationHints = Record<
  string,
  { praises: AppraisalCommendationHint[]; criticisms: AppraisalCommendationHint[] }
>;

/** Chữ đưa vào ô minh chứng / nội dung trừ: nội dung kèm căn cứ trong ngoặc. */
export function hintText(hint: AppraisalCommendationHint) {
  const evidence = hint.evidence.trim();
  return evidence ? `${hint.content.trim()} (${evidence})` : hint.content.trim();
}

/**
 * "Đơn vị tự nhận" ở MỘT tiêu chí: các dòng Trục 2 của báo cáo tháng (cùng bản
 * cho điểm tự chấm). `total` đã chặn ở trần tiêu chí.
 */
export type AppraisalSelfClaim = {
  lines: Array<{ name: string; product: string; score: number | null }>;
  total: number;
  maxScore: number;
};

/** Theo id đơn vị → id tiêu chí. */
export type AppraisalSelfClaims = Record<
  string,
  Record<string, AppraisalSelfClaim>
>;

export type AppraisalComposerData = AppraisalSheet & {
  /** Đơn vị tự nhận theo tiêu chí - Trục 2 của báo cáo tháng. */
  selfClaims: AppraisalSelfClaims;
  /** Biểu dương / phê bình cùng tháng theo id đơn vị. */
  commendationHints: AppraisalCommendationHints;
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

/** Một dòng hộp đến = MỘT ĐƠN VỊ đã trình (`_id` là id đơn vị trong bảng). */
export type AppraisalInboxRow = {
  _id: string;
  periodMonth: string;
  status: TeamReportDayStatus;
  stage: "FIRST" | "FINAL";
  /** Đội thẩm định (người lập). */
  departmentName: string;
  /** Đơn vị được thẩm định. */
  unitName: string;
  proposedRating: string;
  finalScore: number | null;
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

/** Phần người thẩm định nhập - để so đơn vị trên màn với bản đã lưu. */
function editableFingerprint(unit: AppraisalUnit) {
  return JSON.stringify([
    unit.bonuses.map((b) => [b.itemId, b.score, b.evidence]),
    unit.penalties.map((p) => [p.itemId, p.score, p.content]),
    unit.proposedRating,
    unit.ratingNote,
    unit.upgradeNote,
  ]);
}

/**
 * Đơn vị ĐÃ LƯU: có trong bản đã lưu trên server và chưa sửa gì thêm so với
 * bản đó. `saved` rỗng = bảng chưa lưu lần nào.
 */
export function unitSaved(unit: AppraisalUnit, saved: AppraisalUnit[]) {
  const before = saved.find((item) => item.departmentId === unit.departmentId);
  return !!before && editableFingerprint(before) === editableFingerprint(unit);
}

/* -------------------------------------------------------------------- API */

export const appraisalKeys = {
  access: (userId: string) => ["team-report", "appraisal-access", userId],
  sheet: (month: string) => ["team-report", "appraisal", month],
  inbox: (status: string, page: number, month = "") =>
    ["team-report", "appraisal-inbox", status, page, month] as const,
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

/** Trình RIÊNG các đơn vị đã chọn (đã lưu, đủ tự chấm + xếp loại). */
export function sendAppraisal(
  month: string,
  input: { departmentIds: string[]; leaderName: string; commanderName: string },
) {
  return unwrapData(
    api.post<ApiResponse<AppraisalSheet>>(
      `/team-report/appraisals/${month}/send`,
      input,
    ),
  );
}

export function fetchAppraisalInbox(query: {
  status?: TeamReportDayStatus | "";
  /** "YYYY-MM" - chỉ đơn vị của bảng tháng đó. */
  periodMonth?: string;
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
          ...(query.periodMonth ? { periodMonth: query.periodMonth } : {}),
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
