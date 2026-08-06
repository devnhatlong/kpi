"use client";

import { useRef, type ReactNode } from "react";
import { Paperclip, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TableCell, TableRow } from "@/components/ui/table";
import type { FormTemplateColumn } from "@/features/kpi-form-config/types";
import {
  cellInputProps,
  readCellValue,
  writeCellValue,
} from "@/features/personal-kpi/task-column-utils";
import type {
  PersonalTaskDraft,
  TaskEvidenceFile,
} from "@/features/personal-kpi/types";

type PersonalTaskFormProps = {
  index: number;
  /** Số thứ tự nhiệm vụ trong nội dung - dùng cho placeholder */
  taskNumber?: number;
  task: PersonalTaskDraft;
  /** Cột đang hiển thị của mẫu bảng gán cho trục. */
  columns: FormTemplateColumn[];
  onChange: (patch: Partial<PersonalTaskDraft>) => void;
  onRemove: () => void;
  canRemove?: boolean;
  /** Hiện ô STT (rowspan) ở dòng đầu của nội dung */
  showSttCell?: boolean;
  /** Hiện ô Nội dung công việc (rowspan) ở dòng đầu */
  showWorkContentCell?: boolean;
  workContentLabel?: string;
  workContentRowSpan?: number;
  /** Chỉ xem (drawer chi tiết / gửi báo cáo) */
  readOnly?: boolean;
  /** Ô thao tác bên phải (ví dụ Duyệt / Từ chối) */
  actions?: ReactNode;
};

const cellInputClass = "h-8";

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function PersonalTaskForm({
  index,
  taskNumber,
  task,
  columns,
  onChange,
  onRemove,
  canRemove = true,
  showSttCell = false,
  showWorkContentCell = false,
  workContentLabel = "",
  workContentRowSpan = 1,
  readOnly = false,
  actions,
}: PersonalTaskFormProps) {
  const titlePlaceholder = `Nhiệm vụ ${taskNumber ?? index}`;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const evidenceFiles = task.evidenceFiles ?? [];

  const addFiles = (fileList: FileList | null) => {
    if (readOnly || !fileList?.length) return;
    const next: TaskEvidenceFile[] = [...evidenceFiles];
    for (const file of Array.from(fileList)) {
      next.push({
        key: `file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: file.name,
        size: file.size,
        mimeType: file.type || "application/octet-stream",
        file,
      });
    }
    onChange({ evidenceFiles: next });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFile = (fileKey: string) => {
    if (readOnly) return;
    onChange({
      evidenceFiles: evidenceFiles.filter((item) => item.key !== fileKey),
    });
  };

  const renderEvidenceCell = () => (
    <div className="flex flex-col gap-1.5">
      {!readOnly ? (
        <>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.gif,.webp,.zip,.rar"
            onChange={(e) => addFiles(e.target.files)}
          />
          <Button
            type="button"
            variant="outline"
            className="h-8 w-full justify-start px-2 py-0 text-xs"
            onClick={() => fileInputRef.current?.click()}
          >
            <Paperclip className="h-3.5 w-3.5" />
            Upload
          </Button>
        </>
      ) : null}
      {evidenceFiles.length > 0 ? (
        <ul className="space-y-1">
          {evidenceFiles.map((file) => (
            <li
              key={file.key}
              className="flex items-start gap-1 rounded border bg-muted/30 px-1.5 py-1 text-xs"
            >
              <span
                className="min-w-0 flex-1 break-all leading-snug"
                title={`${file.name} (${formatFileSize(file.size)})`}
              >
                {file.name}
              </span>
              {!readOnly ? (
                <button
                  type="button"
                  className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-background hover:text-destructive"
                  onClick={() => removeFile(file.key)}
                  aria-label={`Xoá ${file.name}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : readOnly ? (
        <span className="text-xs text-muted-foreground">-</span>
      ) : null}
    </div>
  );

  return (
    <TableRow>
      {columns.map((column) => {
        const minWidth = `${column.width}px`;

        // STT và Nội dung công việc gộp ô theo nhóm nhiệm vụ - chỉ vẽ ở dòng đầu.
        if (column.semanticKey === "stt") {
          if (!showSttCell) return null;
          return (
            <TableCell
              key={column.id}
              rowSpan={workContentRowSpan}
              className="sticky left-0 z-10 bg-background text-center align-middle text-muted-foreground"
              style={{ minWidth }}
            >
              {index}
            </TableCell>
          );
        }

        if (column.semanticKey === "work_content") {
          if (!showWorkContentCell) return null;
          return (
            <TableCell
              key={column.id}
              rowSpan={workContentRowSpan}
              className="max-w-[280px] whitespace-normal border-r bg-muted/20 align-middle text-sm font-medium"
              style={{ minWidth }}
            >
              {workContentLabel}
            </TableCell>
          );
        }

        if (column.semanticKey === "evidence_files") {
          return (
            <TableCell key={column.id} style={{ minWidth }}>
              {renderEvidenceCell()}
            </TableCell>
          );
        }

        const inputProps = cellInputProps(column.semanticKey, column.dataType);
        const placeholder =
          column.semanticKey === "task_title"
            ? titlePlaceholder
            : (inputProps.placeholder ?? column.title);

        return (
          <TableCell key={column.id} style={{ minWidth }}>
            <Input
              className={cellInputClass}
              type={inputProps.type}
              min={inputProps.min}
              max={inputProps.max}
              step={inputProps.step}
              value={readCellValue(task, column.semanticKey, column.key)}
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
              placeholder={placeholder}
              disabled={readOnly}
            />
          </TableCell>
        );
      })}

      <TableCell className="sticky right-0 z-10 min-w-[140px] bg-background text-right align-middle">
        {actions ? (
          actions
        ) : !readOnly ? (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={onRemove}
            disabled={!canRemove}
            aria-label="Xoá nhiệm vụ"
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        ) : null}
      </TableCell>
    </TableRow>
  );
}
