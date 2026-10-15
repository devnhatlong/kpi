"use client";

import type { ComponentProps, ReactNode } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TEAM_REPORT_RATINGS,
  type TeamReportConclusion,
  type TeamReportRating,
} from "@/features/team-report/types";
import { cn } from "@/lib/utils";

/** Bản đang gõ. Không có tổng điểm: đó là điểm bảng B, server tự cộng. */
export type ConclusionDraft = {
  proposedRating: TeamReportRating | "";
  compilerName: string;
  compilerPhone: string;
  leaderName: string;
};

export type ConclusionErrors = Partial<Record<keyof ConclusionDraft, string>>;

/** Phần đơn vị khai - gửi kèm lúc trình. */
export type ConclusionInput = Omit<
  TeamReportConclusion,
  "totalScore" | "maxScore"
>;

const STORAGE_PREFIX = "team-report-conclusion:";

const formatPoints = (value: number) =>
  value.toLocaleString("vi-VN", { maximumFractionDigits: 2 });

/** "38,75 / 70 điểm" - không có điểm tối đa thì bỏ vế sau. */
export function conclusionScoreText(score: number, maxScore?: number | null) {
  return maxScore
    ? `${formatPoints(score)} / ${formatPoints(maxScore)} điểm`
    : `${formatPoints(score)} điểm`;
}

/**
 * Bản nháp ban đầu của phần cuối báo cáo.
 *
 * - Trình lại bản bị trả: lấy đúng những gì đã khai lần trước.
 * - Trình lần đầu: tên / số điện thoại cán bộ tổng hợp và tên lãnh đạo lấy
 *   lại lần khai trước trên máy này - tháng nào cũng cùng người, bắt gõ lại là
 *   phiền. Xếp loại để trống cho người lập chọn.
 *
 * Tên tài khoản KHÔNG dùng làm cán bộ tổng hợp: tài khoản đội mang tên đội
 * ("Tổ Tổng hợp…"), không phải tên người.
 */
export function initialConclusion(
  userId: string | undefined,
  previous: TeamReportConclusion | null | undefined,
): ConclusionDraft {
  if (previous) {
    return {
      proposedRating: previous.proposedRating,
      compilerName: previous.compilerName,
      compilerPhone: previous.compilerPhone,
      leaderName: previous.leaderName,
    };
  }
  let remembered: Partial<ConclusionDraft> = {};
  try {
    const raw = userId
      ? window.localStorage.getItem(`${STORAGE_PREFIX}${userId}`)
      : null;
    if (raw) remembered = JSON.parse(raw) as Partial<ConclusionDraft>;
  } catch {
    // Trình duyệt chặn bộ nhớ - để trống cho người dùng gõ.
  }
  return {
    proposedRating: "",
    compilerName: remembered.compilerName ?? "",
    compilerPhone: remembered.compilerPhone ?? "",
    leaderName: remembered.leaderName ?? "",
  };
}

/** Nhớ người khai cho lần trình sau trên máy này. */
export function rememberConclusion(
  userId: string | undefined,
  value: ConclusionInput,
) {
  if (!userId) return;
  try {
    window.localStorage.setItem(
      `${STORAGE_PREFIX}${userId}`,
      JSON.stringify({
        compilerName: value.compilerName,
        compilerPhone: value.compilerPhone,
        leaderName: value.leaderName,
      }),
    );
  } catch {
    // Không nhớ được thì lần sau gõ lại - không chặn việc trình.
  }
}

/** Kiểm từng ô; trả về bản sạch khi đủ, kèm lỗi theo ô khi thiếu. */
export function validateConclusion(draft: ConclusionDraft): {
  value: ConclusionInput | null;
  errors: ConclusionErrors;
} {
  const errors: ConclusionErrors = {};
  if (!draft.proposedRating) {
    errors.proposedRating = "Chọn mức đề nghị xếp loại.";
  }
  if (!draft.compilerName.trim()) {
    errors.compilerName = "Nhập họ tên cán bộ tổng hợp.";
  }
  if (!draft.compilerPhone.trim()) {
    errors.compilerPhone = "Nhập số điện thoại cán bộ tổng hợp.";
  } else if (!/^[0-9+().\s-]{6,20}$/.test(draft.compilerPhone.trim())) {
    errors.compilerPhone = "Số điện thoại không hợp lệ.";
  }
  if (!draft.leaderName.trim()) {
    errors.leaderName = "Nhập họ tên lãnh đạo đơn vị.";
  }
  if (Object.keys(errors).length || !draft.proposedRating) {
    return { value: null, errors };
  }
  return {
    value: {
      proposedRating: draft.proposedRating,
      compilerName: draft.compilerName.trim(),
      compilerPhone: draft.compilerPhone.trim(),
      leaderName: draft.leaderName.trim(),
    },
    errors,
  };
}

/**
 * Phần cuối phụ lục, khai ngay trong hộp trình: "Tổng điểm KPI tập thể",
 * "Đề nghị xếp loại tháng", cán bộ tổng hợp và lãnh đạo đơn vị.
 *
 * Tổng điểm là điểm BẢNG B (cộng điểm quy đổi các trục) - chỉ hiện, không ai
 * gõ; muốn đổi thì sửa điểm ở từng nhiệm vụ. Bốn ô còn lại bắt buộc.
 */
export function SummaryConclusionFields({
  idPrefix,
  value,
  onChange,
  errors,
  score,
  maxScore,
}: {
  idPrefix: string;
  value: ConclusionDraft;
  onChange: (next: ConclusionDraft) => void;
  errors: ConclusionErrors;
  /** Điểm bảng A + bảng B - null khi chưa có gì để cộng. */
  score: number | null;
  maxScore: number | null;
}) {
  const set = <K extends keyof ConclusionDraft>(
    key: K,
    next: ConclusionDraft[K],
  ) => onChange({ ...value, [key]: next });

  const field = (
    key: keyof ConclusionDraft,
    label: string,
    input: ReactNode,
  ) => (
    <div className="space-y-1.5">
      <Label htmlFor={`${idPrefix}-${key}`}>
        {label} <span className="text-destructive">*</span>
      </Label>
      {input}
      {errors[key] ? (
        <p
          id={`${idPrefix}-${key}-error`}
          role="alert"
          className="text-xs text-destructive"
        >
          {errors[key]}
        </p>
      ) : null}
    </div>
  );

  const textInput = (
    key: "compilerName" | "compilerPhone" | "leaderName",
    props: ComponentProps<typeof Input>,
  ) => (
    <Input
      id={`${idPrefix}-${key}`}
      value={value[key]}
      onChange={(event) => set(key, event.target.value)}
      aria-invalid={!!errors[key]}
      aria-describedby={errors[key] ? `${idPrefix}-${key}-error` : undefined}
      {...props}
    />
  );

  return (
    <fieldset className="space-y-3 rounded-lg border bg-muted/20 p-3">
      <legend className="px-1 font-display text-sm font-semibold">
        Kết quả tự đánh giá
      </legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Tổng điểm KPI tập thể</p>
          <output className="flex h-9 items-center rounded-md border border-dashed bg-muted/40 px-3 text-sm font-semibold tabular-nums">
            {score === null ? "-" : conclusionScoreText(score, maxScore)}
          </output>
          <p className="text-xs text-muted-foreground">
            Tự cộng từ bảng A (tiêu chí chung) và bảng B (điểm các trục).
          </p>
        </div>
        {field(
          "proposedRating",
          "Đề nghị xếp loại tháng",
          <Select
            value={value.proposedRating}
            onValueChange={(next) =>
              set("proposedRating", next as TeamReportRating)
            }
          >
            <SelectTrigger
              id={`${idPrefix}-proposedRating`}
              aria-invalid={!!errors.proposedRating}
              className={cn(
                "w-full",
                errors.proposedRating && "border-destructive",
              )}
            >
              <SelectValue placeholder="Chọn mức xếp loại" />
            </SelectTrigger>
            <SelectContent>
              {TEAM_REPORT_RATINGS.map((rating) => (
                <SelectItem key={rating} value={rating}>
                  {rating}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>,
        )}
        {field(
          "compilerName",
          /* Nhãn ngắn, một dòng: hai ô đứng cạnh nhau mà một nhãn xuống dòng
             là hai ô nhập lệch hàng. */
          "Cán bộ tổng hợp",
          textInput("compilerName", {
            autoComplete: "name",
            placeholder: "Ví dụ: Nguyễn Văn A",
          }),
        )}
        {field(
          "compilerPhone",
          "Số điện thoại",
          textInput("compilerPhone", {
            type: "tel",
            inputMode: "tel",
            autoComplete: "tel",
            placeholder: "Ví dụ: 0912 345 678",
          }),
        )}
        {field(
          "leaderName",
          "Lãnh đạo đơn vị",
          textInput("leaderName", {
            autoComplete: "off",
            placeholder: "Họ và tên lãnh đạo ký báo cáo",
          }),
        )}
      </div>
    </fieldset>
  );
}

/** Bày phần cuối đã khai - ở màn chi tiết của người lập lẫn người duyệt. */
export function SummaryConclusionView({
  conclusion,
}: {
  conclusion: TeamReportConclusion;
}) {
  const items: Array<[string, string]> = [
    [
      "Tổng điểm KPI tập thể",
      conclusionScoreText(conclusion.totalScore, conclusion.maxScore),
    ],
    ["Đề nghị xếp loại tháng", conclusion.proposedRating],
    [
      "Cán bộ tổng hợp",
      `${conclusion.compilerName} · ${conclusion.compilerPhone}`,
    ],
    ["Lãnh đạo đơn vị", conclusion.leaderName],
  ];
  return (
    <dl className="grid gap-x-6 gap-y-3 rounded-lg border px-4 py-3 text-sm sm:grid-cols-2">
      {items.map(([label, text]) => (
        <div key={label} className="min-w-0">
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="break-words font-medium tabular-nums">{text}</dd>
        </div>
      ))}
    </dl>
  );
}
