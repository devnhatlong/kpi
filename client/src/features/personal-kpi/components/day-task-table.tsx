"use client";

import {
  ClipboardList,
  Eye,
  MoreHorizontal,
  Pencil,
  Send,
  SquarePen,
  Trash2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DeadlineCell,
  PercentCell,
  WorkStateBadge,
} from "@/features/personal-kpi/components/kpi-cells";
import {
  kpiTone,
  personalKpiStatusBadgeClass,
} from "@/features/personal-kpi/status-styles";
import {
  SILENCE_ALERT_DAYS,
  type DeadlineState,
  type ResultInfo,
  type TaskSummary,
  type WorkState,
} from "@/features/personal-kpi/task-summary";
import {
  PERSONAL_KPI_STATUS_LABEL,
  canDeletePersonalKpi,
  canEditPersonalKpi,
  canUpdateProgress,
  type PersonalKpiItem,
} from "@/features/personal-kpi/types";
import { formatYmd } from "@/lib/server-time";
import { cn } from "@/lib/utils";

export type DayTaskRow = {
  item: PersonalKpiItem;
  summary: TaskSummary;
  /** Kết quả Đạt / Không đạt của trục chấm theo mục - trục 2 đọc ở đây. */
  result: ResultInfo;
  deadline: DeadlineState | null;
  /** Trạng thái công việc theo KPI tiến độ, tách khỏi trạng thái duyệt. */
  work: WorkState;
  /** Số ngày không ai cập nhật tiến độ; null = chưa có mốc nào. */
  silence: number | null;
  /** Chuỗi gộp mọi thứ tìm được của dòng - lọc theo ô tìm kiếm. */
  haystack: string;
};

/**
 * Cảnh báo về hạn cho cột "Tình trạng thực hiện".
 *
 * Việc đã xong tiến độ hoặc cấp trên đã chốt thì thôi kêu - quá ngày mà việc
 * xong rồi thì không còn là nợ.
 */
function deadlineHealth(row: DayTaskRow) {
  const settled =
    row.work === "DONE" ||
    row.item.status === "APPROVED" ||
    row.item.status === "COMPLETED";
  if (settled || !row.deadline) return null;

  if (row.deadline.days < 0) {
    return { label: "Trễ hạn", className: kpiTone.danger.soft };
  }
  if (row.deadline.days <= 2) {
    return { label: "Sắp đến hạn", className: kpiTone.warning.soft };
  }
  return null;
}

/** Việc chưa xong mà lâu rồi không ai đụng vào tiến độ. */
export function isSilent(row: DayTaskRow): boolean {
  if (row.work === "DONE" || row.item.status === "COMPLETED") return false;
  return row.silence !== null && row.silence >= SILENCE_ALERT_DAYS;
}

type DayTaskTableProps = {
  rows: DayTaskRow[];
  /** Nhãn cột hạn - lấy theo tên cột ngày trong mẫu KPI. */
  deadlineHeader: string;
  loading?: boolean;
  emptyText: string;
  /** Dòng đang chờ một thao tác chạy xong - khoá nút của riêng dòng đó. */
  actingId: string | null;
  /** Ẩn dòng tiêu đề - dùng khi bảng nằm trong một nhóm đã có tiêu đề riêng. */
  hideHeader?: boolean;
  /**
   * Hiện ngày báo cáo của từng dòng. Bật khi danh sách trải nhiều ngày - không
   * có nó thì việc hôm nay và việc tuần trước nằm lẫn nhau, không phân biệt nổi.
   */
  showReportDate?: boolean;
  onUpdateProgress: (item: PersonalKpiItem) => void;
  onEditDetail: (item: PersonalKpiItem) => void;
  onSend: (item: PersonalKpiItem) => void;
  onDelete: (item: PersonalKpiItem) => void;
};

/**
 * Bảng nhiệm vụ - dùng chung cho cả xem phẳng lẫn xem theo nhóm.
 *
 * Nhóm nào toàn nhiệm vụ của trục chấm theo mục (trục 2) thì đổi bộ cột: trục
 * kiểu đó không có tiến độ, không có chất lượng %, để nguyên thì mỗi dòng ghi
 * "Không theo dõi %" hai lần mà chẳng nói được kết quả ra sao. Đúng luật đang
 * dùng ở màn theo dõi của chỉ huy.
 */
export function DayTaskTable({
  rows,
  deadlineHeader,
  loading = false,
  emptyText,
  actingId,
  hideHeader = false,
  showReportDate = false,
  onUpdateProgress,
  onEditDetail,
  onSend,
  onDelete,
}: DayTaskTableProps) {
  const resultOnly =
    rows.length > 0 && rows.every((row) => !row.summary.tracksProgress);
  // Mẫu của trục chấm theo mục thường không có cột hạn - có dòng nào khai hạn
  // thì mới giữ cột lại.
  const showDeadline =
    !resultOnly || rows.some((row) => Boolean(row.summary.deadline));
  const columnCount = resultOnly ? (showDeadline ? 8 : 7) : 9;

  return (
    <Table>
      {hideHeader ? null : (
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[280px]">Nhiệm vụ</TableHead>
            <TableHead className="w-[80px]">Trục</TableHead>
            {resultOnly ? (
              <>
                <TableHead className="w-[150px]">Kết quả</TableHead>
                <TableHead className="w-[100px] text-right">Điểm</TableHead>
              </>
            ) : (
              <>
                <TableHead className="w-[160px]">Tiến độ nhiệm vụ</TableHead>
                <TableHead className="w-[160px]">Chất lượng nhiệm vụ</TableHead>
              </>
            )}
            {showDeadline ? (
              <TableHead className="w-[150px]">{deadlineHeader}</TableHead>
            ) : null}
            {resultOnly ? null : (
              <TableHead className="w-[170px]">Tình trạng thực hiện</TableHead>
            )}
            <TableHead className="w-[130px]">Trạng thái duyệt</TableHead>
            <TableHead className="w-[160px]">Cấp trên theo dõi</TableHead>
            <TableHead className="w-[170px] text-right">Thao tác</TableHead>
          </TableRow>
        </TableHeader>
      )}
      <TableBody>
        {loading ? (
          <TableRow>
            <TableCell
              colSpan={columnCount}
              className="h-28 text-center text-muted-foreground"
            >
              Đang tải...
            </TableCell>
          </TableRow>
        ) : rows.length === 0 ? (
          <TableRow>
            <TableCell
              colSpan={columnCount}
              className="h-28 text-center text-muted-foreground"
            >
              <div className="inline-flex flex-col items-center gap-2">
                <ClipboardList className="h-8 w-8 opacity-40" />
                <span>{emptyText}</span>
              </div>
            </TableCell>
          </TableRow>
        ) : (
          rows.map((row) => {
            const { item, summary, deadline, work } = row;
            const health = deadlineHealth(row);
            return (
              <TableRow key={item.id}>
                {/* break-words: tên nhiệm vụ có thể là chuỗi dài không dấu
                    cách, không bẻ thì nó tràn sang cột bên cạnh. */}
                <TableCell className="max-w-[420px] whitespace-normal align-middle">
                  {showReportDate && item.reportDate ? (
                    <div className="text-xs text-muted-foreground tabular-nums">
                      Ngày {formatYmd(item.reportDate)}
                    </div>
                  ) : null}
                  <div className="break-words font-medium">
                    {summary.title || item.workContentName}
                  </div>
                  {summary.title ? (
                    <div className="break-words text-xs text-muted-foreground">
                      {item.workContentName}
                    </div>
                  ) : null}
                </TableCell>

                <TableCell className="align-middle">
                  <Badge
                    variant="secondary"
                    className={cn(
                      "max-w-full truncate font-normal",
                      kpiTone.info.soft,
                    )}
                  >
                    {item.axisName}
                  </Badge>
                </TableCell>

                {resultOnly ? (
                  <>
                    {/* Trục chấm theo mục: chỉ có Đạt / Không đạt và điểm. */}
                    <TableCell className="align-middle">
                      {!row.result.declared ? (
                        <span className="text-xs text-muted-foreground">
                          Chưa khai kết quả
                        </span>
                      ) : (
                        <Badge
                          variant="secondary"
                          className={cn(
                            "font-normal",
                            row.result.failed
                              ? kpiTone.danger.soft
                              : kpiTone.success.soft,
                          )}
                        >
                          {row.result.failed ? "Không đạt" : "Đạt"}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell
                      className="text-right align-middle text-sm font-medium tabular-nums"
                      title={
                        row.result.score !== null &&
                        row.result.selfScore !== null &&
                        row.result.selfScore !== row.result.score
                          ? `Chỉ huy chấm lại - bạn tự chấm ${row.result.selfScore}`
                          : undefined
                      }
                    >
                      {row.result.score === null ? (
                        <span className="text-muted-foreground">-</span>
                      ) : (
                        row.result.score
                      )}
                    </TableCell>
                  </>
                ) : (
                  <>
                    {/* Tiến độ (nhóm B) - căn cứ cho tình trạng thực hiện. */}
                    <TableCell className="align-middle">
                      <PercentCell
                        percent={summary.progressPercent}
                        notTracked={!summary.tracksProgress}
                        change={summary.reviewChanges.find(
                          (entry) => entry.field === "progress",
                        )}
                      />
                    </TableCell>

                    {/* Chất lượng (nhóm C) - đứng riêng vì tiến độ 100% mà chất
                        lượng 75% là chuyện bình thường, hai con số không thay
                        nhau. */}
                    <TableCell className="align-middle">
                      <PercentCell
                        percent={summary.qualityPercent}
                        notTracked={!summary.tracksQuality}
                        change={summary.reviewChanges.find(
                          (entry) => entry.field === "quality",
                        )}
                      />
                    </TableCell>
                  </>
                )}

                {showDeadline ? (
                  <TableCell className="align-middle">
                    <DeadlineCell
                      deadline={summary.deadline}
                      state={deadline}
                    />
                  </TableCell>
                ) : null}

                {/* Việc chạy tới đâu - theo KPI tiến độ và hạn. */}
                {resultOnly ? null : (
                  <TableCell className="align-middle">
                    <div className="flex flex-wrap gap-1">
                      <WorkStateBadge work={work} />
                      {health ? (
                        <Badge
                          variant="secondary"
                          className={cn("font-normal", health.className)}
                        >
                          {health.label}
                        </Badge>
                      ) : null}
                      {isSilent(row) ? (
                        <Badge
                          variant="secondary"
                          className={cn("font-normal", kpiTone.warning.soft)}
                          title="Lâu rồi chưa cập nhật tiến độ"
                        >
                          Im lặng {row.silence} ngày
                        </Badge>
                      ) : null}
                    </div>
                  </TableCell>
                )}

                {/* Việc đang ở chặng nào của luồng duyệt. */}
                <TableCell className="align-middle">
                  {/* Lý do trả lại không bày ra bảng - dòng nào cũng vài chục
                      chữ thì bảng chỉ còn là bức tường chữ. Để ở tooltip, đọc
                      đầy đủ trong ô "Cập nhật". */}
                  <Badge
                    variant="secondary"
                    className={personalKpiStatusBadgeClass(item.status)}
                    title={
                      item.rejectReason
                        ? `Lý do trả lại: ${item.rejectReason}`
                        : undefined
                    }
                  >
                    {PERSONAL_KPI_STATUS_LABEL[item.status]}
                  </Badge>
                  {/* Cán bộ phải thấy ngay mình bị hạ điểm, và hạ ở ô nào. */}
                  {summary.reviewLowered ? (
                    <Badge
                      variant="secondary"
                      className={cn("mt-1 font-normal", kpiTone.danger.soft)}
                      title={summary.reviewChanges
                        .map(
                          (change) =>
                            `${change.groupTitle ? `${change.groupTitle} · ` : ""}${change.title}: ${change.from}% → ${change.to}%`,
                        )
                        .join("; ")}
                    >
                      Bị hạ điểm
                    </Badge>
                  ) : null}
                </TableCell>

                <TableCell className="align-middle text-sm text-muted-foreground">
                  {item.recipientName ?? "-"}
                </TableCell>

                <TableCell className="text-right align-middle">
                  <div className="inline-flex items-center gap-1">
                    {/* Việc đã chốt thì nút đổi thành xem lại - vẫn phải tra
                        được nhật ký tiến độ chứ không khoá cứng. */}
                    <Button
                      size="sm"
                      variant="outline"
                      className="bg-background"
                      onClick={() => onUpdateProgress(item)}
                      disabled={actingId === item.id}
                      title={
                        canUpdateProgress(item.status)
                          ? "Cập nhật tiến độ hôm nay - gửi rồi vẫn cập nhật được"
                          : "Đã chốt hoàn thành - xem lại nhật ký tiến độ"
                      }
                    >
                      {canUpdateProgress(item.status) ? (
                        <>
                          <Pencil className="h-4 w-4" />
                          Cập nhật
                        </>
                      ) : (
                        <>
                          <Eye className="h-4 w-4" />
                          Xem tiến độ
                        </>
                      )}
                    </Button>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Thao tác khác"
                          disabled={actingId === item.id}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onSelect={() => onEditDetail(item)}
                          disabled={!canEditPersonalKpi(item.status)}
                        >
                          <SquarePen className="h-4 w-4" />
                          Sửa chi tiết
                        </DropdownMenuItem>
                        {/* Chỉ dòng đã từng gửi (bị trả lại rồi sửa) mới gửi lẻ
                            được; báo cáo mới thì gửi cả lượt ở trên. */}
                        {item.status === "DRAFT" && item.sentAt ? (
                          <DropdownMenuItem onSelect={() => onSend(item)}>
                            <Send className="h-4 w-4" />
                            Gửi lại nhiệm vụ này
                          </DropdownMenuItem>
                        ) : null}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onSelect={() => onDelete(item)}
                          disabled={!canDeletePersonalKpi(item.status)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                          Xoá nhiệm vụ
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </TableCell>
              </TableRow>
            );
          })
        )}
      </TableBody>
    </Table>
  );
}
