"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { ChevronRight, ClipboardCheck, ExternalLink } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fetchTeamReportCriteria } from "@/features/team-report/api";
import { scoreTone } from "@/features/team-report/status-styles";
import {
  formatScore,
  type TeamReportCriteriaData,
} from "@/features/team-report/types";
import { cn } from "@/lib/utils";

function monthLabel(month: string): string {
  const [y, m] = month.split("-");
  return `${m}/${y}`;
}

/**
 * Bảng A của tháng thuộc kỳ báo cáo - lấy THÁNG MỚI NHẤT ĐÃ CHẤM trong kỳ.
 *
 * Kỳ tuần thì chỉ có một tháng; kỳ quý, năm trải qua nhiều tháng mà bảng A
 * tháng nào cũng có, lấy tháng mới nhất là cách bản cũ vẫn làm. Không tháng nào
 * trong kỳ đã chấm thì bày tháng cuối kỳ (bảng trống) để người dùng biết là
 * chưa chấm chứ không phải hệ thống không có gì.
 */
async function loadCriteriaOfPeriod(
  fromDate: string,
  toDate: string,
): Promise<TeamReportCriteriaData> {
  const fromMonth = fromDate.slice(0, 7);
  const toMonth = toDate.slice(0, 7);
  const last = await fetchTeamReportCriteria(toMonth);
  if (last.sheet.saved) return last;

  const scored = (last.months ?? [])
    .filter((month) => month >= fromMonth && month <= toMonth)
    .sort()
    .pop();
  if (!scored || scored === toMonth) return last;
  return fetchTeamReportCriteria(scored);
}

/**
 * Khối A bày kèm trong bản tổng hợp của ĐỘI - chỉ để đọc, THU GỌN sẵn.
 *
 * Không nằm trong bản chụp và không đi lên cấp trên: bảng A là đánh giá chung
 * của tháng, có đường đi riêng. Ở đây chỉ để người lập nhìn được cả A lẫn B
 * trên cùng một màn trước khi trình.
 */
export function TeamReportCriteriaPreview({
  fromDate,
  toDate,
}: {
  fromDate: string;
  toDate: string;
}) {
  const [open, setOpen] = useState(false);

  const { data } = useSWR(
    ["team-report", "criteria-of-period", fromDate, toDate] as const,
    () => loadCriteriaOfPeriod(fromDate, toDate),
    { revalidateOnFocus: false },
  );

  if (!data) return null;

  const { sheet, template, score } = data;
  const columns = (template?.columns ?? []).filter(
    (column) => column.visible && column.semanticKey !== "criterion_note",
  );
  const tone = scoreTone(
    score.total !== null && score.max > 0 ? score.total / score.max : null,
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1 rounded-md border pr-1.5 transition-colors hover:bg-muted/60">
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="flex min-w-0 flex-1 cursor-pointer flex-wrap items-center gap-2 px-3 py-2.5 text-left"
        >
          <ChevronRight
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-90",
            )}
          />
          <ClipboardCheck className="size-4 shrink-0 text-muted-foreground" />
          <h3 className="font-display text-sm font-semibold">
            Khối A · Tiêu chí chung
          </h3>
          <Badge variant="secondary" className="font-normal tabular-nums">
            Tháng {monthLabel(sheet.periodMonth)}
          </Badge>
          {sheet.saved ? (
            <Badge
              variant="secondary"
              className={cn("whitespace-nowrap font-normal", tone.badge)}
            >
              {score.total === null
                ? "chưa có cột điểm"
                : formatScore(score.total)}
              /{score.max} điểm
            </Badge>
          ) : (
            <Badge variant="secondary" className="font-normal">
              Chưa chấm
            </Badge>
          )}
          <span className="ml-auto hidden text-xs text-muted-foreground sm:block">
            Chỉ để đối chiếu · không gửi kèm báo cáo này
          </span>
        </button>
        <Link
          href="/team-report/criteria"
          className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          title="Mở màn chấm bảng A"
        >
          <ExternalLink className="size-3.5" />
          <span className="hidden sm:inline">Chấm</span>
        </Link>
      </div>

      {open ? (
        !template ? (
          <p className="rounded-md border px-3 py-4 text-center text-sm text-muted-foreground">
            Chưa gán mẫu bảng cho khối A.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-inherit">
                  {columns.map((column) => (
                    <TableHead
                      key={column.key}
                      className={cn(
                        "align-middle",
                        column.semanticKey === "criterion" && "min-w-[20rem]",
                        column.semanticKey !== "criterion" && "text-center",
                      )}
                    >
                      {column.title}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sheet.rows.map((row, index) => (
                  <TableRow key={row.criterionId}>
                    {columns.map((column) => {
                      let text = "";
                      if (column.semanticKey === "stt")
                        text = String(index + 1);
                      else if (column.semanticKey === "criterion")
                        text = row.criterionName;
                      else if (column.semanticKey === "criterion_max_score")
                        text = formatScore(row.maxScore);
                      else {
                        const raw = row.fieldValues?.[column.key];
                        text =
                          column.dataType === "boolean"
                            ? String(raw ?? "") === "1"
                              ? "✓"
                              : ""
                            : raw === undefined || raw === null
                              ? ""
                              : String(raw);
                      }
                      return (
                        <TableCell
                          key={column.key}
                          className={cn(
                            "align-top text-sm",
                            column.semanticKey === "criterion"
                              ? "whitespace-normal"
                              : "text-center tabular-nums",
                            column.key === score.scoreColumnKey &&
                              "font-medium",
                          )}
                        >
                          {text}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
                <TableRow className="border-t-2 bg-muted/40 font-medium hover:bg-inherit">
                  {columns.map((column, colIndex) => (
                    <TableCell
                      key={column.key}
                      className={cn(
                        colIndex > 0 && "text-center tabular-nums",
                        column.key === score.scoreColumnKey && tone.text,
                      )}
                    >
                      {colIndex === 0
                        ? "Tổng"
                        : column.semanticKey === "criterion_max_score"
                          ? formatScore(score.max)
                          : column.key === score.scoreColumnKey
                            ? score.total === null
                              ? "-"
                              : formatScore(score.total)
                            : ""}
                    </TableCell>
                  ))}
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )
      ) : null}
    </div>
  );
}
