"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EntryPreviewTable } from "@/features/mission-form-config/components/report-builder/entry-preview-table";
import {
  entityId,
  REPORT_SECTION_A_TITLE,
  REPORT_SECTION_B_TITLE,
  type Axis,
  type FormTemplate,
} from "@/features/mission-form-config/types";

type PreviewBlock = {
  /** Tiêu đề mục con trong phần; null = phần chỉ có đúng một bảng. */
  label: string | null;
  hint: string;
  template: FormTemplate | null;
};

type PreviewSection = {
  letter: "A" | "B";
  title: string;
  blocks: PreviewBlock[];
};

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
 * Toàn bộ biểu mẫu sau khi ghép, theo đúng bố cục bản in:
 *   A. DANH MỤC ĐIỂM TIÊU CHÍ CHUNG - một bảng
 *   B. DANH MỤC NHIỆM VỤ CÔNG TÁC   - các trục đánh số 1., 2., 3.… bên trong
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
  const sections: PreviewSection[] = [];

  if (includeCriteria) {
    sections.push({
      letter: "A",
      title: REPORT_SECTION_A_TITLE,
      blocks: [
        {
          label: null,
          hint: `Tổng điểm ${criteriaMaxScore}`,
          template: criteriaTemplate,
        },
      ],
    });
  }

  if (pickedAxes.length) {
    sections.push({
      letter: "B",
      title: REPORT_SECTION_B_TITLE,
      blocks: pickedAxes.map((axis, index) => ({
        label: `${index + 1}. ${axis.name}`,
        hint: `tối đa ${axis.maxScore} điểm`,
        template: templateByAxis.get(entityId(axis)) ?? null,
      })),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>
            {name.trim() || `Mẫu báo cáo nhiệm vụ năm ${year}`}
          </DialogTitle>
          <DialogDescription>
            Xem trước theo bộ cột đã lưu của từng khối. Khối đang sửa dở mà chưa
            lưu sẽ hiện bản cũ.
          </DialogDescription>
        </DialogHeader>

        <div className="min-w-0 space-y-8 py-1">
          {sections.length === 0 ? (
            <p className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
              Mẫu chưa có khối nội dung nào.
            </p>
          ) : (
            sections.map((section) => (
              <section key={section.letter} className="min-w-0 space-y-4">
                <h3 className="border-b pb-1.5 font-display text-sm font-bold uppercase tracking-wide">
                  {section.letter}. {section.title}
                </h3>

                {section.blocks.map((block, index) => (
                  <div
                    key={block.label ?? `${section.letter}-${index}`}
                    className="min-w-0 space-y-2"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      {block.label ? (
                        <h4 className="text-sm font-semibold">{block.label}</h4>
                      ) : (
                        <span />
                      )}
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
                  </div>
                ))}
              </section>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
