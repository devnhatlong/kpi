"use client";

import { Plus, Trash2, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DynamicColumnCell } from "@/features/team-report/components/dynamic-column-cell";
import {
  formatScore,
  type TeamReportAdjustmentEntry,
  type TeamReportAdjustmentItem,
  type TeamReportAdjustmentSection,
  type TeamReportCatalogs,
  type TeamReportColumn,
  type TeamReportTemplate,
} from "@/features/team-report/types";
import { cn } from "@/lib/utils";

export const ADJUSTMENT_SECTIONS_UI: Array<{
  key: TeamReportAdjustmentSection;
  numeral: string;
  title: string;
}> = [
  { key: "BONUS", numeral: "I", title: "ĐIỂM CỘNG" },
  { key: "PENALTY", numeral: "II", title: "ĐIỂM TRỪ" },
  {
    key: "RANKING",
    numeral: "III",
    title: "ĐỀ XUẤT ĐIỀU CHỈNH, KHỐNG CHẾ MỨC XẾP LOẠI",
  },
];

/**
 * Cột nửa trái - chép từ danh mục, gộp dọc theo mục, đội không gõ. Luật phải
 * khớp `LEFT_SEMANTICS` bên server.
 */
export const LEFT_SEMANTICS = new Set([
  "stt",
  "adjustment_name",
  "adjustment_rule",
  "adjustment_max_score",
]);

/**
 * "Bảng đề xuất điểm cộng, điểm trừ và điều chỉnh, khống chế mức xếp
 * loại" - đội tự điền, THÁNG MỘT BẢN.
 *
 * Bộ cột của từng phần lấy từ MẪU BẢNG quản trị dựng ở Mẫu báo cáo nhiệm vụ
 * (mẫu gắn `forAdjustment`), y như bảng A và các trục - màn này không biết
 * trước cột nào. Nửa trái (ánh xạ `adjustment_*`) bày từ danh mục và gộp dọc
 * theo mục; nửa phải là các dòng đội tự thêm dưới từng mục, ô nào cũng tự lưu.

/** Nhóm nhiều `<TableRow>` mà không thêm phần tử DOM - `<tbody>` không nhận `<div>`. */
function FragmentRows({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

/**
 * Bảng của một phần, dựng từ mẫu của phần đó.
 *
 * Cột nửa trái (ánh xạ `adjustment_*`, STT) lấy từ mục và gộp dọc qua mọi dòng
 * của mục; cột còn lại là ô nhập theo cấu hình cột - `DynamicColumnCell` đọc
 * kiểu dữ liệu và dựng đúng ô, y như tab Phân loại.
 */
export function AdjustmentSectionTable({
  section,
  template,
  scoreKey,
  items,
  entriesByItem,
  sheetVersion,
  sectionTotal,
  busyKey,
  cellErrors,
  onAdd,
  onSave,
  onRemove,
  mode = "edit",
  catalogs = {},
}: {
  /**
   * `edit`   - đội đang nhập: thêm / sửa / xoá dòng.
   * `review` - cấp trên đang duyệt: chỉ sửa ô của dòng đã có.
   * `read`   - chỉ đọc (đã trình, đã duyệt).
   */
  mode?: "edit" | "review" | "read";
  /** Danh mục cho ô kiểu chọn - hiện chỉ có `department` (đơn vị). */
  catalogs?: TeamReportCatalogs;
  section: { key: TeamReportAdjustmentSection; numeral: string; title: string };
  template: TeamReportTemplate | null;
  scoreKey: string | null;
  items: TeamReportAdjustmentItem[];
  entriesByItem: Map<string, TeamReportAdjustmentEntry[]>;
  sheetVersion: number;
  sectionTotal: number | null;
  busyKey: string | null;
  cellErrors: Record<string, string>;
  onAdd: (item: TeamReportAdjustmentItem) => void;
  onSave: (
    entry: TeamReportAdjustmentEntry,
    column: TeamReportColumn,
    next: string,
  ) => void;
  onRemove: (entry: TeamReportAdjustmentEntry) => void;
}) {
  if (!items.length) return null;

  const columns = (template?.columns ?? []).filter((column) => column.visible);
  const leftCols = columns.filter((column) =>
    LEFT_SEMANTICS.has(column.semanticKey),
  );
  const rightCols = columns.filter(
    (column) => !LEFT_SEMANTICS.has(column.semanticKey),
  );
  /* Bề rộng nửa phải: các cột của mẫu + cột nút xoá. */
  const rightSpan = rightCols.length + 1;

  const readScore = (entry: TeamReportAdjustmentEntry) => {
    if (!scoreKey) return 0;
    const value = Number(String(entry.fieldValues?.[scoreKey] ?? "").trim());
    return Number.isFinite(value) ? value : 0;
  };

  return (
    <section className="space-y-2">
      <h2 className="font-display text-sm font-semibold">
        {section.numeral}. {section.title}
      </h2>

      {!template ? (
        <p className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <TriangleAlert className="size-4 shrink-0" />
          Phần này chưa được gán mẫu bảng. Quản trị dựng form ở{" "}
          <span className="font-medium">
            Mẫu báo cáo nhiệm vụ → Bảng điểm cộng, trừ &amp; xếp loại →{" "}
            {section.numeral}
          </span>{" "}
          rồi lưu là bảng hiện ở đây.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table className="border-collapse [&_td]:border [&_td]:border-border [&_th]:border [&_th]:border-border">
            <TableHeader>
              {/* Hai tầng tiêu đề như mẫu giấy: soi chiếu | theo dõi. */}
              <TableRow className="bg-muted/60 hover:bg-inherit">
                <TableHead
                  colSpan={Math.max(1, leftCols.length)}
                  className="text-center"
                >
                  Nội dung để soi chiếu
                </TableHead>
                <TableHead colSpan={rightSpan} className="text-center">
                  Nội dung theo dõi, thẩm định
                </TableHead>
              </TableRow>
              <TableRow className="bg-muted/40 hover:bg-inherit">
                {columns.map((column) => (
                  <TableHead
                    key={column.key}
                    style={{ minWidth: column.width }}
                    className={cn(
                      "align-middle",
                      (column.semanticKey === "stt" ||
                        column.dataType === "number" ||
                        column.dataType === "boolean") &&
                        "text-center",
                    )}
                  >
                    {column.title}
                    {column.key === scoreKey && section.key === "BONUS" ? (
                      <span className="ml-1 text-xs font-normal text-muted-foreground">
                        (mỗi dòng ≤ tối đa)
                      </span>
                    ) : null}
                  </TableHead>
                ))}
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item, index) => {
                const lines = entriesByItem.get(item._id) ?? [];
                const span =
                  Math.max(1, lines.length) + (mode === "edit" ? 1 : 0);
                const itemTotal = lines.reduce(
                  (sum, line) => sum + readScore(line),
                  0,
                );
                /* Nửa trái gộp dọc qua mọi dòng của mục, kể cả dòng nút
                   "Thêm" - đúng như ô gộp trên mẫu giấy. */
                const left = leftCols.map((column) => {
                  let body: React.ReactNode = null;
                  if (column.semanticKey === "stt") body = index + 1;
                  else if (column.semanticKey === "adjustment_name")
                    body = (
                      <>
                        {item.name}
                        {!item.isActive ? (
                          <span className="ml-1 text-xs font-normal text-muted-foreground">
                            (đã ngừng)
                          </span>
                        ) : null}
                      </>
                    );
                  else if (column.semanticKey === "adjustment_rule")
                    body = item.rule;
                  else if (column.semanticKey === "adjustment_max_score")
                    body =
                      item.maxScore === null ? (
                        "-"
                      ) : (
                        <>
                          Tối đa {formatScore(item.maxScore)}
                          {/* Tổng các dòng chỉ để tham khảo - trần áp cho TỪNG
                              dòng, không cộng dồn. */}
                          {lines.length > 1 ? (
                            <div className="mt-1 text-xs text-muted-foreground">
                              cộng {formatScore(itemTotal)}
                            </div>
                          ) : null}
                        </>
                      );
                  return (
                    <TableCell
                      key={column.key}
                      rowSpan={span}
                      className={cn(
                        "border-b-2 align-top",
                        column.semanticKey === "stt" &&
                          "text-center tabular-nums",
                        column.semanticKey === "adjustment_name" &&
                          "whitespace-normal text-sm font-medium",
                        column.semanticKey === "adjustment_rule" &&
                          "whitespace-normal text-xs text-muted-foreground",
                        column.semanticKey === "adjustment_max_score" &&
                          "text-center text-sm tabular-nums",
                      )}
                    >
                      {body}
                    </TableCell>
                  );
                });

                const right = (line: TeamReportAdjustmentEntry) => (
                  <>
                    {rightCols.map((column) => {
                      const errorKey = `${line._id}:${column.key}`;
                      const value = String(
                        line.fieldValues?.[column.key] ?? "",
                      );
                      return (
                        <TableCell
                          key={column.key}
                          className={cn(
                            "align-top",
                            column.dataType === "boolean" && "text-center",
                          )}
                        >
                          <div
                            className={cn(
                              column.dataType === "boolean" &&
                                "flex justify-center pt-2",
                            )}
                          >
                            <DynamicColumnCell
                              key={`${line._id}:${column.key}:${sheetVersion}`}
                              column={column}
                              value={value}
                              catalogs={catalogs}
                              disabled={
                                mode === "read" ||
                                (busyKey?.startsWith(line._id) ?? false)
                              }
                              invalid={errorKey in cellErrors}
                              onCommit={(next) => onSave(line, column, next)}
                            />
                            {cellErrors[errorKey] ? (
                              <p className="mt-1 text-xs text-destructive">
                                {cellErrors[errorKey]}
                              </p>
                            ) : null}
                          </div>
                        </TableCell>
                      );
                    })}
                    <TableCell className="align-top">
                      {mode !== "edit" ? null : (
                        <button
                          type="button"
                          disabled={busyKey !== null}
                          aria-label="Xoá dòng"
                          title="Xoá dòng"
                          onClick={() => onRemove(line)}
                          className="mt-1.5 cursor-pointer text-muted-foreground transition-colors hover:text-destructive disabled:cursor-not-allowed"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      )}
                    </TableCell>
                  </>
                );

                return (
                  <FragmentRows key={item._id}>
                    {lines.length ? (
                      lines.map((line, lineIndex) => (
                        <TableRow key={line._id}>
                          {lineIndex === 0 ? left : null}
                          {right(line)}
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        {left}
                        <TableCell
                          colSpan={rightSpan}
                          className="align-middle text-xs text-muted-foreground"
                        >
                          Chưa có kết quả nào cho mục này.
                        </TableCell>
                      </TableRow>
                    )}
                    {mode !== "edit" ? null : (
                      <TableRow className="border-b-2 hover:bg-inherit">
                        <TableCell colSpan={rightSpan} className="py-1.5">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs text-muted-foreground"
                            disabled={busyKey !== null || !item.isActive}
                            onClick={() => onAdd(item)}
                          >
                            <Plus className="size-3.5" />
                            Thêm dòng kết quả
                          </Button>
                          {cellErrors[`add:${item._id}`] ? (
                            <span className="ml-2 text-xs text-destructive">
                              {cellErrors[`add:${item._id}`]}
                            </span>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    )}
                  </FragmentRows>
                );
              })}

              {sectionTotal !== null ? (
                <TableRow className="bg-muted/40 font-medium hover:bg-inherit">
                  <TableCell
                    colSpan={Math.max(1, leftCols.length)}
                    className="uppercase"
                  >
                    {section.key === "BONUS"
                      ? "Tổng điểm cộng"
                      : "Tổng điểm trừ"}
                    {section.key === "BONUS" ? (
                      <span className="ml-2 text-xs font-normal normal-case text-muted-foreground">
                        tối đa{" "}
                        {formatScore(
                          items.reduce(
                            (sum, item) => sum + (item.maxScore ?? 0),
                            0,
                          ),
                        )}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell
                    colSpan={rightSpan}
                    className="text-right tabular-nums"
                  >
                    {section.key === "BONUS" ? "+" : "−"}
                    {formatScore(sectionTotal)} điểm
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
