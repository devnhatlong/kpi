"use client";

import { useState } from "react";
import { CheckCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { scorePersonalKpi } from "@/features/personal-kpi/api";
import { formatScoreNumber } from "@/features/personal-kpi/board-cell";
import { ResultFields } from "@/features/personal-kpi/components/result-fields";
import { DeltaTag } from "@/features/personal-kpi/components/score-delta-tag";
import { kpiTone } from "@/features/personal-kpi/status-styles";
import type { ScoreGroup } from "@/features/kpi-form-config/types";
import type { ResultColumns } from "@/features/personal-kpi/task-summary";
import type { PersonalKpiItem } from "@/features/personal-kpi/types";
import { getApiErrorMessage } from "@/lib/api-client";
import { cn } from "@/lib/utils";

/** Nhận xét soạn sẵn cho trục chấm theo mục. */
const NOTE_PRESETS = [
  "Nhiệm vụ đạt yêu cầu, đồng ý chốt điểm như trên.",
  "Hồ sơ kiểm chứng chưa đầy đủ, hạ điểm so với mức cán bộ tự khai.",
  "Không đạt yêu cầu, không tính điểm cho mục này.",
];

function numberOf(raw: unknown): number | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const parsed = Number(text.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

type ResultScoreFormProps = {
  item: PersonalKpiItem;
  columns: ResultColumns;
  /** Nhóm điểm của nhiệm vụ - khung chuẩn hiện cạnh ô điểm. */
  scoreGroup: ScoreGroup | null;
  onDone: () => void;
  onScored: () => void | Promise<void>;
};

/**
 * Chỉ huy chấm nhiệm vụ của trục chấm theo mục (Đạt / Không đạt).
 *
 * Trục kiểu này không có tỉ lệ phần trăm nào để chấm lại: chỉ huy hoặc hạ số
 * điểm cán bộ tự khai, hoặc tích "Không đạt" - và không đạt thì điểm bằng 0,
 * không có chuyện vừa không đạt vừa còn điểm.
 */
export function ResultScoreForm({
  item,
  columns,
  scoreGroup,
  onDone,
  onScored,
}: ResultScoreFormProps) {
  const fields = [...columns.scores, ...columns.flags];
  const selfValue = (key: string) =>
    String(item.task.fieldValues?.[key] ?? "").trim();
  /** Số cán bộ tự khai - mốc hoàn nguyên khi chỉ huy bỏ đánh "Không đạt". */
  const selfValues = Object.fromEntries(
    fields.map((column) => [column.key, selfValue(column.key)]),
  );

  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      fields.map((column) => [
        column.key,
        String(item.reviewValues?.[column.key] ?? selfValue(column.key)),
      ]),
    ),
  );
  const [note, setNote] = useState(item.reviewNote || NOTE_PRESETS[0]!);
  const [saving, setSaving] = useState(false);

  const failed = columns.flags.some((column) => values[column.key] === "1");

  const submit = async () => {
    setSaving(true);
    try {
      await scorePersonalKpi(item.id, { values, note });
      await onScored();
      toast.success("Đã chấm điểm và chốt hoàn thành.");
      onDone();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không chấm điểm được."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="max-h-[68vh] space-y-4 overflow-y-auto px-1">
        <div className={cn("rounded-lg border p-3 text-sm", kpiTone.info.soft)}>
          <p className="font-medium text-foreground">{item.workContentName}</p>
          <p className="text-xs text-muted-foreground">
            {item.ownerName ? `${item.ownerName} · ` : ""}
            {item.axisName} · trục chấm theo mục, không tính theo phần trăm
          </p>
        </div>

        <div className="space-y-2">
          <Label>Điểm chỉ huy chốt</Label>
          <div className="rounded-lg border p-3">
            <ResultFields
              columns={columns}
              values={values}
              initialValues={selfValues}
              scoreGroup={scoreGroup}
              disabled={saving}
              onChange={setValues}
            />
          </div>
          {/* Nói rõ chỉ huy đang hạ hay giữ nguyên số cán bộ khai. */}
          <div className="space-y-0.5">
            {columns.scores.map((column) => {
              const self = numberOf(item.task.fieldValues?.[column.key]);
              const scored = numberOf(values[column.key]);
              const gap =
                self === null || scored === null || self === scored
                  ? null
                  : scored - self;
              return (
                <p key={column.key} className="text-xs text-muted-foreground">
                  {column.title} · cán bộ khai:{" "}
                  {self === null ? "-" : formatScoreNumber(self)}
                  <DeltaTag gap={gap} suffix="" />
                </p>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            {failed
              ? "Đã chọn Không đạt - mục này tính 0 điểm."
              : "Điểm chốt ở đây thay số cán bộ tự khai khi cộng điểm trục."}
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="result-review-note">Nhận xét của chỉ huy</Label>
          <Textarea
            id="result-review-note"
            className="min-h-[88px]"
            placeholder="Nhận xét, lưu ý cho cán bộ..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={saving}
          />
          <div className="flex flex-wrap gap-1.5">
            {NOTE_PRESETS.map((preset) => (
              <Button
                key={preset}
                type="button"
                size="sm"
                variant="outline"
                className="h-auto whitespace-normal bg-background px-2 py-1 text-left text-xs font-normal"
                onClick={() => setNote(preset)}
                disabled={saving}
              >
                {preset}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          className="bg-background"
          onClick={onDone}
          disabled={saving}
        >
          Hủy
        </Button>
        <Button type="button" onClick={() => void submit()} disabled={saving}>
          <CheckCheck className="h-4 w-4" />
          {saving ? "Đang lưu..." : "Chấm điểm & xác nhận hoàn thành"}
        </Button>
      </DialogFooter>
    </>
  );
}
