"use client";

import { useEffect, useRef, type ComponentProps } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  catalogOfSemantic,
  computeAutoValue,
  formatScoreRange,
  isContentTextSemantic,
  isScoreInGroupRange,
  type FormTemplateColumn,
} from "@/features/kpi-form-config/types";
import { useQualityLevelMap } from "@/features/kpi-form-config/use-quality-levels";
import { useScoreGroupMap } from "@/features/kpi-form-config/use-score-groups";
import { formatScoreNumber } from "@/features/personal-kpi/board-cell";
import { AttachmentCell } from "@/features/personal-kpi/components/attachment-cell";
import { CatalogSelectCell } from "@/features/personal-kpi/components/catalog-select-cell";
import {
  cellInputProps,
  isCheckboxColumn,
  readCellValue,
  readCheckboxValue,
  writeCellValue,
  writeCheckboxValue,
} from "@/features/personal-kpi/task-column-utils";
import type { PersonalTaskDraft } from "@/features/personal-kpi/types";
import { cn } from "@/lib/utils";

/**
 * Cột người nhập thật sự phải điền.
 * STT do hệ thống đánh, Nội dung công việc đã nằm ở tiêu đề thẻ - hiện lại
 * thành ô nhập chỉ tổ rối.
 */
export function taskEntryColumns(
  columns: FormTemplateColumn[],
): FormTemplateColumn[] {
  return columns.filter(
    (column) =>
      column.semanticKey !== "stt" && column.semanticKey !== "work_content",
  );
}

/**
 * Bề ngang một ô, suy từ bề ngang cột trong mẫu bảng.
 * Giữ nguyên tương quan rộng / hẹp giữa các cột nhưng kẹp lại để ô hẹp vẫn gõ
 * được và ô rộng không chiếm trọn một dòng.
 */
function fieldBasis(width: number): number {
  return Math.min(Math.max(width, 150), 320);
}

/** Ô cao 32px, đệm sát - một dòng nhiệm vụ có cả chục ô nên đệm rộng là tràn. */
const controlClass = "h-8 min-h-8 px-2 text-sm";

/** Ô chỉ đọc (nhóm điểm, ô tự tính) - viền nét đứt cho khác ô nhập được. */
const readOnlyClass =
  "flex items-center overflow-hidden rounded-md border border-dashed bg-muted/40";

/**
 * Ô chữ tự cao dần theo nội dung, quá 4 dòng thì cuộn trong ô.
 *
 * Cột "Nhiệm vụ", "Ghi chú"... hay dài mà ô một dòng thì gõ tới đâu chữ trôi
 * khỏi tầm nhìn tới đó, không đọc lại được thứ vừa viết.
 */
function AutoGrowTextarea({
  className,
  value,
  ...props
}: ComponentProps<"textarea">) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    // Hạ về auto trước rồi mới đo, không thì xoá chữ ô vẫn giữ chiều cao cũ.
    node.style.height = "auto";
    const borders = node.offsetHeight - node.clientHeight;
    node.style.height = `${node.scrollHeight + borders}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      className={cn(
        // min-h-8 cho bằng chiều cao ô một dòng của các cột khác; max-h-24 là
        // trần ~4 dòng, quá thì cuộn trong ô chứ không đẩy cả hàng dài ra.
        "flex min-h-8 max-h-24 w-full resize-none overflow-y-auto rounded-md border border-input bg-transparent px-2 py-1 text-sm leading-5 shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

type TaskFieldsGridProps = {
  /** Bộ cột của mẫu bảng gán cho trục. */
  columns: FormTemplateColumn[];
  task: PersonalTaskDraft;
  /**
   * Nhóm điểm lấy theo nội dung công việc - quyết định dải điểm hợp lệ của các
   * cột điểm trong dòng này.
   */
  scoreGroupId: string;
  /**
   * Nhiệm vụ / Ghi chú do admin khai sẵn ở danh mục Nội dung công việc.
   * Hai cột này chỉ đọc: bảng trục 2 in sẵn nhiệm vụ và trần điểm của từng mục,
   * cán bộ chỉ điền kết quả.
   */
  contentTask?: string;
  contentNote?: string;
  disabled?: boolean;
  onChange: (patch: Partial<PersonalTaskDraft>) => void;
};

/**
 * Các ô nhập của một nhiệm vụ, dựng đúng theo mẫu KPI của trục.
 * Cùng luật đọc / ghi ô với bảng duyệt (task-column-utils), chỉ khác cách bày:
 * xếp dòng tự xuống hàng thay vì một hàng bảng.
 */
export function TaskFieldsGrid({
  columns,
  task,
  scoreGroupId,
  contentTask = "",
  contentNote = "",
  disabled = false,
  onChange,
}: TaskFieldsGridProps) {
  const fields = taskEntryColumns(columns);

  // Chỉ gọi danh mục khi mẫu thật sự dùng tới.
  const scoreGroupById = useScoreGroupMap(
    fields.some(
      (column) =>
        column.rangeFromColumnKey || column.semanticKey === "score_group",
    ),
  );
  const qualityLevelById = useQualityLevelMap(
    fields.some((column) => column.autoValue),
  );

  const renderControl = (column: FormTemplateColumn) => {
    // Nhiệm vụ / Ghi chú: chữ admin đã khai ở danh mục, chỉ đọc. Không lưu vào
    // nhiệm vụ - sửa danh mục là mọi bảng đã nhập đổi theo.
    if (isContentTextSemantic(column.semanticKey)) {
      const text =
        column.semanticKey === "work_content_task" ? contentTask : contentNote;
      return (
        <div
          className={cn(
            readOnlyClass,
            "max-h-24 items-start overflow-y-auto px-2 py-1 text-sm leading-5",
          )}
          title={text || undefined}
        >
          {text ? (
            <span className="whitespace-pre-wrap">{text}</span>
          ) : (
            <span className="text-xs text-muted-foreground">
              Nội dung chưa khai {column.title.toLowerCase()}
            </span>
          )}
        </div>
      );
    }

    // Nhóm điểm đổ theo nội dung công việc - hiện ra để đối chiếu, không cho
    // chọn. Server tự điền lúc lưu.
    if (column.semanticKey === "score_group") {
      const group = scoreGroupById.get(scoreGroupId);
      return (
        <div
          className={cn(readOnlyClass, controlClass)}
          title={
            group
              ? `Theo nội dung công việc · ${formatScoreRange(group)}`
              : undefined
          }
        >
          {group ? (
            <span className="truncate">{group.name}</span>
          ) : (
            <span className="truncate text-xs text-amber-600 dark:text-amber-500">
              Nội dung chưa gán nhóm điểm
            </span>
          )}
        </div>
      );
    }

    const catalog = catalogOfSemantic(column.semanticKey);
    if (catalog) {
      return (
        <CatalogSelectCell
          catalog={catalog}
          value={readCellValue(task, column.semanticKey, column.key)}
          onValueChange={(next) =>
            onChange(writeCellValue(task, column.semanticKey, column.key, next))
          }
          disabled={disabled}
          triggerClassName="px-2"
        />
      );
    }

    if (column.dataType === "file") {
      return (
        <AttachmentCell
          files={task.attachments?.[column.key] ?? []}
          onChange={(next) =>
            onChange({
              attachments: { ...(task.attachments ?? {}), [column.key]: next },
            })
          }
          readOnly={disabled}
          label={column.title}
        />
      );
    }

    if (isCheckboxColumn(column.dataType)) {
      return (
        <div
          className={cn(
            "flex items-center rounded-md border bg-background",
            controlClass,
          )}
        >
          <Checkbox
            checked={readCheckboxValue(task, column.key)}
            onCheckedChange={(checked) =>
              onChange(writeCheckboxValue(task, column.key, checked === true))
            }
            disabled={disabled}
            aria-label={column.title}
          />
        </div>
      );
    }

    // Ô tự tính: hiện trước cho người nhập thấy, con số lưu lại là do server
    // tính - hai bên dùng chung computeAutoValue nên không lệch.
    if (column.autoValue) {
      const auto = column.autoValue;
      const level = qualityLevelById.get(
        task.catalogValues?.[auto.percentColumnKey] ?? "",
      );
      const rawBase = task.fieldValues?.[auto.baseColumnKey] ?? "";
      const base = rawBase.trim() === "" ? null : Number(rawBase);
      const computed = computeAutoValue(
        auto.kind,
        level ? level.percent : null,
        base !== null && Number.isFinite(base) ? base : null,
      );
      return (
        <div
          className={cn(readOnlyClass, controlClass)}
          title="Hệ thống tự tính"
        >
          {computed === null ? (
            <span className="truncate text-xs text-muted-foreground">
              Chờ chọn chất lượng và nhập điểm
            </span>
          ) : (
            <span className="font-medium">{formatScoreNumber(computed)}</span>
          )}
        </div>
      );
    }

    const inputProps = cellInputProps(column.dataType);
    // Cột điểm bị giới hạn thì ô nhập ăn theo nhóm điểm của nội dung công việc.
    const boundGroup = column.rangeFromColumnKey
      ? scoreGroupById.get(scoreGroupId)
      : undefined;
    const value = readCellValue(task, column.semanticKey, column.key);
    const outOfRange =
      Boolean(boundGroup) &&
      value.trim() !== "" &&
      Number.isFinite(Number(value)) &&
      !isScoreInGroupRange(Number(value), boundGroup!);

    // Cột chữ mới cho nở nhiều dòng; số / ngày / giờ luôn ngắn, để một dòng.
    if (column.dataType === "text") {
      return (
        <AutoGrowTextarea
          value={value}
          onChange={(e) =>
            onChange(
              writeCellValue(
                task,
                column.semanticKey,
                column.key,
                e.target.value,
              ),
            )
          }
          placeholder={column.title}
          disabled={disabled}
          title={column.title}
        />
      );
    }

    return (
      <Input
        className={cn(
          controlClass,
          outOfRange &&
            "border-rose-500 focus-visible:ring-rose-500 dark:border-rose-500",
        )}
        type={inputProps.type}
        min={boundGroup?.minScore}
        max={boundGroup?.maxScore}
        value={value}
        onChange={(e) =>
          onChange(
            writeCellValue(
              task,
              column.semanticKey,
              column.key,
              e.target.value,
            ),
          )
        }
        placeholder={
          column.rangeFromColumnKey
            ? boundGroup
              ? formatScoreRange(boundGroup)
              : "Nội dung chưa gán nhóm điểm"
            : column.title
        }
        disabled={disabled}
        aria-invalid={outOfRange}
        title={
          outOfRange
            ? `Ngoài dải ${formatScoreRange(boundGroup!)} của ${boundGroup!.name}`
            : undefined
        }
      />
    );
  };

  return (
    <div className="flex flex-wrap items-start gap-x-2.5 gap-y-2">
      {fields.map((column) => (
        <div
          key={column.id}
          className="min-w-[150px] flex-1 space-y-0.5"
          style={{ flexBasis: fieldBasis(column.width) }}
        >
          <span className="flex items-center gap-1 truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <span className="truncate" title={column.title}>
              {column.title}
            </span>
            {column.required ? (
              <span className="text-destructive">*</span>
            ) : null}
          </span>
          {renderControl(column)}
        </div>
      ))}
    </div>
  );
}
