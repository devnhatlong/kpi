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
 * Chỉ huy đã chấm khác số cán bộ tự khai thì nói rõ ở tooltip - bảng để một
 * con số, nhưng người duyệt vẫn phải tra được đã hạ hay nâng bao nhiêu.
 */
function scoreHint(entry: ReportEntry): string | undefined {
  if (
    entry.score === null ||
    entry.selfScore === null ||
    entry.selfScore === entry.score
  ) {
    return undefined;
  }
  return `Chỉ huy chấm lại - cán bộ tự chấm ${formatScoreNumber(entry.selfScore)}`;
}

/** Ô số căn phải; ô trống để gạch chứ không hiện 0 giả. */
function NumberCell({
  value,
  strong = false,
  hint,
}: {
  value: number | null;
  strong?: boolean;
  hint?: string;
}) {
  return (
    <TableCell
      className={cn(
        "text-right align-middle text-sm tabular-nums",
        strong ? "font-medium" : "text-muted-foreground",
      )}
      title={hint}
    >
      {scoreText(value)}
    </TableCell>
  );
}

/**
 * Dòng này ở đâu ra.
 *
 * Không ghi "Đã hoàn thành": báo cáo tổng hợp vốn chỉ lấy việc đã xác nhận
 * hoàn thành nên dòng nào cũng vậy, cột không nói thêm được gì. Thứ người đọc
 * cần biết là số này có bản ghi KPI đứng sau hay do người lập gõ tay - gõ tay
 * thì không tra ngược được về nhật ký tiến độ và điểm đã chấm.
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

  const columnCount = 9 + (showAxis ? 1 : 0) + (editable ? 1 : 0);
  const total = groups.reduce((sum, group) => sum + group.entries.length, 0);

  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <Table className={showAxis ? "min-w-[1420px]" : "min-w-[1260px]"}>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="min-w-[240px]">Nhiệm vụ ({total})</TableHead>
            <TableHead className="w-[130px]" title="Số liệu lấy từ đâu ra">
              Nguồn số liệu
            </TableHead>
            <TableHead className="w-[160px]">Cán bộ</TableHead>
            {showAxis ? (
              <TableHead className="w-[150px]">Trục</TableHead>
            ) : null}
            <TableHead className="w-[100px] text-right">Điểm chuẩn</TableHead>
            {/* Cặp % - điểm của từng nhóm, để đọc ra được vì sao điểm bằng
                chừng đó thay vì phải tự nhân nhẩm với điểm chuẩn. */}
            <TableHead className="w-[150px]">Tiến độ %</TableHead>
            <TableHead className="w-[110px] text-right">Điểm tiến độ</TableHead>
            <TableHead className="w-[110px]">Chất lượng %</TableHead>
            <TableHead className="w-[120px] text-right">
              Điểm chất lượng
            </TableHead>
            <TableHead className="w-[90px] text-right">Điểm</TableHead>
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
                            cộng mấy con số ở cột "Điểm" bên dưới. */}
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
                        <NumberCell value={entry.baseScore} />

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
                        <NumberCell value={entry.progressScore} />

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
                        <NumberCell value={entry.qualityScore} />

                        {/* Điểm chốt của dòng: chỉ huy chấm lại thì lấy số của
                            chỉ huy. Số gốc của cán bộ nằm ở tooltip. */}
                        <NumberCell
                          value={entry.score}
                          strong
                          hint={scoreHint(entry)}
                        />
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
