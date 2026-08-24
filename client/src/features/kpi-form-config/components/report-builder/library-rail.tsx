"use client";

import { Pencil, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  sameTarget,
  type DesignerTarget,
} from "@/features/kpi-form-config/components/report-builder/form-draft";
import {
  entityId,
  footerMode,
  REPORT_SECTION_A_TITLE,
  REPORT_SECTION_B_TITLE,
  type Axis,
  type FormTemplate,
} from "@/features/kpi-form-config/types";
import { cn } from "@/lib/utils";

/** Cách quy ra điểm của một khối, viết gọn đủ đọc trong một dòng thư viện. */
export function scoringLabel(template: FormTemplate | null): string {
  if (!template) return "Chưa dựng form";
  if (!template.footer?.enabled) return "Không tính điểm tự động";
  return footerMode(template.footer) === "sum"
    ? "Cộng dồn điểm các mục"
    : "Tính theo tỉ lệ hoàn thành";
}

/** Chữ cái phần, dùng chung kiểu với panel ghép khối ở giữa. */
function SectionChip({
  letter,
  tone,
}: {
  letter: "A" | "B";
  tone: "emerald" | "primary";
}) {
  return (
    <span
      className={cn(
        "grid size-6 shrink-0 place-items-center rounded-md text-[11px] font-bold",
        tone === "emerald"
          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
          : "bg-primary/15 text-primary",
      )}
    >
      {letter}
    </span>
  );
}

type LibraryRailProps = {
  axes: Axis[];
  templateByAxis: Map<string, FormTemplate>;
  criteriaTemplate: FormTemplate | null;
  criteriaCount: number;
  criteriaMaxScore: number;
  target: DesignerTarget | null;
  /** Trục đang ghép vào mẫu, THEO THỨ TỰ khối - số thứ tự lấy từ đây. */
  pickedAxisIds: string[];
  onSelect: (target: DesignerTarget) => void;
  onCreateAxis: () => void;
  onEditAxis: (axis: Axis) => void;
};

/**
 * Thư viện các thành phần dùng lại được, xếp theo đúng hai phần của bản in:
 * phần A là bảng tiêu chí chung, phần B bọc các trục.
 *
 * Danh sách ở đây là MỌI trục đang hoạt động, kể cả trục chưa ghép vào mẫu này -
 * trục dùng lại được cho nhiều mẫu và nhiều năm. Trục đã ghép mang số thứ tự
 * đúng như trên bản in, trục chưa ghép để dấu gạch: chọn một dòng ở đây là mở
 * form của nó, khác với ô tích bên phải vốn quyết định nó có nằm trong mẫu không.
 */
export function LibraryRail({
  axes,
  templateByAxis,
  criteriaTemplate,
  criteriaCount,
  criteriaMaxScore,
  target,
  pickedAxisIds,
  onSelect,
  onCreateAxis,
  onEditAxis,
}: LibraryRailProps) {
  const picked = new Set(pickedAxisIds);

  return (
    <aside className="min-w-0 space-y-4 rounded-xl border bg-card p-4">
      <div className="space-y-1">
        <h2 className="font-display text-base font-semibold">
          Thư viện biểu mẫu
        </h2>
        <p className="text-xs text-muted-foreground">
          Quản lý các thành phần có thể tái sử dụng.
        </p>
      </div>

      <Button
        type="button"
        variant="outline"
        className="w-full border-dashed"
        onClick={onCreateAxis}
      >
        <Plus className="size-4" />
        Tạo trục mới
      </Button>

      {/* PHẦN A - chỉ có một bảng, nên tiêu đề phần cũng chính là dòng chọn được. */}
      <button
        type="button"
        onClick={() => onSelect({ kind: "criteria" })}
        className={cn(
          "flex w-full items-start gap-2 rounded-lg border-l-2 px-2 py-2.5 text-left transition-colors",
          sameTarget(target, { kind: "criteria" })
            ? "border-l-emerald-500 bg-emerald-500/5"
            : "border-l-transparent hover:bg-accent/50",
        )}
      >
        <SectionChip letter="A" tone="emerald" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">
            {REPORT_SECTION_A_TITLE}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {criteriaCount} tiêu chí · {scoringLabel(criteriaTemplate)}
          </span>
        </span>
        <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-xs font-semibold tabular-nums">
          {criteriaMaxScore}
        </span>
      </button>

      {/* PHẦN B - tiêu đề phần, không chọn được; các trục là mục con bên trong. */}
      <div className="space-y-1">
        <div className="flex items-start gap-2 px-2 py-1">
          <SectionChip letter="B" tone="primary" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">
              {REPORT_SECTION_B_TITLE}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {picked.size}/{axes.length} trục đang dùng trong mẫu
            </span>
          </span>
        </div>

        {axes.length === 0 ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">
            Chưa có trục nào. Tạo trục đầu tiên để bắt đầu.
          </p>
        ) : (
          <div className="space-y-0.5 border-l pl-2">
            {axes.map((axis) => {
              const id = entityId(axis);
              const template = templateByAxis.get(id) ?? null;
              const fieldCount = template?.columns?.length ?? 0;
              const active = sameTarget(target, { kind: "axis", axisId: id });
              // Số thứ tự đếm trong phần B và chỉ đếm trục đã ghép - khớp đúng
              // panel ở giữa và bản in.
              const order = picked.has(id) ? pickedAxisIds.indexOf(id) + 1 : null;
              return (
                <div
                  key={id}
                  className={cn(
                    "group flex min-w-0 items-center gap-1 rounded-lg border-l-2 pr-1 transition-colors",
                    active
                      ? "border-l-primary bg-primary/5"
                      : "border-l-transparent hover:bg-accent/50",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onSelect({ kind: "axis", axisId: id })}
                    className="flex min-w-0 flex-1 items-start gap-2 px-2 py-2 text-left"
                  >
                    <span
                      className={cn(
                        "w-4 shrink-0 text-center text-xs font-semibold tabular-nums",
                        order ? "text-primary" : "text-muted-foreground/40",
                      )}
                      title={
                        order
                          ? `Mục ${order} của phần B`
                          : "Chưa ghép vào mẫu này"
                      }
                    >
                      {order ?? "–"}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {axis.name}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {fieldCount} trường · {scoringLabel(template)}
                      </span>
                    </span>
                  </button>
                  <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-xs font-semibold tabular-nums">
                    {axis.maxScore}
                  </span>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-7 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                    onClick={() => onEditAxis(axis)}
                    aria-label={`Sửa trục ${axis.name}`}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}
