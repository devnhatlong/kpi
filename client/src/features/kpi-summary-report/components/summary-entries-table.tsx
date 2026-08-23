"use client";

import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatScoreNumber } from "@/features/personal-kpi/board-cell";
import { PercentCell } from "@/features/personal-kpi/components/kpi-cells";
import { kpiTone } from "@/features/personal-kpi/status-styles";
import type {
  EntryGroup,
  ReportEntry,
} from "@/features/kpi-summary-report/report-entries";
import { cn } from "@/lib/utils";

/** Điểm gọn mắt, ô trống thì để gạch chứ không hiện số 0 giả. */
function scoreText(value: number | null): string {
  return value === null ? "-" : formatScoreNumber(value);
}

/**
 * Dòng này ở đâu ra.
 *
 * Không ghi "Đã hoàn thành": báo cáo tổng hợp vốn chỉ lấy việc đã xác nhận
 * hoàn thành nên dòng nào cũng vậy, cột không nói thêm được gì. Thứ người đọc
 * cần biết là số này có bản ghi KPI đứng sau hay do người lập gõ tay - gõ tay
 * thì không tra ngược được về nhật ký tiến độ và điểm chỉ huy đã chấm.
 */
function SourceBadge({ kind }: { kind: ReportEntry["kind"] }) {
  const fromKpi = kind === "KPI";
  return (
    <Badge
      variant="secondary"
      className={cn(
        "font-normal",
        fromKpi ? kpiTone.success.soft : kpiTone.warning.soft,
      )}
      title={
        fromKpi
          ? "Lấy từ nhiệm vụ KPI cá nhân đã được chỉ huy xác nhận hoàn thành"
          : "Người lập báo cáo tự nhập, không có nhiệm vụ KPI nào đứng sau"
      }
    >
      {fromKpi ? "KPI cá nhân" : "Tự nhập"}
    </Badge>
  );
}

type SummaryEntriesTableProps = {
  groups: EntryGroup[];
  /** Hiện dòng tiêu đề nhóm (thu gọn được). Xem dạng danh sách thì tắt. */
  grouped?: boolean;
  /**
   * Hiện cột Trục. Gom nhóm theo trục thì tắt: tiêu đề nhóm ngay phía trên đã
   * nói rồi, để thêm một cột lặp lại chỉ tốn chỗ.
   */
  showAxis?: boolean;
  /** Còn sửa được thì mỗi dòng có nút bỏ khỏi báo cáo. */
  editable?: boolean;
  busy?: boolean;
  onRemove?: (entry: ReportEntry) => void;
};

/**
 * Bảng nhiệm vụ trong báo cáo tổng hợp.
 *
 * Ba cách xem (theo trục / theo đơn vị / danh sách) chỉ khác nhau ở cách gom
 * nhóm, nên dùng chung đúng một bảng - cột và cách đọc số ở mọi cách xem phải
 * giống hệt nhau.
 */
export function SummaryEntriesTable({
  groups,
  grouped = true,
  showAxis = true,
  editable = false,
  busy = false,
  onRemove,
}: SummaryEntriesTableProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggle = (key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const columnCount = 6 + (showAxis ? 1 : 0) + (editable ? 1 : 0);
  const total = groups.reduce((sum, group) => sum + group.entries.length, 0);

  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <Table className={showAxis ? "min-w-[1080px]" : "min-w-[920px]"}>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="min-w-[260px]">Nhiệm vụ ({total})</TableHead>
            <TableHead className="w-[130px]" title="Số liệu lấy từ đâu ra">
              Nguồn số liệu
            </TableHead>
            <TableHead className="w-[170px]">Cán bộ</TableHead>
            {showAxis ? (
              <TableHead className="w-[170px]">Trục</TableHead>
            ) : null}
            <TableHead className="w-[160px]">Kết quả</TableHead>
            <TableHead className="w-[120px]">Điểm chỉ huy</TableHead>
            <TableHead className="w-[110px]">Chất lượng</TableHead>
            {editable ? (
              <TableHead className="w-[60px] text-right">Bỏ</TableHead>
            ) : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={columnCount}
                className="py-10 text-center text-sm text-muted-foreground"
              >
                Chưa có nhiệm vụ nào trong báo cáo.
              </TableCell>
            </TableRow>
          ) : null}

          {groups.map((group) => {
            const open = !collapsed.has(group.key);
            return (
              <Fragment key={group.key}>
                {grouped ? (
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableCell colSpan={columnCount} className="py-2">
                      <button
                        type="button"
                        onClick={() => toggle(group.key)}
                        className="flex items-center gap-2 text-sm font-semibold"
                      >
                        {open ? (
                          <ChevronDown className="size-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="size-4 text-muted-foreground" />
                        )}
                        {group.label}
                        <Badge
                          variant="secondary"
                          className={cn("font-normal", kpiTone.info.soft)}
                        >
                          {group.entries.length} nhiệm vụ
                        </Badge>
                        {/* Điểm là của TRỤC, tính trên tổng cột - không phải
                            cộng mấy con số ở cột "Điểm chỉ huy" bên dưới. */}
                        {group.score !== null ? (
                          <span
                            className={cn(
                              "text-xs font-medium",
                              kpiTone.success.text,
                            )}
                            title="Điểm quy đổi của trục, tính trên tổng cột của cả trục"
                          >
                            Điểm {formatScoreNumber(group.score)}
                            {group.maxScore ? ` / ${group.maxScore}` : ""}
                          </span>
                        ) : null}
                      </button>
                    </TableCell>
                  </TableRow>
                ) : null}

                {open
                  ? group.entries.map((entry) => (
                      <TableRow key={entry.key}>
                        <TableCell className="align-middle">
                          <p className="font-medium">{entry.title}</p>
                          {entry.subtitle ? (
                            <p className="text-xs text-muted-foreground">
                              {entry.subtitle}
                            </p>
                          ) : null}
                        </TableCell>
                        <TableCell className="align-middle">
                          <SourceBadge kind={entry.kind} />
                        </TableCell>
                        <TableCell className="align-middle text-sm">
                          <p>{entry.ownerName || "-"}</p>
                          {entry.departmentName ? (
                            <p className="text-xs text-muted-foreground">
                              {entry.departmentName}
                            </p>
                          ) : null}
                        </TableCell>
                        {showAxis ? (
                          <TableCell className="align-middle">
                            {entry.axisName ? (
                              <Badge
                                variant="secondary"
                                className={cn(
                                  "font-normal",
                                  kpiTone.neutral.soft,
                                )}
                              >
                                {entry.axisName}
                              </Badge>
                            ) : (
                              <span className="text-sm text-muted-foreground">
                                -
                              </span>
                            )}
                          </TableCell>
                        ) : null}
                        <TableCell className="align-middle">
                          {/* Trục chấm theo mục không có %: nói Đạt / Không đạt
                              thay vì vẽ thanh tiến độ rỗng. */}
                          {entry.kind === "MANUAL" ? (
                            <span className="text-xs text-muted-foreground">
                              Ngoài KPI
                            </span>
                          ) : entry.tracksProgress ? (
                            <PercentCell percent={entry.progressPercent} />
                          ) : (
                            <Badge
                              variant="secondary"
                              className={cn(
                                "font-normal",
                                entry.failed
                                  ? kpiTone.danger.soft
                                  : kpiTone.success.soft,
                              )}
                            >
                              {entry.failed ? "Không đạt" : "Đạt"}
                            </Badge>
                          )}
                        </TableCell>
                        {/* Một con số thôi. Điểm chuẩn của dòng chuyển xuống
                            tooltip: để cạnh nhau thì đọc thành phân số, mà hai
                            số này chỉ cùng đơn vị khi mẫu khai tử số là cột
                            điểm - khai nhầm cột phần trăm là ra "50 / 49". */}
                        <TableCell
                          className="align-middle text-sm font-medium tabular-nums"
                          title={
                            entry.baseScore === null
                              ? undefined
                              : `Điểm chuẩn của nhiệm vụ: ${formatScoreNumber(entry.baseScore)}`
                          }
                        >
                          {scoreText(entry.score)}
                        </TableCell>
                        <TableCell className="align-middle">
                          {entry.qualityPercent === null ? (
                            <span className="text-sm text-muted-foreground">
                              -
                            </span>
                          ) : (
                            <Badge
                              variant="secondary"
                              className={cn(
                                "font-normal tabular-nums",
                                kpiTone.neutral.soft,
                              )}
                            >
                              {formatScoreNumber(entry.qualityPercent)}%
                            </Badge>
                          )}
                        </TableCell>
                        {editable ? (
                          <TableCell className="text-right align-middle">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-8 text-destructive hover:text-destructive"
                              disabled={busy}
                              title="Bỏ nhiệm vụ này khỏi báo cáo"
                              onClick={() => onRemove?.(entry)}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </TableCell>
                        ) : null}
                      </TableRow>
                    ))
                  : null}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
