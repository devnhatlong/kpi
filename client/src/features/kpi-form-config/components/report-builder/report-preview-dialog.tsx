"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EntryPreviewTable } from "@/features/kpi-form-config/components/report-builder/entry-preview-table";
import {
  entityId,
  type Axis,
  type FormTemplate,
} from "@/features/kpi-form-config/types";

type ReportPreviewDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  year: number;
  includeCriteria: boolean;
  criteriaTemplate: FormTemplate | null;
  criteriaMaxScore: number;
  pickedAxes: Axis[];
  templateByAxis: Map<string, FormTemplate>;
};

/**
 * Toàn bộ biểu mẫu sau khi ghép - đúng thứ tự khối sẽ in ra báo cáo.
 *
 * Dựng từ bộ cột ĐÃ LƯU của từng khối, nên khối đang sửa dở mà chưa lưu sẽ hiện
 * bản cũ; nói rõ điều đó thay vì để người xem tưởng thay đổi bị mất.
 */
export function ReportPreviewDialog({
  open,
  onOpenChange,
  name,
  year,
  includeCriteria,
  criteriaTemplate,
  criteriaMaxScore,
  pickedAxes,
  templateByAxis,
}: ReportPreviewDialogProps) {
  const blocks: Array<{
    label: string;
    hint: string;
    template: FormTemplate | null;
  }> = [];

  if (includeCriteria) {
    blocks.push({
      label: "A. Danh mục điểm tiêu chí chung",
      hint: `Tối đa ${criteriaMaxScore} điểm`,
      template: criteriaTemplate,
    });
  }
  pickedAxes.forEach((axis, index) => {
    blocks.push({
      label: `B.${index + 1}. ${axis.name}`,
      hint: `Tối đa ${axis.maxScore} điểm`,
      template: templateByAxis.get(entityId(axis)) ?? null,
    });
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>{name.trim() || `Mẫu báo cáo KPI năm ${year}`}</DialogTitle>
          <DialogDescription>
            Xem trước theo bộ cột đã lưu của từng khối. Khối đang sửa dở mà chưa
            lưu sẽ hiện bản cũ.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-1">
          {blocks.length === 0 ? (
            <p className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
              Mẫu chưa có khối nội dung nào.
            </p>
          ) : (
            blocks.map((block) => (
              <section key={block.label} className="space-y-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-display text-sm font-semibold">
                    {block.label}
                  </h3>
                  <span className="text-xs text-muted-foreground">
                    {block.hint}
                  </span>
                </div>
                {block.template ? (
                  <EntryPreviewTable
                    columns={block.template.columns ?? []}
                    headerGroups={block.template.headerGroups ?? []}
                  />
                ) : (
                  <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                    Khối này chưa dựng form - bảng sẽ trống khi in báo cáo.
                  </p>
                )}
              </section>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
