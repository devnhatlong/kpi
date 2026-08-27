"use client";

import { useRef } from "react";
import { Check, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import type { ScoreGroup } from "@/features/mission-form-config/types";
import {
  formatScoreRange,
  isScoreInGroupRange,
} from "@/features/mission-form-config/types";
import { missionTone } from "@/features/personal-mission/status-styles";
import type { ResultColumns } from "@/features/personal-mission/task-summary";
import { cn } from "@/lib/utils";

/** Tên cột trống, hoặc chính là chữ "Đạt" - không dùng làm nhãn nút được. */
function isPassLabel(title: string): boolean {
  const plain = title.trim().toLowerCase();
  return !plain || plain === "đạt" || plain === "dat";
}

/**
 * Ô kết quả của trục chấm theo mục: chọn Đạt / Không đạt rồi nhập điểm.
 *
 * Đạt / Không đạt là hai mặt của cùng một quyết định nên bày thành cặp nút bật
 * tắt, không phải một ô tích rời - tích rời thì có cảnh vừa khai điểm vừa tích
 * "Không đạt", đọc ra không biết rốt cuộc mục này được mấy điểm.
 *
 * Dùng chung cho màn cán bộ tự khai và màn chỉ huy chấm lại, để hai bên nhìn
 * thấy đúng một khung điểm chuẩn.
 */
export function ResultFields({
  columns,
  values,
  initialValues,
  scoreGroup,
  disabled = false,
  onChange,
}: {
  columns: ResultColumns;
  /** Giá trị thô theo khoá cột: ô điểm là con số, ô tích là "1". */
  values: Record<string, string>;
  /**
   * Giá trị lúc mở form. Dùng để hoàn nguyên khi người dùng bấm "Không đạt"
   * rồi đổi ý: mở sẵn ở trạng thái Không đạt thì trong phiên chưa có số nào để
   * nhớ, phải lùi về đúng số đã lưu.
   */
  initialValues?: Record<string, string>;
  /** Nhóm điểm của nhiệm vụ - nguồn của "Khung chuẩn"; null = chưa gán. */
  scoreGroup?: ScoreGroup | null;
  disabled?: boolean;
  onChange: (next: Record<string, string>) => void;
}) {
  const failed = columns.flags.some((column) => values[column.key] === "1");
  /*
    Nút bên phải luôn mang nghĩa KHÔNG ĐẠT: ô tích của trục chấm theo mục là ô
    đánh dấu việc không đạt, tích vào là điểm về 0 (server cũng xử đúng vậy).
    Mẫu nào đặt tên cột tích là "Đạt" hoặc bỏ trống thì hai nút sẽ đọc y hệt
    nhau, không ai phân biệt được - lúc đó dùng nhãn chuẩn, tên cột thật đẩy
    xuống tooltip để còn lần ra cột nào đang được ghi.
  */
  const flagColumnTitle = columns.flags[0]?.title?.trim() ?? "";
  const flagTitle = isPassLabel(flagColumnTitle)
    ? "Không đạt"
    : flagColumnTitle;
  /** Điểm ngay trước khi bấm "Không đạt" - bấm "Đạt" lại là lấy về. */
  const stashed = useRef<Record<string, string>>({});

  /** Chọn Đạt: bỏ ô tích, trả lại điểm cũ. Chọn Không đạt: tích và ép 0. */
  const setFailed = (next: boolean) => {
    const patch = { ...values };
    for (const column of columns.flags) patch[column.key] = next ? "1" : "";

    for (const column of columns.scores) {
      if (next) {
        stashed.current[column.key] = values[column.key] ?? "";
        patch[column.key] = "0";
        continue;
      }
      const restored =
        stashed.current[column.key] ?? initialValues?.[column.key];
      // Không nhớ được số nào thì để trống cho người dùng gõ, đừng giữ số 0.
      patch[column.key] = restored && restored !== "0" ? restored : "";
    }
    onChange(patch);
  };

  const outOfRange = (raw: string) => {
    const value = Number(String(raw).replace(",", "."));
    if (!raw.trim() || !Number.isFinite(value) || !scoreGroup) return false;
    return !isScoreInGroupRange(value, scoreGroup);
  };

  return (
    <div className="space-y-2">
      {columns.flags.length > 0 ? (
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted/60 p-1">
          {[
            { value: false, label: "Đạt", icon: Check },
            { value: true, label: flagTitle, icon: X },
          ].map(({ value, label, icon: Icon }) => {
            const active = failed === value;
            return (
              <button
                // Khoá theo vế Đạt / Không đạt, không theo nhãn: mẫu đặt tên
                // cột trùng chữ "Đạt" là hai nút trùng khoá, React báo lỗi.
                key={value ? "failed" : "passed"}
                type="button"
                disabled={disabled}
                title={
                  value && flagColumnTitle
                    ? `Ghi vào cột "${flagColumnTitle}"`
                    : undefined
                }
                onClick={() => setFailed(value)}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                  active
                    ? cn(
                        "bg-background font-medium shadow-sm",
                        value
                          ? missionTone.danger.text
                          : missionTone.success.text,
                      )
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
                {label}
              </button>
            );
          })}
        </div>
      ) : null}

      {/* Không đạt thì chẳng còn điểm nào để nhập - giấu ô đi cho khỏi phân vân. */}
      {failed
        ? null
        : columns.scores.map((column) => {
            const invalid = outOfRange(values[column.key] ?? "");
            return (
              <div key={column.key} className="flex items-center gap-3">
                <Input
                  className={cn(
                    "h-10 flex-1 text-base font-medium",
                    invalid &&
                      "border-destructive focus-visible:ring-destructive",
                  )}
                  inputMode="decimal"
                  placeholder="0"
                  value={values[column.key] ?? ""}
                  disabled={disabled}
                  onChange={(event) =>
                    onChange({ ...values, [column.key]: event.target.value })
                  }
                />
                <div className="shrink-0 text-right text-xs">
                  <p className="text-muted-foreground">{column.title}</p>
                  {scoreGroup ? (
                    <p
                      className={cn(
                        "font-medium",
                        invalid ? missionTone.danger.text : "text-foreground",
                      )}
                    >
                      Khung chuẩn: {formatScoreRange(scoreGroup)}
                    </p>
                  ) : (
                    <p className={missionTone.warning.text}>
                      Chưa gán nhóm điểm
                    </p>
                  )}
                </div>
              </div>
            );
          })}
    </div>
  );
}
