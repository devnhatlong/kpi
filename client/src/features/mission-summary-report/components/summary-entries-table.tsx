"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Eye,
  PencilLine,
  Trash2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatScoreNumber } from "@/features/personal-mission/board-cell";
import { PercentCell } from "@/features/personal-mission/components/mission-cells";
import { missionTone } from "@/features/personal-mission/status-styles";
import type {
  AxisFooter,
  EntryGroup,
  ReportEntry,
} from "@/features/mission-summary-report/report-entries";
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
  const fromMission = group.entries.filter((entry) => entry.kind === "MISSION");
  // Nhóm trộn cả hai kiểu (xem theo đơn vị) thì lấy bộ cột đầy đủ.
  return fromMission.length > 0 &&
    fromMission.every((entry) => !entry.tracksProgress)
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
 * Dòng lấy từ nhiệm vụ cá nhân là mặc định của báo cáo này nên không gắn nhãn -
 * đánh dấu mọi dòng thì cột nào cũng như cột nào, chẳng nói thêm được gì.
 * Chỉ dòng tự nhập mới cần chỉ mặt: số đó không tra ngược về nhật ký tiến độ
 * hay điểm chỉ huy đã chấm được.
 */
function SourceBadge({ kind }: { kind: ReportEntry["kind"] }) {
  if (kind === "MISSION") return null;
  return (
    <Badge
      variant="secondary"
      className={cn("font-normal", missionTone.warning.soft)}
      title="Người lập báo cáo tự nhập, không có nhiệm vụ nào đứng sau"
    >
      Tự nhập
    </Badge>
  );
}

/** Đạt / Không đạt của trục chấm theo mục. */
function ResultBadge({ entry }: { entry: ReportEntry }) {
  if (entry.kind === "MANUAL") {
    return (
      <span className="text-xs text-muted-foreground">Ngoài hệ thống</span>
    );
  }
  return (
    <Badge
      variant="secondary"
      className={cn(
        "font-normal",
        entry.failed ? missionTone.danger.soft : missionTone.success.soft,
      )}
    >
      {entry.failed ? "Không đạt" : "Đạt"}
    </Badge>
  );
}

/**
 * Ba dòng cuối bảng của một trục: "Tổng từng cột" → "Tổng điểm trục" → "Điểm
 * quy đổi".
 *
 * Số ở đây tính trên chính các cột phía trên, và bày luôn phép chia ra để người
 * duyệt cộng tay kiểm lại được chứ không phải tin vào một con số từ trên trời.
 */
function AxisFooterRows({
  footer,
  axisName,
  maxScore,
  percent,
  leadingSpan,
  columnCount,
  showTotal,
  trailing,
}: {
  footer: AxisFooter;
  axisName: string;
  maxScore: number | null;
  /** Bảng đang dùng bộ cột của trục chấm theo % hay của trục chấm theo mục. */
  percent: boolean;
  /** Số cột đầu bảng gộp lại làm nhãn dòng tổng. */
  leadingSpan: number;
  columnCount: number;
  showTotal: boolean;
  /** Số cột cuối bảng phải để trống (cột nút "Bỏ"). */
  trailing: number;
}) {
  const cell = (value: number | null) =>
    value === null ? "" : scoreText(value);
  const sumMode = footer.mode === "sum";
  /**
   * Phép vừa chạy, viết lại bằng số thật:
   * - tỉ lệ  : "[110/160 + 110/160] / 2"
   * - cộng dồn: "1 + 2 + 4" (điểm các mục, mục không đạt đã bằng 0)
   */
  const denominator = footer.denominator;
  const formula = sumMode
    ? // Một cột điểm duy nhất thì "= 1" chẳng giải thích thêm được gì.
      footer.parts.length > 1
      ? footer.parts.map((part) => formatScoreNumber(part.total)).join(" + ")
      : ""
    : denominator?.total && footer.parts.length
      ? `[${footer.parts
          .map(
            (part) =>
              `${formatScoreNumber(part.total)}/${formatScoreNumber(denominator.total!)}`,
          )
          .join(" + ")}] / ${footer.parts.length}`
      : "";
  /** Mẫu số của công thức lệch với cột "Điểm chuẩn" đang bày. */
  const mismatch =
    !sumMode &&
    denominator?.total != null &&
    footer.base != null &&
    denominator.total !== footer.base;
  /** Tên cột đang đóng vai tử số / mẫu số - mẫu số có thể khác cột Điểm chuẩn. */
  const formulaHint = sumMode
    ? `Cộng điểm các cột: ${footer.parts.map((part) => part.label).join(", ")}`
    : denominator
      ? `Tử số: ${footer.parts
          .map((part) => part.label)
          .join(", ")} · Mẫu số: ${denominator.label}`
      : undefined;

  return (
    <TableFooter className="bg-muted/40">
      <TableRow className="hover:bg-transparent">
        <TableCell colSpan={leadingSpan} className="font-medium">
          Tổng từng cột
        </TableCell>
        <TableCell className="text-right tabular-nums">
          {cell(footer.base)}
        </TableCell>
        {percent ? (
          <>
            <TableCell />
            <TableCell className="text-right tabular-nums">
              {cell(footer.progress)}
            </TableCell>
            <TableCell />
            <TableCell className="text-right tabular-nums">
              {cell(footer.quality)}
            </TableCell>
          </>
        ) : (
          // Bảng trục chấm theo mục: giữa "Điểm chuẩn" và "Điểm" chỉ có cột
          // Kết quả, không có gì để cộng.
          <TableCell />
        )}
        {showTotal ? (
          <TableCell className="text-right tabular-nums">
            {cell(footer.score)}
          </TableCell>
        ) : null}
        {trailing ? <TableCell /> : null}
      </TableRow>

      <TableRow className="hover:bg-transparent">
        <TableCell
          colSpan={columnCount - 1 - trailing}
          className="font-medium"
          title={formulaHint}
        >
          Tổng điểm trục {axisName}
          {formula ? (
            <span className="ml-2 font-normal text-muted-foreground">
              = {formula}
              {/* Mẫu số của công thức có thể là cột khác cột "Điểm chuẩn" đang
                  bày - nói tên ra thì mới hết ngờ số ở đâu chui ra. */}
              {!sumMode && denominator ? ` · mẫu số: ${denominator.label}` : ""}
            </span>
          ) : null}
        </TableCell>
        <TableCell className="text-right tabular-nums">
          {sumMode
            ? scoreText(footer.score)
            : footer.ratio === null
              ? "-"
              : formatScoreNumber(footer.ratio, 4)}
        </TableCell>
        {trailing ? <TableCell /> : null}
      </TableRow>

      {/*
        Mẫu số của công thức không phải cột "Điểm chuẩn" đang bày thì hai con số
        trong bảng không khớp nhau - nói thẳng ra chỗ lệch, đừng để người đọc
        ngồi dò xem 187 ở đâu chui ra.
      */}
      {mismatch ? (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={columnCount} className="py-1.5">
            <span className={cn("text-xs", missionTone.warning.text)}>
              Công thức đang chia cho cột &quot;{denominator?.label}&quot; (Σ{" "}
              {scoreText(denominator?.total ?? null)}), không phải cột Điểm
              chuẩn ở trên (Σ {scoreText(footer.base)}). Muốn chia theo điểm
              chuẩn thì đổi &quot;Cột mẫu số (A)&quot; trong Cấu hình form nhiệm
              vụ › Mẫu bảng nhiệm vụ.
            </span>
          </TableCell>
        </TableRow>
      ) : null}

      <TableRow className="hover:bg-transparent">
        <TableCell colSpan={columnCount - 1 - trailing} className="font-medium">
          Điểm quy đổi
          <span className="ml-2 font-normal text-muted-foreground">
            {sumMode
              ? `= Tổng điểm trục, chặn ở ${maxScore ?? 0}`
              : `= Tổng điểm trục × ${maxScore ?? 0}`}
          </span>
        </TableCell>
        <TableCell
          className={cn(
            "text-right font-semibold tabular-nums",
            missionTone.success.text,
          )}
        >
          {footer.converted === null
            ? "-"
            : `${formatScoreNumber(footer.converted)}${maxScore ? ` / ${maxScore}` : ""}`}
        </TableCell>
        {trailing ? <TableCell /> : null}
      </TableRow>
    </TableFooter>
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
  /** Mở chi tiết một dòng - dòng nhiệm vụ mở nhiệm vụ, dòng tự nhập mở form sửa. */
  onOpen?: (entry: ReportEntry) => void;
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
  onOpen,
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

  /*
    Dòng chốt của cả báo cáo: cộng điểm quy đổi của các trục CÓ CÔNG THỨC. Trục
    chưa cấu hình công thức thì không có điểm nào để cộng, và cũng không được
    tính vào trần điểm - nếu không thì tổng nhìn như đang hụt.
  */
  const scoredAxes = groups.filter((group) => group.footer?.converted != null);
  const axisTotal = scoredAxes.reduce(
    (sum, group) => sum + (group.footer?.converted ?? 0),
    0,
  );
  const axisMaxTotal = scoredAxes.reduce(
    (sum, group) => sum + (group.maxScore ?? 0),
    0,
  );

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
          (percent ? 890 : 520) + (showAxis ? 150 : 0) + (showTotal ? 90 : 0);
        /*
          Đếm cột để dòng tổng gộp ô cho đúng. Bộ cột theo % có thêm bốn cột
          (tiến độ %, điểm tiến độ, chất lượng %, điểm chất lượng); bộ cột theo
          mục chỉ có một cột Kết quả.
        */
        // Cột thao tác có mặt khi mở được chi tiết hoặc bỏ được dòng.
        const hasActions = Boolean(onOpen) || editable;
        const columnCount =
          (percent ? 6 : 3) +
          (showAxis ? 1 : 0) +
          (showTotal ? 1 : 0) +
          (hasActions ? 1 : 0);

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
                  className={cn("font-normal", missionTone.info.soft)}
                >
                  {group.entries.length} nhiệm vụ
                </Badge>
                {/* Điểm là của TRỤC, tính trên tổng cột - không phải cộng mấy
                    con số ở cột "Điểm" bên dưới. */}
                {group.score !== null ? (
                  <span
                    className={cn(
                      "text-xs font-medium",
                      missionTone.success.text,
                    )}
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
                      {hasActions ? (
                        <TableHead className="w-[96px] text-right">
                          Thao tác
                        </TableHead>
                      ) : null}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {group.entries.map((entry) => (
                      <TableRow key={entry.key}>
                        <TableCell className="align-middle">
                          <p className="flex flex-wrap items-center gap-1.5 font-medium">
                            {entry.title}
                            {/* Dòng lấy từ nhiệm vụ là chuyện thường nên không gắn
                                nhãn; chỉ đánh dấu dòng người lập gõ tay, vì số
                                đó không tra ngược về nhiệm vụ nào được. */}
                            <SourceBadge kind={entry.kind} />
                          </p>
                          {entry.subtitle ? (
                            <p className="text-xs text-muted-foreground">
                              {entry.subtitle}
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
                                  missionTone.neutral.soft,
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
                                  Ngoài hệ thống
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
                                    missionTone.neutral.soft,
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

                        {hasActions ? (
                          <TableCell className="text-right align-middle whitespace-nowrap">
                            {onOpen ? (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="size-8"
                                title={
                                  entry.kind === "MANUAL"
                                    ? "Sửa nhiệm vụ tự nhập"
                                    : "Xem chi tiết nhiệm vụ"
                                }
                                onClick={() => onOpen(entry)}
                              >
                                {entry.kind === "MANUAL" ? (
                                  <PencilLine className="size-4" />
                                ) : (
                                  <Eye className="size-4" />
                                )}
                              </Button>
                            ) : null}
                            {editable ? (
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
                            ) : null}
                          </TableCell>
                        ) : null}
                      </TableRow>
                    ))}
                  </TableBody>

                  {/* Ba dòng cuối theo đúng khuôn công thức của mẫu. Chỉ trục
                      đã bật công thức mới có - trục chấm theo mục thì cộng
                      thẳng điểm, không có tỉ lệ nào để quy đổi. */}
                  {group.footer ? (
                    <AxisFooterRows
                      footer={group.footer}
                      axisName={group.label}
                      maxScore={group.maxScore}
                      percent={percent}
                      leadingSpan={1 + (showAxis ? 1 : 0)}
                      columnCount={columnCount}
                      showTotal={showTotal}
                      trailing={hasActions ? 1 : 0}
                    />
                  ) : null}
                </Table>
              </div>
            ) : null}
          </div>
        );
      })}

      {/* Dòng chốt của cả báo cáo - cộng điểm quy đổi của các trục. */}
      {scoredAxes.length > 0 ? (
        <div
          className={cn(
            "flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2.5",
            missionTone.success.soft,
          )}
        >
          <span className="text-sm font-semibold text-foreground">
            Tổng điểm các trục
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              = cộng dòng &quot;Điểm quy đổi&quot; của {scoredAxes.length} trục
              có công thức
            </span>
          </span>
          <span className="text-base font-semibold tabular-nums">
            {formatScoreNumber(axisTotal)}
            {axisMaxTotal ? (
              <span className="text-muted-foreground">
                {" "}
                / {formatScoreNumber(axisMaxTotal)}
              </span>
            ) : null}
          </span>
        </div>
      ) : null}
    </div>
  );
}
