"use client";

import { useState } from "react";
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

/**
 * Hai kiểu trục cần hai bộ cột khác hẳn nhau:
 * - PERCENT: trục 1, 3, 4 - chấm theo % tiến độ và % chất lượng, mỗi nhóm kèm
 *   một cột điểm quy đổi.
 * - RESULT : trục 2 - chấm Đạt / Không đạt rồi cho điểm thẳng, không có % nào.
 *
 * Nhét chung một bảng thì trục 2 để trống bốn cột phần trăm, đọc như dữ liệu bị
 * thiếu chứ không phải "trục này chấm kiểu khác".
 */
type GroupKind = "PERCENT" | "RESULT";

function groupKind(group: EntryGroup): GroupKind {
  const fromKpi = group.entries.filter((entry) => entry.kind === "KPI");
  // Nhóm trộn cả hai kiểu (xem theo đơn vị) thì lấy bộ cột đầy đủ.
  return fromKpi.length > 0 && fromKpi.every((entry) => !entry.tracksProgress)
    ? "RESULT"
    : "PERCENT";
}

/** Điểm gọn mắt, ô trống thì để gạch chứ không hiện số 0 giả. */
function scoreText(value: number | null): string {
  return value === null ? "-" : formatScoreNumber(value);
}

/**
 * Chỉ huy đã chấm khác số cán bộ tự khai thì nói rõ ở tooltip - bảng để một
 * con số, nhưng người duyệt vẫn phải tra được đã hạ hay nâng bao nhiêu.
 */
function scoreHint(
  scored: number | null,
  self: number | null,
): string | undefined {
  if (scored === null || self === null || self === scored) return undefined;
  return `Chỉ huy chấm lại - cán bộ tự chấm ${formatScoreNumber(self)}`;
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
 * Nhãn cho dòng do người lập gõ tay.
 *
 * Dòng lấy từ KPI cá nhân là mặc định của báo cáo này nên không gắn nhãn -
 * đánh dấu mọi dòng thì cột nào cũng như cột nào, chẳng nói thêm được gì.
 * Chỉ dòng tự nhập mới cần chỉ mặt: số đó không tra ngược về nhật ký tiến độ
 * hay điểm chỉ huy đã chấm được.
 */
function SourceBadge({ kind }: { kind: ReportEntry["kind"] }) {
  if (kind === "KPI") return null;
  return (
    <Badge
      variant="secondary"
      className={cn("font-normal", kpiTone.warning.soft)}
      title="Người lập báo cáo tự nhập, không có nhiệm vụ KPI nào đứng sau"
    >
      Tự nhập
    </Badge>
  );
}

/** Đạt / Không đạt của trục chấm theo mục. */
function ResultBadge({ entry }: { entry: ReportEntry }) {
  if (entry.kind === "MANUAL") {
    return <span className="text-xs text-muted-foreground">Ngoài KPI</span>;
  }
  return (
    <Badge
      variant="secondary"
      className={cn(
        "font-normal",
        entry.failed ? kpiTone.danger.soft : kpiTone.success.soft,
      )}
    >
      {entry.failed ? "Không đạt" : "Đạt"}
    </Badge>
  );
}

type SummaryEntriesTableProps = {
  groups: EntryGroup[];
  /** Hiện thanh tiêu đề nhóm (thu gọn được). Xem dạng danh sách thì tắt. */
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
 * Nhiệm vụ trong báo cáo tổng hợp - MỖI NHÓM MỘT BẢNG.
 *
 * Tách bảng theo nhóm để trục chấm theo mục (trục 2) bày đúng bộ cột của nó.
 * Các bảng cùng kiểu dùng chung một bộ bề rộng cột nên đặt cạnh nhau vẫn thẳng
 * hàng, đọc như một bảng liền mạch.
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

  if (groups.length === 0) {
    return (
      <div className="rounded-lg border bg-card py-10 text-center text-sm text-muted-foreground">
        Chưa có nhiệm vụ nào trong báo cáo.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {groups.map((group) => {
        const kind = groupKind(group);
        const open = !collapsed.has(group.key);
        const percent = kind === "PERCENT";
        /*
          Cột "Điểm" gộp chỉ có nghĩa khi trong nhóm còn dòng mà hai cột điểm
          tiến độ / chất lượng không nói thay được: dòng của trục chấm theo mục
          và dòng tự nhập. Nhóm thuần trục chấm theo % thì nó chỉ là trung bình
          của hai cột ngay bên trái - thừa.
        */
        const showTotal = group.entries.some(
          (entry) => entry.kind === "MANUAL" || !entry.tracksProgress,
        );
        const minWidth =
          (percent ? 1090 : 720) + (showAxis ? 150 : 0) + (showTotal ? 90 : 0);

        return (
          <div key={group.key} className="overflow-hidden rounded-lg border">
            {grouped ? (
              <button
                type="button"
                onClick={() => toggle(group.key)}
                className="flex w-full items-center gap-2 bg-muted/40 px-3 py-2 text-left text-sm font-semibold hover:bg-muted/60"
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
                {/* Điểm là của TRỤC, tính trên tổng cột - không phải cộng mấy
                    con số ở cột "Điểm" bên dưới. */}
                {group.score !== null ? (
                  <span
                    className={cn("text-xs font-medium", kpiTone.success.text)}
                    title="Điểm quy đổi của trục, tính trên tổng cột của cả trục"
                  >
                    Điểm {formatScoreNumber(group.score)}
                    {group.maxScore ? ` / ${group.maxScore}` : ""}
                  </span>
                ) : null}
                {!percent ? (
                  <span className="text-xs font-normal text-muted-foreground">
                    · chấm theo mục Đạt / Không đạt
                  </span>
                ) : null}
              </button>
            ) : null}

            {open ? (
              <div className="overflow-x-auto bg-card">
                <Table style={{ minWidth }}>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="min-w-[240px]">
                        Nhiệm vụ
                        {grouped ? "" : ` (${group.entries.length})`}
                      </TableHead>
                      <TableHead className="w-[200px]">Cán bộ</TableHead>
                      {showAxis ? (
                        <TableHead className="w-[150px]">Trục</TableHead>
                      ) : null}
                      <TableHead className="w-[100px] text-right">
                        Điểm chuẩn
                      </TableHead>
                      {percent ? (
                        <>
                          {/* Cặp % - điểm của từng nhóm, để đọc ra được vì sao
                              điểm bằng chừng đó. */}
                          <TableHead className="w-[150px]">Tiến độ %</TableHead>
                          <TableHead className="w-[110px] text-right">
                            Điểm tiến độ
                          </TableHead>
                          <TableHead className="w-[110px]">
                            Chất lượng %
                          </TableHead>
                          <TableHead className="w-[120px] text-right">
                            Điểm chất lượng
                          </TableHead>
                        </>
                      ) : (
                        <TableHead className="w-[130px]">Kết quả</TableHead>
                      )}
                      {showTotal ? (
                        <TableHead
                          className="w-[90px] text-right"
                          title={
                            percent
                              ? "Điểm đạt của nhiệm vụ: trung bình Điểm tiến độ và Điểm chất lượng, trên thang Điểm chuẩn"
                              : "Điểm đạt của nhiệm vụ: tổng điểm các mục đã chấm"
                          }
                        >
                          Điểm
                        </TableHead>
                      ) : null}
                      {editable ? (
                        <TableHead className="w-[60px] text-right">
                          Bỏ
                        </TableHead>
                      ) : null}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {group.entries.map((entry) => (
                      <TableRow key={entry.key}>
                        <TableCell className="align-middle">
                          <p className="font-medium">{entry.title}</p>
                          {entry.subtitle ? (
                            <p className="text-xs text-muted-foreground">
                              {entry.subtitle}
                            </p>
                          ) : null}
                        </TableCell>
                        <TableCell className="align-middle text-sm">
                          <p className="flex flex-wrap items-center gap-1.5">
                            {entry.ownerName || "-"}
                            {/* Dòng lấy từ KPI là chuyện thường nên không gắn
                                nhãn; chỉ đánh dấu dòng người lập gõ tay, vì số
                                đó không tra ngược về nhiệm vụ nào được. */}
                            <SourceBadge kind={entry.kind} />
                          </p>
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

                        {percent ? (
                          <>
                            <TableCell className="align-middle">
                              {entry.kind === "MANUAL" ? (
                                <span className="text-xs text-muted-foreground">
                                  Ngoài KPI
                                </span>
                              ) : entry.tracksProgress ? (
                                <PercentCell percent={entry.progressPercent} />
                              ) : (
                                <ResultBadge entry={entry} />
                              )}
                            </TableCell>
                            <NumberCell
                              value={entry.progressScore}
                              hint={scoreHint(
                                entry.progressScore,
                                entry.progressSelfScore,
                              )}
                            />
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
                            <NumberCell
                              value={entry.qualityScore}
                              hint={scoreHint(
                                entry.qualityScore,
                                entry.qualitySelfScore,
                              )}
                            />
                          </>
                        ) : (
                          <TableCell className="align-middle">
                            <ResultBadge entry={entry} />
                          </TableCell>
                        )}

                        {/* Điểm chốt của dòng: chỉ huy chấm lại thì lấy số của
                            chỉ huy. Số gốc của cán bộ nằm ở tooltip. */}
                        {showTotal ? (
                          <NumberCell
                            value={entry.score}
                            strong
                            hint={scoreHint(entry.score, entry.selfScore)}
                          />
                        ) : null}

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
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
