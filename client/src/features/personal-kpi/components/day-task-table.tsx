"use client";

import {
  Check,
  ClipboardList,
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
  kpiTone,
  personalKpiStatusBadgeClass,
} from "@/features/personal-kpi/status-styles";
import {
  SILENCE_ALERT_DAYS,
  WORK_STATE_LABEL,
  type DeadlineState,
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
  deadline: DeadlineState | null;
  /** Trạng thái công việc theo KPI tiến độ, tách khỏi trạng thái duyệt. */
  work: WorkState;
  /** Số ngày không ai cập nhật tiến độ; null = chưa có mốc nào. */
  silence: number | null;
  /** Chuỗi gộp mọi thứ tìm được của dòng - lọc theo ô tìm kiếm. */
  haystack: string;
};

const DEADLINE_TONE: Record<DeadlineState["tone"], string> = {
  danger: kpiTone.danger.text,
  warning: kpiTone.warning.text,
  muted: "text-muted-foreground",
};

const WORK_STATE_PILL: Record<WorkState, string> = {
  NOT_STARTED: kpiTone.neutral.soft,
  IN_PROGRESS: kpiTone.info.soft,
  DONE: kpiTone.success.soft,
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

/**
 * Ô phần trăm KPI: thanh chạy + con số, đủ 100% thì xanh và đổi sang dấu tích.
 * Tiến độ và chất lượng dùng chung một kiểu để đặt cạnh nhau còn so được.
 */
function PercentCell({ percent }: { percent: number | null }) {
  if (percent === null) {
    return <span className="text-sm text-muted-foreground">-</span>;
  }

  const full = percent >= 100;
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            full ? "bg-emerald-500" : "bg-primary",
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
      {full ? (
        <Check className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
      ) : (
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
          {percent}%
        </span>
      )}
    </div>
  );
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
  onUpdateProgress: (item: PersonalKpiItem) => void;
  onEditDetail: (item: PersonalKpiItem) => void;
  onSend: (item: PersonalKpiItem) => void;
  onDelete: (item: PersonalKpiItem) => void;
};

/** Bảng nhiệm vụ - dùng chung cho cả xem phẳng lẫn xem theo nhóm. */
export function DayTaskTable({
  rows,
  deadlineHeader,
  loading = false,
  emptyText,
  actingId,
  hideHeader = false,
  onUpdateProgress,
  onEditDetail,
  onSend,
  onDelete,
}: DayTaskTableProps) {
  return (
    <Table>
      {hideHeader ? null : (
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[280px]">Nhiệm vụ</TableHead>
            <TableHead className="w-[80px]">Trục</TableHead>
            <TableHead className="w-[160px]">Tiến độ nhiệm vụ</TableHead>
            <TableHead className="w-[160px]">Chất lượng nhiệm vụ</TableHead>
            <TableHead className="w-[150px]">{deadlineHeader}</TableHead>
            <TableHead className="w-[170px]">Tình trạng thực hiện</TableHead>
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
              colSpan={9}
              className="h-28 text-center text-muted-foreground"
            >
              Đang tải...
            </TableCell>
          </TableRow>
        ) : rows.length === 0 ? (
          <TableRow>
            <TableCell
              colSpan={9}
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
                <TableCell className="align-middle">
                  <div className="font-medium">
                    {summary.title || item.workContentName}
                  </div>
                  {summary.title ? (
                    <div className="text-xs text-muted-foreground">
                      {item.workContentName}
                    </div>
                  ) : null}
                  {item.rejectReason ? (
                    <div className="text-xs text-amber-600 dark:text-amber-400">
                      Lý do trả lại: {item.rejectReason}
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

                {/* Tiến độ (nhóm B) - căn cứ cho tình trạng thực hiện. */}
                <TableCell className="align-middle">
                  <PercentCell percent={summary.progressPercent} />
                </TableCell>

                {/* Chất lượng (nhóm C) - đứng riêng vì tiến độ 100% mà chất
                    lượng 75% là chuyện bình thường, hai con số không thay nhau. */}
                <TableCell className="align-middle">
                  <PercentCell percent={summary.qualityPercent} />
                </TableCell>

                <TableCell className="align-middle">
                  {summary.deadline ? (
                    <>
                      <div className="text-sm tabular-nums">
                        {formatYmd(summary.deadline)}
                      </div>
                      {deadline ? (
                        <div
                          className={cn("text-xs", DEADLINE_TONE[deadline.tone])}
                        >
                          {deadline.label}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <span className="text-sm text-muted-foreground">-</span>
                  )}
                </TableCell>

                {/* Việc chạy tới đâu - theo KPI tiến độ và hạn. */}
                <TableCell className="align-middle">
                  <div className="flex flex-wrap gap-1">
                    <Badge
                      variant="secondary"
                      className={cn("font-normal", WORK_STATE_PILL[work])}
                    >
                      {WORK_STATE_LABEL[work]}
                    </Badge>
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

                {/* Việc đang ở chặng nào của luồng duyệt. */}
                <TableCell className="align-middle">
                  <Badge
                    variant="secondary"
                    className={personalKpiStatusBadgeClass(item.status)}
                  >
                    {PERSONAL_KPI_STATUS_LABEL[item.status]}
                  </Badge>
                </TableCell>

                <TableCell className="align-middle text-sm text-muted-foreground">
                  {item.recipientName ?? "-"}
                </TableCell>

                <TableCell className="text-right align-middle">
                  <div className="inline-flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="bg-background"
                      onClick={() => onUpdateProgress(item)}
                      disabled={
                        !canUpdateProgress(item.status) || actingId === item.id
                      }
                      title={
                        canUpdateProgress(item.status)
                          ? "Cập nhật tiến độ hôm nay - gửi rồi vẫn cập nhật được"
                          : "Đã chốt hoàn thành - không cập nhật nữa"
                      }
                    >
                      <Pencil className="h-4 w-4" />
                      Cập nhật
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
