"use client";

import { ChevronRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { DesignerTarget } from "@/features/kpi-form-config/components/report-builder/form-draft";
import {
  entityId,
  REPORT_SECTION_A_TITLE,
  REPORT_SECTION_B_TITLE,
  REPORT_TEMPLATE_STATUS_LABEL,
  type Axis,
  type FormTemplate,
  type ReportTemplateStatus,
} from "@/features/kpi-form-config/types";
import { cn } from "@/lib/utils";

type Stat = { label: string; value: string };

type TemplateComposerProps = {
  name: string;
  onNameChange: (name: string) => void;
  year: number;
  status: ReportTemplateStatus;
  /** Còn thay đổi chưa lưu - nhãn trạng thái phải nói rõ, không im lặng. */
  dirty: boolean;
  axes: Axis[];
  templateByAxis: Map<string, FormTemplate>;
  criteriaTemplate: FormTemplate | null;
  criteriaCount: number;
  criteriaMaxScore: number;
  includeCriteria: boolean;
  onToggleCriteria: (checked: boolean) => void;
  pickedAxisIds: string[];
  onToggleAxis: (axisId: string, checked: boolean) => void;
  target: DesignerTarget | null;
  onConfigure: (target: DesignerTarget) => void;
};

/**
 * Bản mẫu báo cáo đang cấu hình: tên mẫu và các khối nội dung được ghép vào.
 *
 * Ô tích ở đây quyết định khối có nằm trong báo cáo năm nay hay không; còn form
 * của từng khối dựng ở phần thiết kế bên dưới. Tách hai việc ra vì bộ cột của
 * một trục dùng lại được cho nhiều năm.
 */
export function TemplateComposer({
  name,
  onNameChange,
  year,
  status,
  dirty,
  axes,
  templateByAxis,
  criteriaTemplate,
  criteriaCount,
  criteriaMaxScore,
  includeCriteria,
  onToggleCriteria,
  pickedAxisIds,
  onToggleAxis,
  target,
  onConfigure,
}: TemplateComposerProps) {
  const picked = new Set(pickedAxisIds);
  const pickedAxes = axes.filter((axis) => picked.has(entityId(axis)));
  const axisScore = pickedAxes.reduce(
    (sum, axis) => sum + (axis.maxScore ?? 0),
    0,
  );
  const totalScore = axisScore + (includeCriteria ? criteriaMaxScore : 0);
  const blockCount = pickedAxes.length + (includeCriteria ? 1 : 0);

  const stats: Stat[] = [
    {
      label: "Tiêu chí chung",
      value: includeCriteria ? `${criteriaMaxScore} điểm` : "Không dùng",
    },
    { label: "Trục đã chọn", value: `${pickedAxes.length} trục` },
    { label: "Tổng điểm tối đa", value: `${totalScore} điểm` },
  ];

  const criteriaActive = target?.kind === "criteria";

  return (
    <section className="space-y-5 rounded-xl border-2 border-primary/30 bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="font-display text-base font-semibold">
            Bản mẫu đang cấu hình
          </h2>
          <p className="text-xs text-muted-foreground">
            Chọn các khối áp dụng cho mẫu hiện hành; mỗi khối giữ nguyên form và
            cách tính điểm riêng.
          </p>
        </div>
        <dl className="flex flex-wrap gap-x-6 gap-y-2">
          {stats.map((stat) => (
            <div key={stat.label} className="min-w-24">
              <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {stat.label}
              </dt>
              <dd className="font-display text-base font-semibold text-primary">
                {stat.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div className="space-y-1.5">
          <Label htmlFor="rt-name">Tên mẫu báo cáo</Label>
          <Input
            id="rt-name"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder={`Mẫu báo cáo KPI năm ${year}`}
          />
        </div>
        <div className="space-y-1.5 sm:text-right">
          <p className="text-xs text-muted-foreground">Trạng thái mẫu</p>
          <p
            className={cn(
              "font-display text-sm font-semibold",
              dirty || status === "draft"
                ? "text-primary"
                : "text-emerald-600 dark:text-emerald-400",
            )}
          >
            {dirty
              ? "Có thay đổi chưa lưu"
              : REPORT_TEMPLATE_STATUS_LABEL[status]}
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="space-y-0.5">
            <h3 className="text-sm font-semibold">Thành phần của mẫu</h3>
            <p className="text-xs text-muted-foreground">
              Chọn khối để thêm hoặc loại khỏi bản báo cáo.
            </p>
          </div>
          <span className="text-xs text-muted-foreground">
            {blockCount} bảng trong báo cáo
          </span>
        </div>

        {/* PHẦN A - một bảng duy nhất, nên tiêu đề phần cũng chính là khối. */}
        <section className="overflow-hidden rounded-xl border">
          <div
            className={cn(
              "flex flex-wrap items-center gap-3 border-l-4 px-3 py-3 transition-colors",
              includeCriteria
                ? "border-l-emerald-500 bg-emerald-500/5"
                : "border-l-transparent bg-muted/40",
              criteriaActive && "ring-1 ring-inset ring-primary/40",
            )}
          >
            <Checkbox
              id="block-criteria"
              checked={includeCriteria}
              onCheckedChange={(checked) => onToggleCriteria(checked === true)}
              aria-label="Đưa bảng tiêu chí chung vào mẫu"
            />
            <span className="grid size-7 shrink-0 place-items-center rounded-md bg-emerald-500/15 text-xs font-bold text-emerald-700 dark:text-emerald-400">
              A
            </span>
            <div className="min-w-40 flex-1">
              <Label htmlFor="block-criteria" className="text-sm font-semibold">
                {REPORT_SECTION_A_TITLE}
              </Label>
              <p className="text-xs text-muted-foreground">
                {criteriaCount} tiêu chí ·{" "}
                {criteriaTemplate
                  ? `${criteriaTemplate.columns?.length ?? 0} trường`
                  : "chưa dựng form"}{" "}
                · tối đa {criteriaMaxScore} điểm
              </p>
            </div>
            <button
              type="button"
              onClick={() => onConfigure({ kind: "criteria" })}
              className="inline-flex shrink-0 items-center gap-0.5 text-sm font-medium text-primary hover:underline"
            >
              Cấu hình
              <ChevronRight className="size-4" />
            </button>
          </div>
        </section>

        {/* PHẦN B - bọc các trục. Trục là mục con 1., 2., 3.… trong phần này,
            không phải khối ngang hàng với A. */}
        <section className="overflow-hidden rounded-xl border">
          <header className="flex flex-wrap items-center gap-3 border-b bg-muted/40 px-3 py-2.5">
            <span className="grid size-7 shrink-0 place-items-center rounded-md bg-primary/15 text-xs font-bold text-primary">
              B
            </span>
            <div className="min-w-40 flex-1">
              <p className="text-sm font-semibold">{REPORT_SECTION_B_TITLE}</p>
              <p className="text-xs text-muted-foreground">
                {pickedAxes.length} trục đang dùng · tối đa {axisScore} điểm
              </p>
            </div>
          </header>

          <div className="space-y-2 p-2">
            {axes.length === 0 ? (
              <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
                Chưa có trục nào để ghép vào mẫu.
              </p>
            ) : (
              axes.map((axis) => {
                const id = entityId(axis);
                const checked = picked.has(id);
                const template = templateByAxis.get(id) ?? null;
                const active = target?.kind === "axis" && target.axisId === id;
                /*
                  Số thứ tự đếm trong PHẦN B và chỉ đếm trục đang chọn - bỏ tick
                  trục 2 thì trục 3 phải lên số 2, đúng như bảng in ra. Trục
                  không chọn thì không mang số nào cả.
                */
                const order = checked
                  ? pickedAxisIds.indexOf(id) + 1
                  : null;
                return (
                  <div
                    key={id}
                    className={cn(
                      "flex flex-wrap items-center gap-3 rounded-lg border-l-4 px-3 py-3 transition-colors",
                      checked
                        ? "border-l-primary bg-primary/5"
                        : "border-l-transparent bg-muted/40",
                      active && "ring-1 ring-inset ring-primary/40",
                    )}
                  >
                    <Checkbox
                      id={`block-${id}`}
                      checked={checked}
                      onCheckedChange={(value) =>
                        onToggleAxis(id, value === true)
                      }
                      aria-label={`Đưa trục ${axis.name} vào mẫu`}
                    />
                    <span
                      className={cn(
                        "w-6 shrink-0 text-center text-sm font-semibold tabular-nums",
                        checked ? "text-primary" : "text-muted-foreground/50",
                      )}
                    >
                      {order ?? "–"}
                    </span>
                    <div className="min-w-40 flex-1">
                      <Label
                        htmlFor={`block-${id}`}
                        className="text-sm font-semibold"
                      >
                        {axis.name}
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        {axis.description?.trim() || axis.code} ·{" "}
                        {template
                          ? `${template.columns?.length ?? 0} trường`
                          : "chưa dựng form"}
                      </p>
                    </div>
                    <Badge variant="outline" className="shrink-0 font-normal">
                      Tối đa {axis.maxScore} điểm
                    </Badge>
                    <button
                      type="button"
                      onClick={() => onConfigure({ kind: "axis", axisId: id })}
                      className="inline-flex shrink-0 items-center gap-0.5 text-sm font-medium text-primary hover:underline"
                    >
                      Thiết lập
                      <ChevronRight className="size-4" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>
    </section>
  );
}
