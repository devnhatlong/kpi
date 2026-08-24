"use client";

import { useMemo } from "react";
import { Plus, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  footerMode,
  FORM_FOOTER_MODE_LABEL,
  FORM_FOOTER_MODES,
  FORMULA_VALUE_SOURCE_HINT,
  formulaColumns,
  formulaRoleLabel,
  formulaValueSource,
  type FormFooterMode,
  type FormTemplateColumn,
  type FormTemplateFooter,
} from "@/features/kpi-form-config/types";

const NO_COLUMN = "__nocolumn__";

/** Tên cột kèm chú thích cột đó góp con số nào, cho dropdown công thức. */
function formulaColumnLabel(column: FormTemplateColumn): string {
  const source = formulaValueSource(column);
  const title = column.title || column.key;
  if (!source || source === "number") return title;
  return `${title} - ${FORMULA_VALUE_SOURCE_HINT[source]}`;
}

/**
 * Công thức viết ra chữ để admin đối chiếu với văn bản quy định trước khi lưu -
 * đọc "[(B/A)+(C/A)] / 2" nhanh hơn là suy từ hai ô dropdown.
 */
function formulaPreview(
  footer: FormTemplateFooter,
  columns: FormTemplateColumn[],
): string {
  const columnOf = (key: string) => columns.find((column) => column.key === key);
  const describe = (key: string) => {
    const column = columnOf(key);
    if (!column) return key;
    const source = formulaValueSource(column);
    const title = column.title || column.key;
    return source && source !== "number"
      ? `${title} (${FORMULA_VALUE_SOURCE_HINT[source]})`
      : title;
  };

  if (footerMode(footer) === "sum") {
    if (!footer.ratioColumnKeys.length) {
      return "Chọn ít nhất một cột điểm để cộng.";
    }
    return [
      `Điểm quy đổi = ${footer.ratioColumnKeys.map(describe).join(" + ")}`,
      "",
      "(cộng TỔNG của cả cột qua mọi nhiệm vụ của trục,",
      "rồi chặn ở điểm tối đa của trục)",
    ].join("\n");
  }

  if (!footer.baseColumnKey || !footer.ratioColumnKeys.length) {
    return "Chọn đủ cột mẫu số và ít nhất một cột tử số để xem công thức.";
  }

  const ratios = footer.ratioColumnKeys.map(
    (_, index) => `${formulaRoleLabel(index)}/A`,
  );
  const score =
    ratios.length === 1 ? ratios[0] : `[${ratios.join("+")}] / ${ratios.length}`;

  const lines = [
    `Tổng điểm trục = ${score}`,
    `Điểm quy đổi   = (${score}) × điểm tối đa của trục`,
    "",
    `A = ${describe(footer.baseColumnKey)}`,
    ...footer.ratioColumnKeys.map(
      (key, index) => `${formulaRoleLabel(index)} = ${describe(key)}`,
    ),
    "",
    "(A, B, C… là TỔNG của cả cột, không phải giá trị từng dòng)",
  ];

  // Chia phần trăm cho điểm là ra số hàng chục rồi nhân tiếp điểm tối đa -
  // điểm quy đổi sẽ vượt xa trần của trục. Cảnh báo ngay khi chọn, đừng để
  // phát hiện lúc bảng đã hiện số sai.
  const baseColumn = columnOf(footer.baseColumnKey);
  const baseSource = baseColumn ? formulaValueSource(baseColumn) : null;
  const mixedUnit =
    baseSource !== "quality_percent" &&
    footer.ratioColumnKeys.some((key) => {
      const column = columnOf(key);
      return column ? formulaValueSource(column) === "quality_percent" : false;
    });
  if (mixedUnit) {
    lines.push(
      "",
      "CẢNH BÁO: mẫu số là điểm còn tử số là phần trăm - tỉ lệ sẽ",
      "không nằm trong khoảng 0-1 và điểm quy đổi sẽ vượt trần trục.",
    );
  }

  return lines.join("\n");
}

type ScoringRulesDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Tên khối đang cấu hình - hiện trên tiêu đề cho khỏi nhầm trục. */
  blockLabel: string;
  columns: FormTemplateColumn[];
  footer: FormTemplateFooter;
  onChange: (footer: FormTemplateFooter) => void;
};

/**
 * Quy tắc quy ra điểm của một khối - ba dòng cuối bảng.
 *
 * Khuôn công thức cố định, ở đây chỉ chọn cột nào đóng vai nào; không chạy biểu
 * thức tuỳ ý. Điểm tối đa để nhân ra điểm quy đổi đặt ở từng trục.
 */
export function ScoringRulesDialog({
  open,
  onOpenChange,
  blockLabel,
  columns,
  footer,
  onChange,
}: ScoringRulesDialogProps) {
  const numericColumns = useMemo(() => formulaColumns(columns), [columns]);
  const numericKeys = useMemo(
    () => new Set(numericColumns.map((column) => column.key)),
    [numericColumns],
  );

  /**
   * Công thức sau khi bỏ khoá trỏ vào cột đã xoá hoặc đã đổi khỏi kiểu số -
   * lọc lúc hiển thị chứ không sửa thẳng state, để không đạp lên đúng công thức
   * vừa nạp từ mẫu đang mở.
   */
  const liveFooter = useMemo<FormTemplateFooter>(
    () => ({
      enabled: footer.enabled,
      mode: footerMode(footer),
      baseColumnKey:
        footer.baseColumnKey && numericKeys.has(footer.baseColumnKey)
          ? footer.baseColumnKey
          : null,
      ratioColumnKeys: footer.ratioColumnKeys.filter((key) =>
        numericKeys.has(key),
      ),
    }),
    [footer, numericKeys],
  );

  const mode = footerMode(footer);
  const patch = (next: Partial<FormTemplateFooter>) =>
    onChange({ ...footer, ...next });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Quy tắc tính điểm · {blockLabel}</DialogTitle>
          <DialogDescription>
            Bảng của khối này sẽ có thêm dòng &quot;Tổng từng cột&quot;,
            &quot;Tổng điểm trục&quot; và &quot;Điểm quy đổi&quot;. Điểm tối đa
            để nhân ra điểm quy đổi đặt ở từng trục.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
            <Label htmlFor="rule-enabled" className="text-sm">
              Bật ba dòng tính điểm cuối bảng
            </Label>
            <Switch
              id="rule-enabled"
              checked={footer.enabled}
              onCheckedChange={(enabled) => patch({ enabled })}
            />
          </div>

          {!footer.enabled ? null : numericColumns.length === 0 ? (
            <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
              Mẫu chưa có trường nào quy ra số được. Công thức nhận trường kiểu
              Số, trường Nhóm điểm (lấy điểm tối đa của nhóm) và trường Chất
              lượng thực hiện (lấy phần trăm của mức).
            </p>
          ) : (
            <div className="space-y-4">
              {/* Kiểu tính phải chọn TRƯỚC: chọn cộng dồn thì chẳng còn mẫu số
                  nào để khai, hỏi tiếp cột mẫu số chỉ tổ gây hiểu nhầm. */}
              <div className="grid gap-2">
                <Label>Cách tính điểm trục</Label>
                <Select
                  value={mode}
                  onValueChange={(value) =>
                    patch({ mode: value as FormFooterMode })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FORM_FOOTER_MODES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {FORM_FOOTER_MODE_LABEL[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {mode === "sum"
                    ? "Cộng thẳng điểm các cột đã khai rồi chặn ở điểm tối đa của trục. Dùng cho trục chấm theo mục Đạt / Không đạt, mỗi mục một điểm chuẩn riêng."
                    : "Chia tổng tử số cho tổng mẫu số rồi nhân điểm tối đa của trục. Dùng cho trục chấm theo tỉ lệ hoàn thành."}
                </p>
              </div>

              {mode === "sum" ? null : (
                <div className="grid gap-2">
                  <Label>
                    Cột mẫu số (A) <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={liveFooter.baseColumnKey ?? NO_COLUMN}
                    onValueChange={(value) =>
                      patch({
                        baseColumnKey: value === NO_COLUMN ? null : value,
                      })
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Chọn cột" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_COLUMN}>Chưa chọn</SelectItem>
                      {numericColumns.map((column) => (
                        <SelectItem key={column.id} value={column.key}>
                          {formulaColumnLabel(column)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Thường là cột Điểm chuẩn - mọi tỉ lệ đều chia cho tổng cột
                    này. Cột Điểm chuẩn gán Nhóm điểm thì lấy điểm tối đa của
                    nhóm được chọn ở từng dòng.
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label>
                  {mode === "sum" ? "Các cột điểm đem cộng" : "Các cột tử số"}{" "}
                  <span className="text-destructive">*</span>
                </Label>
                {footer.ratioColumnKeys.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Chưa có cột nào.
                  </p>
                ) : null}
                {footer.ratioColumnKeys.map((key, index) => (
                  <div key={`ratio-${index}`} className="flex items-center gap-2">
                    <Badge variant="outline" className="w-8 justify-center">
                      {formulaRoleLabel(index)}
                    </Badge>
                    <Select
                      value={numericKeys.has(key) ? key : NO_COLUMN}
                      onValueChange={(value) => {
                        const next = [...footer.ratioColumnKeys];
                        next[index] = value === NO_COLUMN ? "" : value;
                        patch({ ratioColumnKeys: next });
                      }}
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Chọn cột" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_COLUMN}>Chưa chọn</SelectItem>
                        {numericColumns.map((column) => (
                          <SelectItem key={column.id} value={column.key}>
                            {formulaColumnLabel(column)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() =>
                        patch({
                          ratioColumnKeys: footer.ratioColumnKeys.filter(
                            (_, i) => i !== index,
                          ),
                        })
                      }
                      aria-label={`Bỏ cột ${formulaRoleLabel(index)}`}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    patch({ ratioColumnKeys: [...footer.ratioColumnKeys, ""] })
                  }
                >
                  <Plus className="size-4" />
                  Thêm cột
                </Button>
                <p className="text-xs text-muted-foreground">
                  Tử số phải cùng đơn vị với mẫu số thì tỉ lệ mới nằm trong
                  khoảng 0-1. Mẫu số là điểm mà tử số lấy cột phần trăm thì tỉ lệ
                  sẽ vọt lên hàng chục - xem khung công thức bên dưới để kiểm tra.
                </p>
              </div>

              <div className="whitespace-pre-line rounded-lg bg-muted p-3 font-mono text-xs">
                {formulaPreview(liveFooter, columns)}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
