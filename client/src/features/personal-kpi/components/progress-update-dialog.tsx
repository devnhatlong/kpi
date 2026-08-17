"use client";

import { useState } from "react";
import { TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ResolvedTemplate } from "@/features/kpi-form-config/form-template-utils";
import type { FormTemplateColumn } from "@/features/kpi-form-config/types";
import { useQualityLevelMap } from "@/features/kpi-form-config/use-quality-levels";
import { updatePersonalKpiProgress } from "@/features/personal-kpi/api";
import { CatalogSelectCell } from "@/features/personal-kpi/components/catalog-select-cell";
import {
  readColumnPercent,
  trackingColumns,
  type TrackingColumns,
} from "@/features/personal-kpi/task-summary";
import type { PersonalKpiItem } from "@/features/personal-kpi/types";
import { getApiErrorMessage } from "@/lib/api-client";
import { cn } from "@/lib/utils";

const QUICK_PERCENTS = [0, 25, 50, 75, 100];

function clampPercentText(raw: string): string {
  if (!raw.trim()) return "";
  const value = Number(raw);
  if (!Number.isFinite(value)) return "";
  return String(Math.min(100, Math.max(0, value)));
}

type PercentFieldProps = {
  column: FormTemplateColumn;
  /** Giá trị hiện tại: id mức chất lượng, hoặc con số đã gõ. */
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
};

/**
 * Một ô phần trăm, dựng theo đúng loại cột trong mẫu: cột "Chất lượng thực
 * hiện" là dropdown chọn mức, cột số là ô gõ 0-100.
 */
function PercentField({ column, value, disabled, onChange }: PercentFieldProps) {
  if (column.semanticKey === "quality_level") {
    return (
      <CatalogSelectCell
        catalog="quality_level"
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        triggerClassName="h-9 text-sm"
      />
    );
  }

  return (
    <Input
      type="number"
      min={0}
      max={100}
      className="w-24"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
    />
  );
}

type ProgressFormProps = {
  item: PersonalKpiItem;
  columns: TrackingColumns;
  onDone: () => void;
  onSaved: () => void | Promise<void>;
};

/**
 * Phần thân hộp thoại. Tách riêng để mỗi nhiệm vụ mở lên là một lần mount mới
 * (`key` = id), state khởi tạo thẳng từ nhiệm vụ đó - khỏi phải đồng bộ lại
 * bằng effect và khỏi rủi ro còn dính số của nhiệm vụ mở trước.
 */
function ProgressForm({ item, columns, onDone, onSaved }: ProgressFormProps) {
  const fieldValues = item.task.fieldValues ?? {};
  const catalogValues = item.task.catalogValues ?? {};
  const qualityLevelById = useQualityLevelMap();

  /** Ô chọn mức giữ id trong catalogValues, ô số giữ chuỗi trong fieldValues. */
  const readColumn = (column?: FormTemplateColumn) => {
    if (!column) return "";
    return column.semanticKey === "quality_level"
      ? (catalogValues[column.key] ?? "")
      : (fieldValues[column.key] ?? "");
  };

  const [progress, setProgress] = useState(readColumn(columns.progressColumn));
  const [quality, setQuality] = useState(readColumn(columns.qualityColumn));
  const [note, setNote] = useState(
    columns.noteColumn ? (fieldValues[columns.noteColumn.key] ?? "") : "",
  );
  const [saving, setSaving] = useState(false);

  const percentPreview = columns.progressColumn
    ? (readColumnPercent(
        {
          ...item.task,
          fieldValues: {
            ...fieldValues,
            [columns.progressColumn.key]: progress,
          },
          catalogValues: {
            ...catalogValues,
            [columns.progressColumn.key]: progress,
          },
        },
        columns.progressColumn,
        qualityLevelById,
      ) ?? 0)
    : 0;

  /** Ô chọn mức gửi lên id; ô số gửi lên con số đã kẹp về 0-100. */
  const outgoing = (column: FormTemplateColumn | undefined, value: string) => {
    if (!column) return undefined;
    return column.semanticKey === "quality_level"
      ? value
      : clampPercentText(value);
  };

  const save = async () => {
    if (!columns.progressColumn) return;

    setSaving(true);
    try {
      await updatePersonalKpiProgress(item.id, {
        progress: outgoing(columns.progressColumn, progress),
        quality: outgoing(columns.qualityColumn, quality),
        note: columns.noteColumn ? note : undefined,
      });
      await onSaved();
      toast.success("Đã cập nhật tiến độ.");
      onDone();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không cập nhật được tiến độ."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {!columns.progressColumn ? (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-500" />
          <p className="text-muted-foreground">
            Mẫu KPI của trục này chưa có cột tiến độ (ô phần trăm thuộc nhóm
            &quot;KPI tiến độ&quot;) nên chưa cập nhật tiến độ được. Sửa mẫu tại
            Cấu hình form KPI › Mẫu bảng KPI, hoặc dùng &quot;Sửa chi tiết&quot;
            để nhập tay.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="progress-percent">
              {columns.progressColumn.title}
            </Label>
            <div className="flex items-center gap-2">
              <div className="w-40 shrink-0">
                <PercentField
                  column={columns.progressColumn}
                  value={progress}
                  disabled={saving}
                  onChange={setProgress}
                />
              </div>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    percentPreview >= 100 ? "bg-emerald-500" : "bg-primary",
                  )}
                  style={{ width: `${percentPreview}%` }}
                />
              </div>
            </div>
            {/* Ô số mới cần nút bấm nhanh; ô chọn mức đã có sẵn danh sách. */}
            {columns.progressColumn.semanticKey === "quality_level" ? null : (
              <div className="flex flex-wrap gap-1.5">
                {QUICK_PERCENTS.map((value) => (
                  <Button
                    key={value}
                    type="button"
                    size="sm"
                    variant="outline"
                    className="bg-background"
                    onClick={() => setProgress(String(value))}
                    disabled={saving}
                  >
                    {value}%
                  </Button>
                ))}
              </div>
            )}
          </div>

          {/* Chất lượng không nói lên tiến độ - để cạnh cho tiện nhập chứ không
              dính dáng tới trạng thái công việc. */}
          {columns.qualityColumn ? (
            <div className="space-y-2">
              <Label>{columns.qualityColumn.title}</Label>
              <div className="w-40">
                <PercentField
                  column={columns.qualityColumn}
                  value={quality}
                  disabled={saving}
                  onChange={setQuality}
                />
              </div>
            </div>
          ) : null}

          {columns.noteColumn ? (
            <div className="space-y-2">
              <Label htmlFor="progress-note">{columns.noteColumn.title}</Label>
              <Textarea
                id="progress-note"
                className="min-h-[72px]"
                placeholder="Hôm nay làm được gì, vướng ở đâu..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
                disabled={saving}
              />
            </div>
          ) : null}
        </div>
      )}

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
        <Button
          type="button"
          onClick={() => void save()}
          disabled={saving || !columns.progressColumn}
        >
          {saving ? "Đang lưu..." : "Lưu tiến độ"}
        </Button>
      </DialogFooter>
    </>
  );
}

type ProgressUpdateDialogProps = {
  /** Nhiệm vụ đang cập nhật; null = hộp thoại đóng. */
  item: PersonalKpiItem | null;
  /** Mẫu bảng của trục chứa nhiệm vụ - quyết định ô nào sửa được ở đây. */
  template: ResolvedTemplate | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void | Promise<void>;
};

/**
 * Cập nhật tiến độ hằng ngày cho một nhiệm vụ.
 *
 * Chỉ động vào các ô theo dõi (tiến độ, chất lượng, ghi chú), mọi ô còn lại giữ
 * nguyên - mở ra là gõ ngay được con số hôm nay, khỏi lội lại cả bảng nhập.
 */
export function ProgressUpdateDialog({
  item,
  template,
  onOpenChange,
  onSaved,
}: ProgressUpdateDialogProps) {
  return (
    <Dialog open={!!item} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Cập nhật tiến độ</DialogTitle>
          <DialogDescription className="line-clamp-2">
            {item?.workContentName}
          </DialogDescription>
        </DialogHeader>

        {item ? (
          <ProgressForm
            key={item.id}
            item={item}
            columns={trackingColumns(template, item.task)}
            onDone={() => onOpenChange(false)}
            onSaved={onSaved}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
