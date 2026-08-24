"use client";

import { ClipboardList, Layers, Pencil, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  sameTarget,
  type DesignerTarget,
} from "@/features/kpi-form-config/components/report-builder/form-draft";
import {
  entityId,
  footerMode,
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

type LibraryRailProps = {
  axes: Axis[];
  templateByAxis: Map<string, FormTemplate>;
  criteriaTemplate: FormTemplate | null;
  criteriaCount: number;
  criteriaMaxScore: number;
  target: DesignerTarget | null;
  /** Trục đang được ghép vào mẫu - chấm tròn ở lề trái của dòng. */
  pickedAxisIds: string[];
  onSelect: (target: DesignerTarget) => void;
  onCreateAxis: () => void;
  onEditAxis: (axis: Axis) => void;
};

/**
 * Thư viện các thành phần dùng lại được: bảng tiêu chí chung và từng trục.
 *
 * Chọn một dòng ở đây là mở form của nó ở phần thiết kế bên dưới - khác với ô
 * tích bên phải, vốn quyết định khối đó có nằm trong mẫu báo cáo năm nay không.
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
    <aside className="space-y-4 rounded-xl border bg-card p-4">
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

      <div className="space-y-1">
        <p className="flex items-center gap-1.5 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <ClipboardList className="size-3.5" />
          Phần chung
        </p>
        <button
          type="button"
          onClick={() => onSelect({ kind: "criteria" })}
          className={cn(
            "flex w-full items-start gap-2 rounded-lg border-l-2 px-3 py-2.5 text-left transition-colors",
            sameTarget(target, { kind: "criteria" })
              ? "border-l-primary bg-primary/5"
              : "border-l-transparent hover:bg-accent/50",
          )}
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">
              A. Tiêu chí chung
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {criteriaCount} tiêu chí · {scoringLabel(criteriaTemplate)}
            </span>
          </span>
          <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-xs font-semibold tabular-nums">
            {criteriaMaxScore}
          </span>
        </button>
      </div>

      <div className="space-y-1">
        <p className="flex items-center gap-1.5 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <Layers className="size-3.5" />
          Thư viện trục
        </p>

        {axes.length === 0 ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">
            Chưa có trục nào. Tạo trục đầu tiên để bắt đầu.
          </p>
        ) : (
          axes.map((axis, index) => {
            const id = entityId(axis);
            const template = templateByAxis.get(id) ?? null;
            const fieldCount = template?.columns?.length ?? 0;
            const active = sameTarget(target, { kind: "axis", axisId: id });
            return (
              <div
                key={id}
                className={cn(
                  "group flex items-center gap-1 rounded-lg border-l-2 pr-1 transition-colors",
                  active
                    ? "border-l-primary bg-primary/5"
                    : "border-l-transparent hover:bg-accent/50",
                )}
              >
                <button
                  type="button"
                  onClick={() => onSelect({ kind: "axis", axisId: id })}
                  className="flex min-w-0 flex-1 items-start gap-2 px-3 py-2.5 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      {picked.has(id) ? (
                        <span
                          className="size-1.5 shrink-0 rounded-full bg-primary"
                          title="Đang nằm trong mẫu báo cáo"
                        />
                      ) : null}
                      <span className="truncate text-sm font-medium">
                        Trục {index + 1} · {axis.name}
                      </span>
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
          })
        )}
      </div>
    </aside>
  );
}
