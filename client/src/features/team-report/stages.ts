/**
 * Trả lại về đâu (luồng duyệt 2 cấp): đơn vị lập (mặc định) hay người duyệt
 * liền trước - cấp 1. Khớp `RETURN_TARGETS` bên server (team-report.stages.ts).
 */
export type ReturnTarget = "CREATOR" | "PREVIOUS";

/** Lần gần nhất duyệt cuối trả bản về cấp 1 - để cấp 1 đọc lý do. */
export type StageReturn = {
  byName: string;
  reason: string;
  at: string;
};

/** Hai cờ server gửi kèm bản chi tiết để hộp trả lại biết bày gì. */
export type StageReturnInfo = {
  canReturnToPrevious?: boolean;
  returnedToFirst?: StageReturn | null;
};
