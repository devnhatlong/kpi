"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  History,
  Loader2,
  RefreshCw,
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
  fetchTeamReportCriteria,
  saveTeamReportCriteria,
  teamReportKeys,
} from "@/features/team-report/api";
import { DynamicColumnCell } from "@/features/team-report/components/dynamic-column-cell";
import { scoreTone } from "@/features/team-report/status-styles";
import {
  formatScore,
  type TeamReportColumn,
  type TeamReportCriterionRow,
} from "@/features/team-report/types";
import { useServerTime } from "@/hooks/use-server-time";
import { getApiErrorMessage } from "@/lib/api-client";
import { formatServerHm, serverYmd } from "@/lib/server-time";
import { cn } from "@/lib/utils";

/** YYYY-MM dịch đi N tháng - số học thuần, không đụng tới Date và múi giờ. */
function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const index = y! * 12 + (m! - 1) + delta;
  const year = Math.floor(index / 12);
  const mon = (index % 12) + 1;
  return `${year}-${String(mon).padStart(2, "0")}`;
}

function monthLabel(month: string): string {
  const [y, m] = month.split("-");
  return `Tháng ${m}/${y}`;
}

/**
 * Ba cột chép từ danh mục và cột STT: bảng tự bày, không phải ô nhập.
 *
 * Luật phải khớp `inputColumns` bên server - lệch là bảng bày ra một ô gõ được
 * mà server thì bỏ qua.
 */
const FIXED_SEMANTICS = new Set([
  "stt",
  "criterion",
  "criterion_note",
  "criterion_max_score",
]);

/**
 * Bảng A "Danh mục điểm tiêu chí chung" - đội tự chấm, THÁNG MỘT BẢN.
 *
 * Khối B (nhiệm vụ) chấm từng việc từng ngày; khối A là đánh giá chung của cả
 * tháng nên chỉ có một bảng cho mỗi tháng, nhập lúc nào cũng được - chọn tháng
 * ở đầu màn là chọn bảng nào. Tháng chưa ai chấm thì bày bảng trống dựng từ
 * danh mục; ô đầu tiên được lưu mới sinh ra bản thật.
 *
 * Tự lưu từng ô như tab Phân loại: cả đội chấm chung một bảng qua một tài
 * khoản, gom thành một nút Lưu là đè mất phần người khác vừa gõ.
 */
export function TeamReportCriteriaView() {
  const { ready } = useServerTime();
  const [pickedMonth, setPickedMonth] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  /* Ô server vừa từ chối, khoá `<tiêu chí>:<cột>` - viền đỏ ngay tại ô. */
  const [cellErrors, setCellErrors] = useState<Record<string, string>>({});

  /* Tháng hiện tại lấy theo GIỜ SERVER, không lấy giờ máy: đêm cuối tháng mà
     máy lệch múi giờ là bảng mở nhầm sang tháng sau. */
  const month = pickedMonth ?? (ready ? serverYmd().slice(0, 7) : "");

  const { data, isLoading, mutate } = useSWR(
    month ? teamReportKeys.criteria(month) : null,
    () => fetchTeamReportCriteria(month),
    { revalidateOnFocus: false, keepPreviousData: true },
  );

  const sheet = data?.sheet;
  const template = data?.template ?? null;
  const score = data?.score;
  const months = useMemo(() => new Set(data?.months ?? []), [data]);

  const columns = useMemo(
    () => (template?.columns ?? []).filter((column) => column.visible),
    [template],
  );
  const inputCols = columns.filter(
    (column) => !FIXED_SEMANTICS.has(column.semanticKey) && !column.autoValue,
  );

  const saveCell = async (
    row: TeamReportCriterionRow,
    column: TeamReportColumn,
    next: string,
  ) => {
    if (!sheet) return;
    const errorKey = `${row.criterionId}:${column.key}`;
    setSavingKey(errorKey);
    try {
      const result = await saveTeamReportCriteria(month, {
        version: sheet.version,
        rows: [
          { criterionId: row.criterionId, fieldValues: { [column.key]: next } },
        ],
      });
      /* Ghi thẳng kết quả vào cache thay vì nạp lại: server đã trả cả bảng,
         nạp lại chỉ để nhận đúng thứ vừa cầm. */
      await mutate(
        {
          ...result,
          // Lượt lưu đầu của tháng: tháng này vừa gia nhập danh sách đã chấm.
          months: [...new Set([...(data?.months ?? []), month])],
        },
        { revalidate: false },
      );
      // Giờ lưu lấy từ server trả về, không lấy giờ máy.
      if (result.sheet.updatedAt) {
        setSavedAt(formatServerHm(result.sheet.updatedAt));
      }
      setCellErrors((prev) => {
        if (!(errorKey in prev)) return prev;
        const rest = { ...prev };
        delete rest[errorKey];
        return rest;
      });
    } catch (error) {
      const message = getApiErrorMessage(error, "Không lưu được.");
      setCellErrors((prev) => ({ ...prev, [errorKey]: message }));
      toast.error(message);
      /* 409 = người khác vừa lưu; nạp lại để cầm đúng số bản mới. */
      if (
        (error as { response?: { status?: number } })?.response?.status === 409
      ) {
        await mutate();
      }
    } finally {
      setSavingKey(null);
    }
  };

  const tone = scoreTone(
    score && score.total !== null && score.max > 0
      ? score.total / score.max
      : null,
  );

  return (
    <div className="space-y-4">
      <Card className="shadow-sm">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ClipboardCheck className="size-5" />
            </span>
            <div>
              <h1 className="font-display text-xl font-semibold tracking-tight">
                Danh mục điểm tiêu chí chung
              </h1>
              <p className="text-sm text-muted-foreground">
                Khối A của báo cáo - mỗi tháng một bảng, chấm lúc nào trong
                tháng cũng được. Mỗi ô tự lưu ngay khi rời ô.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {savingKey ? (
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
        <CardContent className="space-y-4 py-4">
          {/* ------------------------------------------------ chọn tháng */}
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
              <Badge
                variant="secondary"
                className={cn(
                  "font-normal",
                  sheet.saved
                    ? "border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
                    : "",
                )}
              >
                {sheet.saved
                  ? `Đã chấm · sửa lần cuối ${
                      sheet.updatedAt ? formatServerHm(sheet.updatedAt) : ""
                    }`
                  : "Tháng này chưa chấm"}
              </Badge>
            ) : null}

            {/* Điểm của bảng đứng phải, luôn trong tầm mắt khi chấm. */}
            {score ? (
              <div
                className={cn(
                  "ml-auto flex items-center gap-2 rounded-md border px-3 py-1.5 tabular-nums",
                  tone.badge || "bg-muted/40",
                )}
              >
                <span className="text-sm">Tổng điểm khối A</span>
                <strong className="font-display text-lg">
                  {score.total === null ? "-" : formatScore(score.total)}
                </strong>
                <span className="text-sm opacity-70">/ {score.max}</span>
                {score.scoreColumnKey ? (
                  <span className="text-xs opacity-70">
                    · {score.scoredRows}/{sheet?.rows.length ?? 0} tiêu chí đã
                    chấm
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>

          {/* Vài tháng gần đây đã chấm - để khỏi mở từng tháng dò. */}
          {months.size ? (
            <p className="text-xs text-muted-foreground">
              Đã chấm:{" "}
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

          {/* ------------------------------------------------------ bảng */}
          {isLoading && !data ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Đang tải bảng...
            </p>
          ) : !template ? (
            <p className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              <TriangleAlert className="size-4 shrink-0" />
              Chưa có mẫu bảng nào được gán cho khối A. Quản trị cần gán một mẫu
              ở Cấu hình form nhiệm vụ (đánh dấu &quot;dùng cho bảng tiêu chí
              chung&quot;).
            </p>
          ) : !sheet?.rows.length ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Danh mục tiêu chí chung đang trống - quản trị chưa khai tiêu chí
              nào.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-inherit">
                    {columns.map((column) => (
                      <TableHead
                        key={column.key}
                        style={{ minWidth: column.width }}
                        className={cn(
                          "align-middle",
                          column.semanticKey === "criterion" && "min-w-[22rem]",
                          (column.dataType === "number" ||
                            column.dataType === "boolean" ||
                            column.semanticKey === "stt") &&
                            "text-center",
                        )}
                      >
                        {column.title}
                        {column.key === score?.scoreColumnKey ? (
                          <span className="ml-1 text-xs font-normal text-muted-foreground">
                            (≤ điểm tối đa)
                          </span>
                        ) : null}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sheet.rows.map((row, index) => (
                    <TableRow key={row.criterionId}>
                      {columns.map((column) => {
                        const errorKey = `${row.criterionId}:${column.key}`;

                        if (column.semanticKey === "stt") {
                          return (
                            <TableCell
                              key={column.key}
                              className="text-center align-top tabular-nums"
                            >
                              {index + 1}
                            </TableCell>
                          );
                        }
                        if (column.semanticKey === "criterion") {
                          return (
                            <TableCell
                              key={column.key}
                              className="whitespace-normal align-top text-sm"
                            >
                              {row.criterionName}
                            </TableCell>
                          );
                        }
                        if (column.semanticKey === "criterion_note") {
                          return (
                            <TableCell
                              key={column.key}
                              className="whitespace-normal align-top text-xs text-muted-foreground"
                            >
                              {row.criterionNote}
                            </TableCell>
                          );
                        }
                        if (column.semanticKey === "criterion_max_score") {
                          return (
                            <TableCell
                              key={column.key}
                              className="text-center align-top tabular-nums"
                            >
                              {formatScore(row.maxScore)}
                            </TableCell>
                          );
                        }

                        const value = String(
                          row.fieldValues?.[column.key] ?? "",
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
                                /* Khoá theo số bản: server trả bảng mới là ô
                                   dựng lại với giá trị mới, không cần effect
                                   đồng bộ. */
                                key={`${row.criterionId}:${column.key}:${sheet.version}`}
                                column={column}
                                value={value}
                                catalogs={{}}
                                disabled={savingKey === errorKey}
                                invalid={errorKey in cellErrors}
                                onCommit={(next) =>
                                  void saveCell(row, column, next)
                                }
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
                    </TableRow>
                  ))}

                  {/* Dòng tổng như mẫu giấy - chỗ đọc ra "24/30". */}
                  <TableRow className="border-t-2 bg-muted/40 font-medium hover:bg-inherit">
                    {columns.map((column, colIndex) => {
                      if (colIndex === 0) {
                        return (
                          <TableCell key={column.key} colSpan={1}>
                            Tổng
                          </TableCell>
                        );
                      }
                      if (column.semanticKey === "criterion_max_score") {
                        return (
                          <TableCell
                            key={column.key}
                            className="text-center tabular-nums"
                          >
                            {formatScore(score?.max ?? 0)}
                          </TableCell>
                        );
                      }
                      if (column.key === score?.scoreColumnKey) {
                        return (
                          <TableCell
                            key={column.key}
                            className={cn(
                              "text-center tabular-nums",
                              tone.text,
                            )}
                          >
                            {score?.total === null || score?.total === undefined
                              ? "-"
                              : formatScore(score.total)}
                          </TableCell>
                        );
                      }
                      return <TableCell key={column.key} />;
                    })}
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}

          {inputCols.length === 0 && template ? (
            <p className="text-xs text-muted-foreground">
              Mẫu này không có cột nào để chấm - chỉ có các cột chép từ danh
              mục.
            </p>
          ) : null}

          {/* ------------------------------------------------- nhật ký */}
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
                      <span className="line-through">
                        {edit.from || "trống"}
                      </span>
                      {" → "}
                      <strong className="text-foreground">
                        {edit.to || "trống"}
                      </strong>
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
