"use client";

import { useRef, type ReactNode } from "react";
import { Paperclip, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TableCell, TableRow } from "@/components/ui/table";
import type {
  PersonalTaskDraft,
  TaskEvidenceFile,
} from "@/features/personal-kpi/types";

type PersonalTaskFormProps = {
  index: number;
  /** Số thứ tự nhiệm vụ trong nội dung - dùng cho placeholder */
  taskNumber?: number;
  task: PersonalTaskDraft;
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

  return (
    <TableRow>
      {showSttCell ? (
        <TableCell
          rowSpan={workContentRowSpan}
          className="sticky left-0 z-10 bg-background text-center align-middle text-muted-foreground"
        >
          {index}
        </TableCell>
      ) : null}

      {showWorkContentCell ? (
        <TableCell
          rowSpan={workContentRowSpan}
          className="min-w-[220px] max-w-[280px] align-middle whitespace-normal border-r bg-muted/20 text-sm font-medium"
        >
          {workContentLabel}
        </TableCell>
      ) : null}

      <TableCell className="min-w-[200px]">
        <Input
          className={cellInputClass}
          value={task.title}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder={titlePlaceholder}
          disabled={readOnly}
        />
      </TableCell>
      <TableCell className="min-w-[140px]">
        <Input
          className={cellInputClass}
          type="date"
          value={task.deadline}
          onChange={(e) => onChange({ deadline: e.target.value })}
          disabled={readOnly}
        />
      </TableCell>
      <TableCell className="min-w-[160px]">
        <Input
          className={cellInputClass}
          value={task.product}
          onChange={(e) => onChange({ product: e.target.value })}
          placeholder="Sản phẩm dự kiến"
          disabled={readOnly}
        />
      </TableCell>
      <TableCell className="min-w-[100px]">
        <Input
          className={cellInputClass}
          type="number"
          min={0}
          step={0.5}
          value={task.standardScore}
          onChange={(e) => onChange({ standardScore: e.target.value })}
          placeholder="0 *"
          disabled={readOnly}
        />
      </TableCell>
      <TableCell className="min-w-[140px]">
        <Input
          className={cellInputClass}
          value={task.executingUnit}
          onChange={(e) => onChange({ executingUnit: e.target.value })}
          placeholder="Đơn vị thực hiện"
          disabled={readOnly}
        />
      </TableCell>
      <TableCell className="min-w-[100px]">
        <Input
          className={cellInputClass}
          type="number"
          min={0}
          max={100}
          value={task.progressPercent}
          onChange={(e) => onChange({ progressPercent: e.target.value })}
          placeholder="%"
          disabled={readOnly}
        />
      </TableCell>
      <TableCell className="min-w-[110px]">
        <Input
          className={cellInputClass}
          type="number"
          min={0}
          step={0.5}
          value={task.progressSelfScore}
          onChange={(e) => onChange({ progressSelfScore: e.target.value })}
          placeholder="Điểm"
          disabled={readOnly}
        />
      </TableCell>
      <TableCell className="min-w-[100px]">
        <Input
          className={cellInputClass}
          type="number"
          min={0}
          max={100}
          value={task.qualityPercent}
          onChange={(e) => onChange({ qualityPercent: e.target.value })}
          placeholder="%"
          disabled={readOnly}
        />
      </TableCell>
      <TableCell className="min-w-[110px]">
        <Input
          className={cellInputClass}
          type="number"
          min={0}
          step={0.5}
          value={task.qualitySelfScore}
          onChange={(e) => onChange({ qualitySelfScore: e.target.value })}
          placeholder="Điểm"
          disabled={readOnly}
        />
      </TableCell>
      <TableCell className="min-w-[160px]">
        <Input
          className={cellInputClass}
          value={task.note}
          onChange={(e) => onChange({ note: e.target.value })}
          placeholder="Đề nghị khác"
          disabled={readOnly}
        />
      </TableCell>
      <TableCell className="min-w-[200px]">
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
      </TableCell>
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
