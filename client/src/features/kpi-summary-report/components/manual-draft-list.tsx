"use client";

import { useMemo, useState } from "react";
import { Layers, Pencil, Plus, SquarePen, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { entityId } from "@/features/kpi-form-config/types";
import { useScopedAxes } from "@/features/kpi-form-config/use-scoped-axes";
import type { SummaryManualItemInput } from "@/features/kpi-summary-report/api";
import { ManualEntryForm } from "@/features/kpi-summary-report/components/manual-entry-form";
import { formatScoreNumber } from "@/features/personal-kpi/board-cell";
import { kpiTone } from "@/features/personal-kpi/status-styles";
import { cn } from "@/lib/utils";

/** Dòng tự nhập còn là bản nháp - chưa có bản ghi nào ở server để trỏ tới. */
export type SummaryManualDraft = SummaryManualItemInput & { key: string };

/** Cởi `key` ra trước khi gửi đi - đó là khoá dựng ở client, server không nhận. */
export function toManualItemInput(
  draft: SummaryManualDraft,
): SummaryManualItemInput {
  return {
    title: draft.title,
    note: draft.note,
    axisId: draft.axisId,
    ownerName: draft.ownerName,
    departmentName: draft.departmentName,
    score: draft.score,
  };
}

const NO_AXIS_KEY = "__none__";
const NEW_DRAFT = "new";

type ManualDraftListProps = {
  drafts: SummaryManualDraft[];
  onChange: (next: SummaryManualDraft[]) => void;
  listClassName?: string;
};

/**
 * Việc chỉ huy tự khai theo trục, giữ ở dạng nháp cho tới khi báo cáo được ghi
 * xuống.
 *
 * Cấp quản lý không phải lúc nào cũng tổng hợp từ việc cấp dưới trình lên: việc
 * của chính đơn vị, việc phối hợp, việc đột xuất không đi qua KPI cá nhân nên
 * không có gì để mà chọn - phải gõ thẳng vào đây.
 *
 * Nháp nằm lại trong bộ nhớ chứ không ghi từng dòng: báo cáo chỉ ra đời ở bước
 * cuối, ghi sớm là bỏ dở giữa chừng để lại một báo cáo rỗng cho người dùng dọn.
 */
export function ManualDraftList({
  drafts,
  onChange,
  listClassName = "max-h-[40vh]",
}: ManualDraftListProps) {
  /** null = đang đóng form; "new" = thêm dòng; còn lại = khoá dòng đang sửa. */
  const [formKey, setFormKey] = useState<string | null>(null);

  const { axes, hasTemplate, templateName, isLoading } = useScopedAxes();

  /** Tên trục để hiện tiêu đề nhóm - nháp chỉ giữ axisId. */
  const axisNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const axis of axes) map.set(entityId(axis), axis.name);
    return map;
  }, [axes]);

  const editing =
    formKey && formKey !== NEW_DRAFT
      ? (drafts.find((draft) => draft.key === formKey) ?? null)
      : null;

  /*
    Gom theo trục, giữ đúng thứ tự trục của mẫu báo cáo - đọc bản nháp phải thấy
    cùng một trật tự khối với báo cáo in ra sau này. Việc chưa gắn trục dồn
    xuống cuối.
  */
  const groups = useMemo(() => {
    const order = [...axes.map(entityId), NO_AXIS_KEY];
    const rank = (key: string) => {
      const index = order.indexOf(key);
      return index < 0 ? order.length : index;
    };

    const byAxis = new Map<string, SummaryManualDraft[]>();
    for (const draft of drafts) {
      const key = draft.axisId || NO_AXIS_KEY;
      const list = byAxis.get(key) ?? [];
      list.push(draft);
      byAxis.set(key, list);
    }

    return [...byAxis.entries()]
      .sort(([a], [b]) => rank(a) - rank(b))
      .map(([key, rows]) => ({
        key,
        label:
          key === NO_AXIS_KEY
            ? "Chưa gắn trục"
            : (axisNameById.get(key) ?? "Trục không còn trong mẫu"),
        rows,
        score: rows.reduce((sum, row) => sum + (row.score ?? 0), 0),
      }));
  }, [drafts, axes, axisNameById]);

  const totalScore = drafts.reduce((sum, row) => sum + (row.score ?? 0), 0);

  const save = (input: SummaryManualItemInput) => {
    if (editing) {
      onChange(
        drafts.map((draft) =>
          draft.key === editing.key ? { ...input, key: draft.key } : draft,
        ),
      );
      setFormKey(null);
      return;
    }
    onChange([...drafts, { ...input, key: crypto.randomUUID() }]);
  };

  const remove = (key: string) => {
    onChange(drafts.filter((draft) => draft.key !== key));
    if (formKey === key) setFormKey(null);
  };

  const noTemplate = !hasTemplate && !isLoading;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Việc của đơn vị bạn tự khai - không cần cấp dưới trình lên.
        </p>
        <Button
          type="button"
          variant="outline"
          className="bg-background"
          disabled={noTemplate || formKey === NEW_DRAFT}
          onClick={() => setFormKey(NEW_DRAFT)}
        >
          <Plus className="size-4" />
          Thêm nhiệm vụ
        </Button>
      </div>

      {noTemplate ? (
        <div
          className={cn("rounded-lg border p-3 text-xs", kpiTone.warning.soft)}
        >
          Đơn vị bạn chưa được gán mẫu báo cáo nên chưa có trục nào để khai. Vào
          mục Mẫu báo cáo gán mẫu cho đơn vị trước.
        </div>
      ) : null}

      {/*
        Form nhập nằm thẳng trong bước, không phải hộp thoại chồng lên trình tạo:
        mỗi dòng khai chỉ tốn một lần bấm, và không phải lồng modal trong modal.
        `key` đổi theo dòng đang mở nên chuyển từ dòng này sang dòng kia là form
        nạp lại sạch.
      */}
      {formKey ? (
        <div className="rounded-lg border bg-muted/30 p-3">
          <ManualEntryForm
            key={formKey}
            item={editing}
            formKey={formKey}
            submitLabel={editing ? "Lưu nhiệm vụ" : "Thêm vào báo cáo"}
            onCancel={() => setFormKey(null)}
            onSubmit={save}
          />
        </div>
      ) : null}

      <div className={cn("overflow-auto rounded-lg border", listClassName)}>
        {drafts.length === 0 ? (
          <div className="py-10 text-center">
            <SquarePen className="mx-auto size-8 text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">
              Chưa khai nhiệm vụ nào
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {templateName
                ? `Trục lấy theo mẫu "${templateName}" của đơn vị bạn.`
                : "Mỗi nhiệm vụ gắn vào một trục của mẫu báo cáo."}
            </p>
          </div>
        ) : (
          <div className="divide-y">
            {groups.map((group) => (
              <div key={group.key}>
                <div className="flex items-center justify-between gap-2 bg-muted/60 px-3 py-2">
                  <p className="flex items-center gap-1.5 text-xs font-medium">
                    <Layers className="size-3.5 text-muted-foreground" />
                    {group.label}
                    <span className="text-muted-foreground">
                      · {group.rows.length}
                    </span>
                  </p>
                  {group.score ? (
                    <span
                      className={cn(
                        "text-xs font-semibold tabular-nums",
                        kpiTone.success.text,
                      )}
                    >
                      {formatScoreNumber(group.score)}
                    </span>
                  ) : null}
                </div>

                {group.rows.map((row) => (
                  <div
                    key={row.key}
                    className="flex items-start gap-2 px-3 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{row.title}</p>
                      {row.note ? (
                        <p className="text-xs text-muted-foreground">
                          {row.note}
                        </p>
                      ) : null}
                      {row.ownerName || row.departmentName ? (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {[row.ownerName, row.departmentName]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      ) : null}
                    </div>
                    <span className="w-16 shrink-0 pt-0.5 text-right text-sm font-medium tabular-nums">
                      {row.score === undefined
                        ? "-"
                        : formatScoreNumber(row.score)}
                    </span>
                    <div className="flex shrink-0 gap-0.5">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-8"
                        aria-label="Sửa nhiệm vụ"
                        onClick={() => setFormKey(row.key)}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-8 text-destructive hover:text-destructive"
                        aria-label="Bỏ nhiệm vụ"
                        onClick={() => remove(row.key)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
        <span className="size-1.5 rounded-full bg-primary" />
        Đã khai <span className="font-semibold">{drafts.length}</span> nhiệm vụ
        <span className="text-muted-foreground">
          Tổng điểm{" "}
          <span className={cn("font-semibold", kpiTone.success.text)}>
            {formatScoreNumber(totalScore)}
          </span>
        </span>
      </div>
    </div>
  );
}
