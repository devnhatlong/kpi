"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  History,
  Loader2,
  Plus,
  RefreshCw,
  Scale,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  addTeamReportAdjustmentEntry,
  fetchTeamReportAdjustments,
  removeTeamReportAdjustmentEntry,
  teamReportKeys,
  updateTeamReportAdjustmentEntry,
} from "@/features/team-report/api";
import { DynamicColumnCell } from "@/features/team-report/components/dynamic-column-cell";
import {
  formatScore,
  type TeamReportAdjustmentEntry,
  type TeamReportAdjustmentItem,
  type TeamReportAdjustmentSection,
  type TeamReportColumn,
  type TeamReportTemplate,
} from "@/features/team-report/types";
import { useServerTime } from "@/hooks/use-server-time";
import { getApiErrorMessage } from "@/lib/api-client";
import { formatServerHm, serverYmd } from "@/lib/server-time";
import { cn } from "@/lib/utils";

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const index = y! * 12 + (m! - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

function monthLabel(month: string): string {
  const [y, m] = month.split("-");
  return `Tháng ${m}/${y}`;
}

const SECTIONS: Array<{
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
const LEFT_SEMANTICS = new Set([
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
 */
export function TeamReportAdjustmentView() {
  const { ready } = useServerTime();
  const [pickedMonth, setPickedMonth] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [cellErrors, setCellErrors] = useState<Record<string, string>>({});

  const month = pickedMonth ?? (ready ? serverYmd().slice(0, 7) : "");

  const { data, error, isLoading, mutate } = useSWR(
    month ? teamReportKeys.adjustments(month) : null,
    () => fetchTeamReportAdjustments(month),
    { revalidateOnFocus: false, keepPreviousData: true },
  );

  const sheet = data?.sheet;
  const totals = data?.totals;
  const templates = data?.templates;
  const scoreKeys = data?.scoreColumnKeys;
  const catalog = useMemo(() => data?.catalog ?? [], [data]);
  const months = useMemo(() => new Set(data?.months ?? []), [data]);

  const entriesByItem = useMemo(() => {
    const map = new Map<string, TeamReportAdjustmentEntry[]>();
    for (const entry of sheet?.entries ?? []) {
      map.set(entry.itemId, [...(map.get(entry.itemId) ?? []), entry]);
    }
    return map;
  }, [sheet]);

  /* Ghi thẳng kết quả server trả vào cache; danh mục và danh sách tháng thì
     server không gửi lại ở lượt ghi, giữ từ lần đọc. */
  const applyResult = async (
    result: Omit<NonNullable<typeof data>, "catalog" | "months">,
  ) => {
    await mutate(
      {
        ...result,
        catalog,
        months: [...new Set([...(data?.months ?? []), month])],
      },
      { revalidate: false },
    );
    if (result.sheet.updatedAt) {
      setSavedAt(formatServerHm(result.sheet.updatedAt));
    }
  };

  const fail = async (error: unknown, key: string) => {
    const message = getApiErrorMessage(error, "Không lưu được.");
    setCellErrors((prev) => ({ ...prev, [key]: message }));
    toast.error(message);
    if (
      (error as { response?: { status?: number } })?.response?.status === 409
    ) {
      await mutate();
    }
  };

  const clearError = (key: string) =>
    setCellErrors((prev) => {
      if (!(key in prev)) return prev;
      const rest = { ...prev };
      delete rest[key];
      return rest;
    });

  const run = async (key: string, work: () => Promise<void>) => {
    if (!sheet) return;
    setBusyKey(key);
    try {
      await work();
      clearError(key);
    } catch (error) {
      await fail(error, key);
    } finally {
      setBusyKey(null);
    }
  };

  const addLine = (item: TeamReportAdjustmentItem) =>
    run(`add:${item._id}`, async () => {
      await applyResult(
        await addTeamReportAdjustmentEntry(month, {
          version: sheet!.version,
          itemId: item._id,
        }),
      );
    });

  const saveCell = (
    entry: TeamReportAdjustmentEntry,
    column: TeamReportColumn,
    next: string,
  ) =>
    run(`${entry._id}:${column.key}`, async () => {
      await applyResult(
        await updateTeamReportAdjustmentEntry(month, entry._id, {
          version: sheet!.version,
          fieldValues: { [column.key]: next },
        }),
      );
    });

  const removeLine = (entry: TeamReportAdjustmentEntry) =>
    run(`del:${entry._id}`, async () => {
      await applyResult(
        await removeTeamReportAdjustmentEntry(month, entry._id, sheet!.version),
      );
    });

  return (
    <div className="space-y-4">
      <Card className="shadow-sm">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Scale className="size-5" />
            </span>
            <div>
              <h1 className="font-display text-xl font-semibold tracking-tight">
                Đề xuất điểm cộng, điểm trừ và xếp loại
              </h1>
              <p className="text-sm text-muted-foreground">
                Bảng đề xuất theo tháng - mỗi tháng một bảng, thêm dòng kết quả
                dưới từng mục rồi ghi điểm đề xuất. Mỗi ô tự lưu khi rời ô.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {busyKey ? (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" />
                Đang lưu
              </span>
            ) : savedAt ? (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Check className="size-3 text-emerald-600" />
                Đã lưu lúc {savedAt}
              </span>
            ) : null}
            <Button
              type="button"
              variant="outline"
              className="bg-background"
              onClick={() => void mutate()}
            >
              <RefreshCw className="size-4" />
              Làm mới
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardContent className="space-y-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="bg-background"
              disabled={!month}
              onClick={() => setPickedMonth(shiftMonth(month, -1))}
              aria-label="Tháng trước"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <div className="min-w-[10rem] rounded-md border bg-background px-3 py-2 text-center text-sm font-medium tabular-nums">
              {month ? monthLabel(month) : "…"}
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="bg-background"
              disabled={!month}
              onClick={() => setPickedMonth(shiftMonth(month, 1))}
              aria-label="Tháng sau"
            >
              <ChevronRight className="size-4" />
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={!ready}
              onClick={() => setPickedMonth(null)}
            >
              Tháng này
            </Button>
            {sheet ? (
              <Badge variant="secondary" className="font-normal">
                {sheet.saved
                  ? `${sheet.entries.length} dòng · sửa lần cuối ${
                      sheet.updatedAt ? formatServerHm(sheet.updatedAt) : ""
                    }`
                  : "Tháng này chưa nhập"}
              </Badge>
            ) : null}

            {totals ? (
              <div className="ml-auto flex flex-wrap items-center gap-2 text-sm tabular-nums">
                <span className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
                  Cộng <strong>+{formatScore(totals.bonus)}</strong>
                </span>
                <span className="rounded-md border border-rose-300 bg-rose-50 px-3 py-1.5 text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
                  Trừ <strong>−{formatScore(totals.penalty)}</strong>
                </span>
                <span className="rounded-md border bg-muted/40 px-3 py-1.5">
                  Chênh lệch{" "}
                  <strong>
                    {totals.net > 0 ? "+" : ""}
                    {formatScore(totals.net)}
                  </strong>
                </span>
              </div>
            ) : null}
          </div>

          {months.size ? (
            <p className="text-xs text-muted-foreground">
              Đã nhập:{" "}
              {[...months]
                .sort()
                .reverse()
                .slice(0, 12)
                .map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setPickedMonth(item)}
                    className={cn(
                      "mr-1.5 cursor-pointer rounded border px-1.5 py-0.5 tabular-nums hover:bg-muted/60",
                      item === month && "border-primary text-primary",
                    )}
                  >
                    {item.slice(5)}/{item.slice(0, 4)}
                  </button>
                ))}
            </p>
          ) : null}

          {error ? (
            /* 403 là chuyện thường ở đây: ai được nhập do quản trị đặt. Nói
               thẳng lý do server trả, không phải "không tải được". */
            <p className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              <TriangleAlert className="size-4 shrink-0" />
              {getApiErrorMessage(error, "Không mở được bảng này.")}
            </p>
          ) : isLoading && !data ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Đang tải...
            </p>
          ) : !catalog.length ? (
            <p className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              <TriangleAlert className="size-4 shrink-0" />
              Danh mục điểm cộng, trừ &amp; xếp loại đang trống - quản trị cần
              khai ở Cấu hình form nhiệm vụ trước.
            </p>
          ) : (
            SECTIONS.map((section) => (
              <SectionTable
                key={section.key}
                section={section}
                template={templates?.[section.key] ?? null}
                scoreKey={scoreKeys?.[section.key] ?? null}
                items={catalog.filter((item) => item.section === section.key)}
                entriesByItem={entriesByItem}
                sheetVersion={sheet?.version ?? 0}
                sectionTotal={
                  section.key === "BONUS"
                    ? (totals?.bonus ?? 0)
                    : section.key === "PENALTY"
                      ? (totals?.penalty ?? 0)
                      : null
                }
                busyKey={busyKey}
                cellErrors={cellErrors}
                onAdd={addLine}
                onSave={saveCell}
                onRemove={removeLine}
              />
            ))
          )}

          {sheet?.edits?.length ? (
            <div className="space-y-2">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <History className="size-4" />
                Nhật ký thay đổi
                <Badge variant="secondary" className="font-normal">
                  {sheet.edits.length} lượt
                </Badge>
              </h3>
              <ul className="max-h-64 divide-y overflow-y-auto rounded-md border text-sm">
                {[...sheet.edits].reverse().map((edit, index) => (
                  <li
                    key={`${edit.at}-${index}`}
                    className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2"
                  >
                    <span className="font-medium">{edit.byName}</span>
                    <span className="min-w-0 flex-1 break-words text-muted-foreground">
                      {edit.field}:{" "}
                      {edit.from ? (
                        <>
                          <span className="line-through">{edit.from}</span>
                          {" → "}
                        </>
                      ) : null}
                      <strong className="text-foreground">{edit.to}</strong>
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {formatServerHm(edit.at)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

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
function SectionTable({
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
}: {
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
                const span = Math.max(1, lines.length) + 1;
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
                              catalogs={{}}
                              disabled={busyKey?.startsWith(line._id) ?? false}
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
