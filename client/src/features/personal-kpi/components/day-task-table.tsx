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
  WORK_STATE_LABEL,
  type DeadlineState,
  type TaskSummary,
  type WorkState,
} from "@/features/personal-kpi/task-summary";
import {
  PERSONAL_KPI_STATUS_LABEL,
  canDeletePersonalKpi,
  canEditPersonalKpi,
  type PersonalKpiItem,
} from "@/features/personal-kpi/types";
import { cn } from "@/lib/utils";

export type DayTaskRow = {
  item: PersonalKpiItem;
  summary: TaskSummary;
  deadline: DeadlineState | null;
  /** Trạng thái công việc theo KPI tiến độ, tách khỏi trạng thái duyệt. */
  work: WorkState;
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

function formatDayLabel(ymd: string) {
  const date = new Date(`${ymd}T00:00:00`);
  if (Number.isNaN(date.getTime())) return ymd;
  return date.toLocaleDateString("vi-VN");
}

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
            <TableHead className="w-[170px]">Trục</TableHead>
            <TableHead className="w-[170px]">Tiến độ</TableHead>
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
              colSpan={8}
              className="h-28 text-center text-muted-foreground"
            >
              Đang tải...
            </TableCell>
          </TableRow>
        ) : rows.length === 0 ? (
          <TableRow>
            <TableCell
              colSpan={8}
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
            const done = work === "DONE";
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

                <TableCell className="align-middle">
                  {summary.progressPercent === null ? (
                    <span className="text-sm text-muted-foreground">-</span>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            done ? "bg-emerald-500" : "bg-primary",
                          )}
                          style={{ width: `${summary.progressPercent}%` }}
                        />
                      </div>
                      {done ? (
                        <Check className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                          {summary.progressPercent}%
                        </span>
                      )}
                    </div>
                  )}
                  {/* Chất lượng chỉ để biết: tiến độ 100% mà chất lượng 75% là
                      bình thường, hai con số không thay nhau. */}
                  {summary.qualityPercent === null ? null : (
                    <div className="mt-1 text-xs text-muted-foreground tabular-nums">
                      Chất lượng {summary.qualityPercent}%
                    </div>
                  )}
                </TableCell>

                <TableCell className="align-middle">
                  {summary.deadline ? (
                    <>
                      <div className="text-sm tabular-nums">
                        {formatDayLabel(summary.deadline)}
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
                        !canEditPersonalKpi(item.status) || actingId === item.id
                      }
                      title={
                        canEditPersonalKpi(item.status)
                          ? "Cập nhật tiến độ hôm nay"
                          : "Đã gửi lên cấp trên - không sửa được"
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
