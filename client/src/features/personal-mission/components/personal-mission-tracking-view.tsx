"use client";

import { useCallback, useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCheck,
  CircleCheck,
  MessageSquareWarning,
  ChevronDown,
  Crosshair,
  Eye,
  MoreHorizontal,
  PencilLine,
  Search,
  TriangleAlert,
  Undo2,
} from "lucide-react";
import useSWR from "swr";
import { toast } from "sonner";

import { DateRangeFilter } from "@/components/common/date-range-filter";
import { SegmentedTabs } from "@/components/common/segmented-tabs";
import { TablePagination } from "@/components/common/table-pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import type { ResolvedTemplate } from "@/features/mission-form-config/form-template-utils";
import { entityId } from "@/features/mission-form-config/types";
import { useQualityLevelMap } from "@/features/mission-form-config/use-quality-levels";
import type { QualityLevel } from "@/features/mission-form-config/types";
import { useScopedAxes } from "@/features/mission-form-config/use-scoped-axes";
import {
  fetchPersonalMissionBoard,
  mapPersonalMissionFromApi,
  reviewPersonalMission,
  personalMissionKeys,
  type PersonalMissionBoard,
  type PersonalMissionBoardGroupHeader,
  type PersonalMissionBoardQuery,
  type PersonalMissionBoardRow,
} from "@/features/personal-mission/api";
import { CriteriaReviewCard } from "@/features/personal-mission/components/criteria-review-card";
import {
  DeadlineCell,
  ProgressBar,
  WorkStateBadge,
} from "@/features/personal-mission/components/mission-cells";
import { ProgressUpdateDialog } from "@/features/personal-mission/components/progress-update-dialog";
import { ReviewerEditDialog } from "@/features/personal-mission/components/reviewer-edit-dialog";
import { ReviewScoreDialog } from "@/features/personal-mission/components/review-score-dialog";
import { StaffDayReportDialog } from "@/features/personal-mission/components/staff-day-report-dialog";
import {
  missionTone,
  personalMissionStatusBadgeClass,
} from "@/features/personal-mission/status-styles";
import {
  SILENCE_ALERT_DAYS,
  deadlineState,
  silenceDays,
  readResultInfo,
  resultColumns,
  summarizeTask,
  workStateOf,
  type DeadlineState,
  type ResultInfo,
  type TaskSummary,
  type WorkState,
} from "@/features/personal-mission/task-summary";
import {
  PERSONAL_MISSION_STATUS_LABEL,
  canReviewPersonalMission,
  type PersonalMissionItem,
} from "@/features/personal-mission/types";
import { useListPagination } from "@/hooks/use-list-pagination";
import { useServerTime } from "@/hooks/use-server-time";
import { getApiErrorMessage } from "@/lib/api-client";
import { currentWeekRange, serverYmd } from "@/lib/server-time";
import { cn } from "@/lib/utils";

const ALL = "ALL";

type TabValue =
  | "ALL"
  | "TODAY"
  | "BACKLOG"
  | "OVERDUE"
  | "DUE_SOON"
  | "SILENT"
  | "AWAITING"
  | "DONE";

const TABS: Array<{ value: TabValue; label: string }> = [
  { value: "ALL", label: "Tất cả" },
  { value: "TODAY", label: "Mới hôm nay" },
  { value: "BACKLOG", label: "Đang tồn đọng" },
  { value: "OVERDUE", label: "Trễ hạn" },
  { value: "DUE_SOON", label: "Sắp đến hạn" },
  { value: "SILENT", label: "Chưa cập nhật" },
  { value: "AWAITING", label: "Chờ xác nhận" },
  { value: "DONE", label: "Hoàn thành" },
];

/**
 * Cách bày danh sách: phẳng, hay gom theo trục / đơn vị / cán bộ.
 *
 * Giữ đúng bộ của màn nhập cá nhân - cùng một khái niệm thì phải cùng một tên,
 * chứ chỗ gọi "Theo nhiệm vụ" chỗ gọi "Theo nội dung nhiệm vụ" là hai màn đọc
 * ra hai thứ khác nhau.
 */
type GroupMode = "TASK" | "AXIS" | "UNIT" | "PERSON";

const GROUP_MODES: Array<{ value: GroupMode; label: string }> = [
  { value: "TASK", label: "Theo nội dung nhiệm vụ" },
  { value: "AXIS", label: "Theo trục" },
  { value: "UNIT", label: "Theo đơn vị" },
  { value: "PERSON", label: "Theo cá nhân" },
];

type TrackingRow = {
  item: PersonalMissionItem;
  /** Mẫu bảng của trục - hộp thoại chi tiết cần để dựng mốc tiến độ. */
  template: ResolvedTemplate | null;
  summary: TaskSummary;
  result: ResultInfo;
  deadline: DeadlineState | null;
  work: WorkState;
  silence: number | null;
  ownerName: string;
  ownerDepartmentName: string;
  reportDate: string;
};

/** Việc đã chốt hoặc đã đủ tiến độ thì không tính là nợ nữa. */
function isSettled(row: TrackingRow): boolean {
  return row.item.status === "COMPLETED" || row.work === "DONE";
}

function isOverdue(row: TrackingRow): boolean {
  return !isSettled(row) && !!row.deadline && row.deadline.days < 0;
}

function isDueSoon(row: TrackingRow): boolean {
  return (
    !isSettled(row) &&
    !!row.deadline &&
    row.deadline.days >= 0 &&
    row.deadline.days <= 2
  );
}

function isSilent(row: TrackingRow): boolean {
  if (isSettled(row)) return false;
  return row.silence !== null && row.silence >= SILENCE_ALERT_DAYS;
}

/** Cán bộ báo xong 100% và đang chờ chỉ huy chốt. */
function isAwaitingConfirm(row: TrackingRow): boolean {
  return row.work === "DONE" && row.item.status !== "COMPLETED";
}

/** "Cập nhật N ngày trước" - đọc từ mốc cập nhật tiến độ gần nhất. */
function lastTouchedLabel(row: TrackingRow): string {
  if (!row.item.lastProgressAt) return "Chưa cập nhật tiến độ";
  if (row.silence === null) return "Chưa cập nhật tiến độ";
  if (row.silence === 0) return "Cập nhật hôm nay";
  return `Cập nhật ${row.silence} ngày trước`;
}

type StatCardProps = {
  label: string;
  value: string;
  hint?: string;
  icon: typeof Crosshair;
  tone?: { text: string; icon: string };
};

/**
 * Cùng một khuôn với thẻ số ở màn Nhiệm vụ cá nhân - hai màn nằm trong cùng
 * một luồng việc, thẻ số lệch kiểu là mắt phải làm quen lại từ đầu.
 *
 * Bỏ được mẹo chèn dòng chú thích rỗng {hint ?? " "} vốn dùng để ép các thẻ cao
 * bằng nhau: CardContent giờ flex-1 nên tự giãn hết chiều cao thẻ, còn
 * items-center căn giữa phần chữ - thẻ có chú thích hay không vẫn thẳng hàng.
 */
function StatCard({ label, value, hint, icon: Icon, tone }: StatCardProps) {
  return (
    <Card className="flex flex-col shadow-sm">
      <CardContent className="flex flex-1 items-center gap-4 p-5">
        <span
          className={cn(
            "flex size-12 shrink-0 items-center justify-center rounded-xl",
            tone?.icon ?? missionTone.neutral.icon,
          )}
        >
          <Icon className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p
            className={cn(
              "font-display text-3xl font-bold leading-tight tabular-nums",
              tone?.text,
            )}
          >
            {value}
          </p>
          {hint ? (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {hint}
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

type TrackingTableProps = {
  rows: TrackingRow[];
  /** Dòng đang chờ thao tác chạy xong - khoá nút của riêng dòng đó. */
  busyId: string | null;
  /**
   * Số hiệu khối B của từng trục theo mẫu báo cáo của NGƯỜI XEM. Trục ngoài
   * mẫu đó không có số - cấp dưới có thể đang dùng mẫu khác, gán số theo mẫu
   * của mình sẽ chỉ sai chỗ.
   */
  axisOrderById?: Map<string, number>;
  onDetail: (row: TrackingRow) => void;
  onEdit: (row: TrackingRow) => void;
  onComplete: (row: TrackingRow) => void;
  onReturn: (row: TrackingRow) => void;
};

/**
 * Ô "Kết quả nhiệm vụ" - tự đổi cách bày theo MẪU của chính dòng đó.
 *
 * Trục chấm theo tỉ lệ hiện thanh Tiến độ và số Chất lượng; trục chấm theo mục
 * hiện Đạt / Không đạt kèm điểm. Trước đây hai kiểu này là hai bộ cột chọn theo
 * cả bảng, nên danh sách trộn nhiều trục thì dòng của trục chấm theo mục ghi
 * "Không theo dõi %" tới ba lần mà không nói được kết quả ra sao.
 */
function TrackingResultCell({ row }: { row: TrackingRow }) {
  const { summary, result } = row;

  if (!summary.tracksProgress && !summary.tracksQuality) {
    return (
      <div className="space-y-0.5">
        {!result.declared ? (
          <span className="text-xs text-muted-foreground">
            Chưa khai kết quả
          </span>
        ) : (
          <Badge
            variant="secondary"
            className={cn(
              "font-normal",
              result.failed
                ? missionTone.danger.soft
                : missionTone.success.soft,
            )}
          >
            {result.failed ? "Không đạt" : "Đạt"}
          </Badge>
        )}
        <div
          className="text-xs text-muted-foreground tabular-nums"
          title={
            result.score !== null &&
            result.selfScore !== null &&
            result.selfScore !== result.score
              ? `Chỉ huy chấm lại - cán bộ tự chấm ${result.selfScore}`
              : undefined
          }
        >
          {result.score === null ? "Chưa có điểm" : `${result.score} điểm`}
        </div>
        <div className="whitespace-nowrap text-xs text-muted-foreground">
          {lastTouchedLabel(row)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {summary.tracksProgress ? (
        <div className="flex items-center gap-2">
          <span className="w-14 shrink-0 text-[11px] text-muted-foreground">
            Tiến độ
          </span>
          {summary.progressPercent === null ? (
            <span className="text-sm text-muted-foreground">-</span>
          ) : (
            <>
              <ProgressBar
                percent={summary.progressPercent}
                className="min-w-0 flex-1"
              />
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {summary.progressPercent}%
              </span>
            </>
          )}
        </div>
      ) : null}

      {/* Cùng một cách bày với Tiến độ: hai con số nằm cạnh nhau mà một bên có
          thanh, một bên chỉ có chữ thì đọc ra thành hai loại số khác nhau. */}
      {summary.tracksQuality ? (
        <div className="flex items-center gap-2">
          <span className="w-14 shrink-0 text-[11px] text-muted-foreground">
            Chất lượng
          </span>
          {summary.qualityPercent === null ? (
            <span className="text-sm text-muted-foreground">-</span>
          ) : (
            <>
              <ProgressBar
                percent={summary.qualityPercent}
                className="min-w-0 flex-1"
              />
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {summary.qualityPercent}%
              </span>
            </>
          )}
        </div>
      ) : null}

      {/*
        Chỉ huy đã chấm khác cán bộ thì nói rõ số cũ ngay tại ô. Gọi theo TÊN
        NHÓM CỘT ("tiến độ (B)") chứ không gọi tên cột: mẫu thật đặt hai cột
        trùng tên "Thực tế hoàn thành %" nên nói tên cột thì không biết là tiến
        độ hay chất lượng.
      */}
      {summary.reviewChanges.map((change) => (
        <p
          key={change.field}
          className={cn(
            "whitespace-nowrap text-xs tabular-nums",
            change.to < change.from
              ? missionTone.danger.text
              : missionTone.success.text,
          )}
          title={`${change.groupTitle ? `${change.groupTitle} · ` : ""}${change.title}: cán bộ tự chấm ${change.from}%, chỉ huy chốt ${change.to}%`}
        >
          {change.to < change.from ? "▼" : "▲"}{" "}
          {change.groupTitle || change.title}: tự chấm {change.from}%
        </p>
      ))}

      <div className="whitespace-nowrap text-xs text-muted-foreground">
        {lastTouchedLabel(row)}
      </div>
    </div>
  );
}

/** Bảng nhiệm vụ - dùng lại cho cả xem phẳng lẫn từng nhóm thu gọn được. */
function TrackingTable({
  rows,
  busyId,
  axisOrderById,
  onDetail,
  onEdit,
  onComplete,
  onReturn,
}: TrackingTableProps) {
  /*
    Cột hạn giữ lại khi còn dòng nào khai hạn hoặc theo dõi tiến độ - danh sách
    toàn trục chấm theo mục thì cột này rỗng trơn.
  */
  const showDeadline = rows.some(
    (row) => Boolean(row.summary.deadline) || row.summary.tracksProgress,
  );

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[340px]">Biểu mẫu · Nhiệm vụ</TableHead>
          {/* MỘT cột kết quả, tự đổi theo mẫu của từng dòng. Ba cột cố định
              Tiến độ / Chất lượng / Kết quả chỉ đúng với một loại trục; danh
              sách trộn nhiều trục thì loại nào cũng sai với một nửa số dòng. */}
          <TableHead className="w-[230px]">Kết quả nhiệm vụ</TableHead>
          {showDeadline ? (
            <TableHead className="w-[140px]">Hạn</TableHead>
          ) : null}
          <TableHead className="w-[130px]">Trạng thái duyệt</TableHead>
          <TableHead className="w-[160px]">Tình trạng thực hiện</TableHead>
          <TableHead className="w-[180px]">Cán bộ</TableHead>
          <TableHead className="w-[210px] text-right">Thao tác</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const awaiting = isAwaitingConfirm(row);
          const busy = busyId === row.item.id;
          return (
            <TableRow key={row.item.id}>
              {/* Tên nội dung công việc dài cả dòng - phải cho
                    xuống hàng, không thì cột này kéo giãn cả
                    bảng và mấy cột sau bị bóp lại. */}
              {/*
                  `break-words` là bắt buộc: tên nhiệm vụ có thể
                  là một chuỗi dài không dấu cách, mà chuỗi liền
                  thì không tự xuống hàng - nó tràn hẳn sang cột
                  bên cạnh.
                */}
              <TableCell className="max-w-[360px] whitespace-normal align-middle">
                <div>
                  <Badge
                    variant="secondary"
                    className={cn("gap-1 font-normal", missionTone.info.soft)}
                  >
                    {/* Số hiệu khối B để đối chiếu thẳng với bản in; trục ngoài
                        mẫu của người xem thì chỉ hiện tên. */}
                    {axisOrderById?.get(row.item.axisId) ? (
                      <span className="font-semibold">
                        B{axisOrderById.get(row.item.axisId)}
                      </span>
                    ) : null}
                    {row.item.axisName}
                  </Badge>
                </div>
                <div className="mt-1 break-words font-medium leading-snug">
                  {row.summary.title || row.item.workContentName}
                </div>
                <div className="mt-0.5 break-words text-xs leading-snug text-muted-foreground">
                  {row.item.workContentName}
                </div>
              </TableCell>

              <TableCell className="align-middle">
                <TrackingResultCell row={row} />
              </TableCell>

              {showDeadline ? (
                <TableCell className="whitespace-nowrap align-middle">
                  <DeadlineCell
                    deadline={row.summary.deadline}
                    state={row.deadline}
                  />
                </TableCell>
              ) : null}

              <TableCell className="align-middle">
                <Badge
                  variant="secondary"
                  className={personalMissionStatusBadgeClass(row.item.status)}
                >
                  {PERSONAL_MISSION_STATUS_LABEL[row.item.status]}
                </Badge>
                {row.summary.reviewLowered ? (
                  <Badge
                    variant="secondary"
                    className={cn("mt-1 font-normal", missionTone.danger.soft)}
                    title={row.summary.reviewChanges
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

              <TableCell className="align-middle">
                <div className="flex flex-wrap gap-1">
                  <WorkStateBadge work={row.work} />
                  {isOverdue(row) ? (
                    <Badge
                      variant="secondary"
                      className={cn("font-normal", missionTone.danger.soft)}
                    >
                      Trễ hạn
                    </Badge>
                  ) : isDueSoon(row) ? (
                    <Badge
                      variant="secondary"
                      className={cn("font-normal", missionTone.warning.soft)}
                    >
                      Sắp đến hạn
                    </Badge>
                  ) : null}
                  {isSilent(row) ? (
                    <Badge
                      variant="secondary"
                      className={cn("font-normal", missionTone.warning.soft)}
                    >
                      {row.silence} ngày chưa cập nhật
                    </Badge>
                  ) : null}
                </div>
              </TableCell>

              {/*
                Cán bộ đứng sau tình trạng thực hiện, không đứng đầu bảng: mắt
                đọc từ trái sang, mà thứ chỉ huy dò trước là nhiệm vụ và tình
                trạng của nó - tên người chỉ cần khi đã thấy dòng đáng để ý.

                Không còn ảnh đại diện: chữ cái tắt của tên không nói thêm được
                gì mà chiếm mất phần bề ngang của chính cái tên.
              */}
              <TableCell className="align-middle">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">
                    {row.ownerName}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {row.ownerDepartmentName}
                  </div>
                </div>
              </TableCell>

              {/*
                Một nút mở chi tiết, phần quyết định gom vào menu "..." - bày cả
                bốn nút ra hàng thì mỗi dòng là một rừng nút, mà thao tác hay
                dùng nhất vẫn là mở ra đọc đã. Menu giữ lại đường duyệt nhanh
                cho người đã nắm việc, khỏi phải mở hộp thoại.
              */}
              <TableCell className="text-right align-middle">
                <div className="inline-flex items-center justify-end gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="bg-background"
                    onClick={() => onDetail(row)}
                  >
                    <Eye className="h-4 w-4" />
                    Chi tiết
                  </Button>
                  {/* Chốt / sửa / trả lại chỉ áp cho việc đang chờ quyết ở chỗ
                      mình. */}
                  {row.item.status === "PENDING" ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-8"
                          disabled={busy}
                          aria-label="Thao tác khác"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {/* Chốt được ở bất kỳ mức tiến độ nào - việc dừng giữa
                            chừng vẫn phải khoá sổ. Chưa đủ 100% thì form chấm
                            điểm sẽ cảnh báo trước khi quyết. */}
                        <DropdownMenuItem onSelect={() => onComplete(row)}>
                          <CheckCheck className="h-4 w-4" />
                          Hoàn thành
                          {awaiting ? null : (
                            <span
                              className={cn(
                                "text-xs",
                                missionTone.warning.text,
                              )}
                            >
                              chưa đủ 100%
                            </span>
                          )}
                        </DropdownMenuItem>
                        {/* Sửa được mọi trường của nhiệm vụ cán bộ gửi lên -
                            mọi thay đổi đều vào nhật ký kèm lý do. */}
                        <DropdownMenuItem onSelect={() => onEdit(row)}>
                          <PencilLine className="h-4 w-4" />
                          Sửa nội dung
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onSelect={() => onReturn(row)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Undo2 className="h-4 w-4" />
                          Trả lại
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

/**
 * Dựng dòng bảng từ phản hồi của server.
 *
 * Tách khỏi component vì mỗi nhóm khi bung ra cũng tự tải dòng của riêng nó -
 * hai chỗ phải dựng y hệt nhau, kẻo cùng một nhiệm vụ mà xem phẳng và xem theo
 * nhóm lại ra hai tiến độ.
 */
function useTrackingRows(
  data: PersonalMissionBoard | undefined,
  qualityLevelById: Map<string, QualityLevel>,
  todayYmd: string,
): TrackingRow[] {
  return useMemo<TrackingRow[]>(() => {
    const result: TrackingRow[] = [];
    for (const axis of data?.axes ?? []) {
      for (const group of axis.groups) {
        for (const raw of group.rows as PersonalMissionBoardRow[]) {
          const item = mapPersonalMissionFromApi(raw);
          const summary = summarizeTask(
            item.task,
            axis.template,
            qualityLevelById,
            {
              values: item.reviewValues,
              catalogValues: item.reviewCatalogValues,
            },
          );
          const department =
            raw.ownerDepartmentId && typeof raw.ownerDepartmentId === "object"
              ? (raw.ownerDepartmentId.name ?? "")
              : "";
          const resultInfo = readResultInfo(
            item.task,
            resultColumns(axis.template),
            {
              values: item.reviewValues,
              catalogValues: item.reviewCatalogValues,
            },
          );
          result.push({
            item,
            template: axis.template,
            summary,
            result: resultInfo,
            deadline: deadlineState(summary.deadline, todayYmd),
            work: workStateOf(summary, {
              completed: item.status === "COMPLETED",
              touched: !!item.lastProgressAt,
              hasResult: resultInfo.declared,
            }),
            // Trục không chấm theo % thì không có tiến độ để im lặng.
            silence: summary.tracksProgress
              ? silenceDays(item.lastProgressAt ?? item.createdAt, todayYmd)
              : null,
            ownerName: item.ownerName ?? "Chưa rõ cán bộ",
            ownerDepartmentName: department || "Chưa rõ đơn vị",
            reportDate: raw.reportDate ?? "",
          });
        }
      }
    }

    /*
      Xếp lại theo đúng thứ tự server đã sắp. `axes` gom dòng theo trục nên
      duyệt qua nó là mất thứ tự - mà thứ tự lại chính là thứ quyết định dòng
      nào rơi vào trang này, nên bày sai thứ tự thì lật trang đọc thành lộn xộn.
    */
    const byId = new Map(result.map((row) => [row.item.id, row]));
    const ordered = (data?.order ?? [])
      .map((id) => byId.get(id))
      .filter((row): row is TrackingRow => Boolean(row));
    // Server cũ chưa trả `order` thì giữ nguyên thứ tự cũ, đừng làm trắng bảng.
    return ordered.length ? ordered : result;
  }, [data, qualityLevelById, todayYmd]);
}

/** Số nhiệm vụ tải mỗi lượt khi bung một nhóm ra. */
const GROUP_PAGE_SIZE = 25;

/** Server chỉ chịu trả tối đa chừng này dòng một lượt. */
const GROUP_MAX_ROWS = 200;

const EMPTY_TAB_COUNTS: Record<TabValue, number> = {
  ALL: 0,
  TODAY: 0,
  BACKLOG: 0,
  OVERDUE: 0,
  DUE_SOON: 0,
  SILENT: 0,
  AWAITING: 0,
  DONE: 0,
};

type TrackingGroupPanelProps = {
  group: PersonalMissionBoardGroupHeader;
  /** Bộ lọc chung của trang - nhóm chỉ thêm vào đúng khoá của mình. */
  boardQuery: PersonalMissionBoardQuery;
  groupMode: GroupMode;
  qualityLevelById: Map<string, QualityLevel>;
  todayYmd: string;
  axisOrderById: Map<string, number>;
  busyId: string | null;
  onOpenDayReport: (
    ownerId: string,
    ownerName: string,
    dates: string[],
  ) => void;
  onDetail: (row: TrackingRow) => void;
  onEdit: (row: TrackingRow) => void;
  onComplete: (row: TrackingRow) => void;
  onReturn: (row: TrackingRow) => void;
};

/**
 * Một nhóm trong bảng theo dõi: tiêu đề luôn hiện, dòng chỉ tải khi bung ra.
 *
 * Tiêu đề dùng số server đã đếm trên TOÀN BỘ bộ lọc, nên nhóm còn đang thu vẫn
 * nói đúng số nhiệm vụ, số trễ và tiến độ trung bình. Trước đây mọi nhóm đều
 * mở sẵn và mang theo đủ dòng - ở cấp nhận báo cáo của nhiều đơn vị thì đó là
 * cả nghìn dòng dựng ra chỉ để người xem cuộn qua.
 */
function TrackingGroupPanel({
  group,
  boardQuery,
  groupMode,
  qualityLevelById,
  todayYmd,
  axisOrderById,
  busyId,
  onOpenDayReport,
  onDetail,
  onEdit,
  onComplete,
  onReturn,
}: TrackingGroupPanelProps) {
  const [open, setOpen] = useState(false);
  /*
    Nới trần thay vì cộng dồn từng trang: SWR giữ nguyên một khoá cho cả nhóm
    nên không phải tự ghép mảng, và bấm "xem thêm" rồi thu nhóm lại mở ra vẫn
    thấy đúng chừng đó dòng.
  */
  const [rowLimit, setRowLimit] = useState(GROUP_PAGE_SIZE);

  const query = useMemo(
    () => ({
      ...boardQuery,
      groupKey: group.key,
      groupMode,
      page: 1,
      limit: rowLimit,
    }),
    [boardQuery, group.key, groupMode, rowLimit],
  );

  const { data, isLoading } = useSWR(
    open ? personalMissionKeys.board(query) : null,
    () => fetchPersonalMissionBoard(query),
    { keepPreviousData: true },
  );

  const rows = useTrackingRows(data, qualityLevelById, todayYmd);

  /*
    Xem theo cá nhân thì mở được trọn báo cáo một ngày của người đó. Ngày lấy
    từ chính các dòng ĐÃ tải - không đoán, vì đoán sai là đọc nhầm báo cáo hôm
    khác. Vì vậy nút chỉ hiện khi nhóm đã bung ra.
  */
  const ownerId = rows[0]?.item.ownerId ?? "";
  const dates = useMemo(
    () =>
      [...new Set(rows.map((row) => row.reportDate).filter(Boolean))].sort(
        (left, right) => right.localeCompare(left),
      ),
    [rows],
  );

  const loaded = rows.length;
  const canLoadMore =
    open &&
    loaded >= rowLimit &&
    loaded < group.total &&
    rowLimit < GROUP_MAX_ROWS;

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="overflow-hidden rounded-lg border"
    >
      <div className="flex flex-wrap items-center gap-2 bg-muted/30 px-3 py-2.5">
        {/* data-state nằm trên nút nên xoay mũi tên qua nút, icon không mang
            thuộc tính đó. */}
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-7 shrink-0 [&>svg]:transition-transform data-[state=closed]:[&>svg]:-rotate-90"
            aria-label={`${open ? "Thu gọn" : "Mở"} ${group.label}`}
          >
            <ChevronDown className="size-4" />
          </Button>
        </CollapsibleTrigger>
        {/* Bấm vào cả dải tiêu đề cũng mở được - vùng bấm rộng hơn cái mũi tên
            7px rất nhiều. */}
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="cursor-pointer text-left font-semibold hover:underline"
          >
            {group.label}
          </button>
        </CollapsibleTrigger>
        <Badge
          variant="secondary"
          className={cn("font-normal", missionTone.info.soft)}
        >
          {group.total} nhiệm vụ
        </Badge>
        {group.overdue > 0 ? (
          <Badge
            variant="secondary"
            className={cn("font-normal", missionTone.danger.soft)}
          >
            Trễ {group.overdue}
          </Badge>
        ) : null}
        {group.silent > 0 ? (
          <Badge
            variant="secondary"
            className={cn("font-normal", missionTone.warning.soft)}
          >
            Chưa cập nhật {group.silent}
          </Badge>
        ) : null}
        {group.done > 0 ? (
          <Badge
            variant="secondary"
            className={cn("font-normal", missionTone.success.soft)}
          >
            Hoàn thành {group.done}
          </Badge>
        ) : null}

        <div className="ml-auto flex items-center gap-3">
          {group.percent === null ? null : (
            <div className="flex min-w-[140px] items-center gap-2">
              <ProgressBar percent={group.percent} className="flex-1" />
              <span className="text-xs text-muted-foreground tabular-nums">
                {group.percent}%
              </span>
            </div>
          )}
          {groupMode === "PERSON" && ownerId ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="bg-background"
              onClick={() => onOpenDayReport(ownerId, group.label, dates)}
            >
              <CalendarDays className="size-4" />
              Xem báo cáo ngày
            </Button>
          ) : null}
        </div>
      </div>

      <CollapsibleContent className="border-t">
        {isLoading && !rows.length ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Đang tải...
          </div>
        ) : (
          <>
            <TrackingTable
              rows={rows}
              busyId={busyId}
              axisOrderById={axisOrderById}
              onDetail={onDetail}
              onEdit={onEdit}
              onComplete={onComplete}
              onReturn={onReturn}
            />
            {loaded < group.total ? (
              <div className="flex items-center justify-center gap-3 border-t bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                <span>
                  Đang xem {loaded}/{group.total} nhiệm vụ
                </span>
                {canLoadMore ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="bg-background"
                    onClick={() =>
                      setRowLimit((prev) =>
                        Math.min(prev + GROUP_PAGE_SIZE, GROUP_MAX_ROWS),
                      )
                    }
                  >
                    Xem thêm
                  </Button>
                ) : (
                  // Chạm trần thì nói thẳng cách xem hết, đừng để người dùng
                  // bấm mãi một cái nút không nhúc nhích.
                  <span>Thu hẹp khoảng ngày hoặc bộ lọc để xem tiếp.</span>
                )}
              </div>
            ) : null}
          </>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function PersonalMissionTrackingView() {
  const [tab, setTab] = useState<TabValue>("ALL");
  const [groupMode, setGroupMode] = useState<GroupMode>("UNIT");

  /*
    Đọc trọn báo cáo một ngày của một cán bộ.

    Giữ luôn danh sách ngày của cán bộ đó thay vì để hộp thoại tự hỏi: danh sách
    ngoài này lọc theo KHOẢNG ngày, nên "ngày nào" là câu chỉ bảng đang xem mới
    trả lời được. Hộp thoại đoán thay là đọc nhầm báo cáo của hôm khác.
  */
  const [dayReport, setDayReport] = useState<{
    ownerId: string;
    ownerName: string;
    dates: string[];
  } | null>(null);
  const [dayReportDate, setDayReportDate] = useState<string | null>(null);
  const { page, setPage, limit, setLimit, query, setQuery, debouncedQuery } =
    useListPagination();
  const [departmentId, setDepartmentId] = useState(ALL);
  /**
   * Lọc theo ngày báo cáo - chạy ở server để đếm tab đúng theo khoảng đang xem.
   *
   * null = chưa đụng tới, dùng mặc định (tuần này). Chuỗi rỗng = người dùng đã
   * chủ động bỏ lọc. Tách hai thứ đó ra mới suy lại được ngày mặc định khi
   * đồng bộ xong giờ server, mà không đè lên lựa chọn của người dùng.
   */
  const [fromOverride, setFromOverride] = useState<string | null>(null);
  const [toOverride, setToOverride] = useState<string | null>(null);
  /* Giữ ID chứ không giữ nguyên đối tượng dòng: sửa xong nạp lại danh sách
     thì hộp thoại chi tiết phải hiện số liệu và nhật ký mới, không phải bản
     chụp lúc bấm mở. */
  /*
    Giữ nguyên đối tượng dòng chứ không giữ id.

    Xem theo nhóm thì dòng do TỪNG NHÓM tự tải khi bung ra, nên không còn một
    danh sách duy nhất để tra id. Ba hộp thoại kia (sửa, chấm, trả lại) vốn đã
    giữ cả dòng - giữ giống nhau thì bốn chỗ cùng một luật.
  */
  const [detailRow, setDetailRow] = useState<TrackingRow | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  /** Nhiệm vụ đang mở form chấm điểm để chốt hoàn thành. */
  const [editRow, setEditRow] = useState<TrackingRow | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const [scoreRow, setScoreRow] = useState<TrackingRow | null>(null);
  const [scoreOpen, setScoreOpen] = useState(false);
  const [returnRow, setReturnRow] = useState<TrackingRow | null>(null);
  const [returnReason, setReturnReason] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  /*
    Số hiệu khối B theo mẫu báo cáo áp dụng cho ĐƠN VỊ CỦA NGƯỜI XEM. Cấp dưới
    có thể đang dùng mẫu khác, nên trục nào không nằm trong mẫu này thì không
    gán số - thà thiếu số còn hơn gán một số chỉ đúng ở bảng của mình.
  */
  const { axes: scopedAxes } = useScopedAxes();
  const axisOrderById = useMemo(
    () => new Map(scopedAxes.map((axis, index) => [entityId(axis), index + 1])),
    [scopedAxes],
  );

  const { ready } = useServerTime();
  const todayYmd = serverYmd();

  /*
    Tính lại khi đồng bộ xong giờ server - lần render đầu còn đang dùng giờ máy.
    `ready` không xuất hiện trong thân hàm nên eslint coi là thừa, nhưng độ lệch
    giờ mà `currentWeekRange` đọc lại nằm ở module ngoài React.
  */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const week = useMemo(() => currentWeekRange(), [ready]);
  const fromDate = fromOverride ?? week.from;
  const toDate = toOverride ?? week.to;
  const usingDefaultWeek = fromOverride === null && toOverride === null;

  /*
    Lọc, đếm và cắt trang đều do server làm.

    Cấp càng cao thì số báo cáo nhận về càng nhiều - kéo cả khoảng ngày về rồi
    lọc trong trình duyệt là mỗi lần mở trang tải hàng nghìn dòng, mà bộ đếm
    trên thanh tab còn sai âm thầm khi chạm trần số dòng server chịu trả.

    Vì thế mọi thứ ảnh hưởng tới kết quả đều nằm trong khoá SWR: đổi tab, đổi
    đơn vị, gõ tìm kiếm hay lật trang đều là một câu hỏi mới gửi xuống.
  */
  const boardQuery = useMemo(
    () => ({
      includeDecided: true,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
      departmentId: departmentId === ALL ? undefined : departmentId,
      q: debouncedQuery || undefined,
      tab,
      groupMode,
      page,
      limit,
    }),
    [
      fromDate,
      toDate,
      departmentId,
      debouncedQuery,
      tab,
      groupMode,
      page,
      limit,
    ],
  );
  const { data, isLoading, mutate } = useSWR(
    personalMissionKeys.board(boardQuery),
    () => fetchPersonalMissionBoard(boardQuery),
    // Giữ dữ liệu cũ trong lúc tải trang mới: không có nó thì mỗi lần lật trang
    // hay gõ tìm kiếm là cả bảng chớp trắng một nhịp.
    { keepPreviousData: true },
  );

  const qualityLevelById = useQualityLevelMap();

  const rows = useTrackingRows(data, qualityLevelById, todayYmd);

  const departments = data?.departments ?? [];
  const counts = data?.tabCounts ?? EMPTY_TAB_COUNTS;
  const groups = data?.groups ?? null;
  const total = data?.total ?? 0;
  const safePage = data?.page ?? page;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const refresh = async () => {
    await mutate();
  };

  /*
    Bốn thao tác dòng gom lại thành hàm đặt tên, vì giờ có hai chỗ dựng bảng:
    danh sách phẳng ở đây, và từng nhóm tự dựng bảng của nó. Viết inline ở cả
    hai nơi là hai bản dễ trôi lệch nhau.
  */
  const openDetail = useCallback((row: TrackingRow) => {
    setDetailRow(row);
    setDetailOpen(true);
  }, []);
  const openEdit = useCallback((row: TrackingRow) => {
    setEditRow(row);
    setEditOpen(true);
  }, []);
  const openReturn = useCallback((row: TrackingRow) => {
    setReturnRow(row);
    setReturnReason("");
  }, []);
  const openDayReport = useCallback(
    (ownerId: string, ownerName: string, dates: string[]) => {
      setDayReport({ ownerId, ownerName, dates });
      setDayReportDate(dates[0] ?? null);
    },
    [],
  );

  /** Chưa có việc nào và không khớp bộ lọc là hai chuyện, nói cho đúng cái nào. */
  const emptyText =
    counts.ALL === 0
      ? "Chưa có nhiệm vụ nào của cấp dưới ở chỗ bạn."
      : "Không có nhiệm vụ nào khớp bộ lọc.";

  /**
   * Chốt hoàn thành đi kèm chấm điểm - mở form thẩm định chứ không chốt thẳng.
   * Điểm chỉ huy chấm mới là số vào công thức, nên không thể bỏ qua bước này.
   */
  const openScore = (row: TrackingRow) => {
    setScoreRow(row);
    setScoreOpen(true);
  };

  const doReturn = async () => {
    if (!returnRow) return;
    const reason = returnReason.trim();
    if (!reason) {
      toast.error("Lý do trả lại là bắt buộc.");
      return;
    }
    setBusyId(returnRow.item.id);
    try {
      await reviewPersonalMission({
        itemIds: [returnRow.item.id],
        decision: "RETURN",
        reason,
      });
      toast.success("Đã trả lại nhiệm vụ để cán bộ làm tiếp.");
      setReturnRow(null);
      setReturnReason("");
      await refresh();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không trả lại được."));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            Theo dõi nhiệm vụ cá nhân
          </h1>
          <p className="text-sm text-muted-foreground">
            Từng nhiệm vụ cán bộ tự đăng ký trong báo cáo ngày đều được chỉ huy
            theo dõi tiến độ tới khi xác nhận hoàn thành.
          </p>
        </div>

        {/*
          Khối A thu về một nút cạnh tiêu đề, bấm mới bung ra hộp thoại.

          Nó vẫn phải tách khỏi bảng nhiệm vụ - chấm cho CẢ THÁNG của một cán bộ
          chứ không phải một việc, và duyệt theo cả bảng, nên bộ lọc theo trục /
          hạn / tiến độ đều vô nghĩa với nó. Nhưng để nguyên cả bảng nằm đây thì
          nó đẩy bảng nhiệm vụ - thứ ngày nào cũng phải xem - xuống khỏi màn
          hình, trong khi bảng A cả tháng mới đụng vài lần.

          Không có bảng nào chờ thì component tự trả về null, nút biến mất.
        */}
        <CriteriaReviewCard
          blocks={data?.criteria ?? null}
          canForwardUp={data?.canForwardUp ?? false}
          onDone={refresh}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard
          label="Nhiệm vụ đang theo dõi"
          value={String(counts.ALL)}
          hint={`Mới hôm nay: ${counts.TODAY} · Tồn đọng: ${counts.BACKLOG}`}
          icon={Crosshair}
        />
        <StatCard
          label="Trễ hạn"
          value={String(counts.OVERDUE)}
          icon={TriangleAlert}
          tone={missionTone.danger}
        />
        <StatCard
          label="Chờ xác nhận hoàn thành"
          value={String(counts.AWAITING)}
          icon={CheckCheck}
          tone={missionTone.warning}
        />
        {/*
          "Hoàn thành" tách khỏi dòng phụ của Tiến độ trung bình: đó là con số
          chỉ huy tìm để biết đã chốt được bao nhiêu, không phải chú thích của
          một chỉ số khác.
        */}
        <StatCard
          label="Hoàn thành"
          value={String(counts.DONE)}
          icon={CircleCheck}
          tone={missionTone.success}
        />
        {/*
          "Chưa cập nhật" cũng tách khỏi dòng phụ của Trễ hạn: hai thứ khác
          nhau hẳn - trễ hạn là quá ngày phải xong, còn đây là việc chưa quá hạn
          nhưng nhiều ngày không ai đụng tới. Gộp làm một dòng khiến chỉ huy bỏ
          sót nhóm thứ hai.
        */}
        <StatCard
          label={`Chưa cập nhật ≥ ${SILENCE_ALERT_DAYS} ngày`}
          value={String(counts.SILENT)}
          icon={MessageSquareWarning}
          tone={missionTone.warning}
        />
      </div>

      <Card className="shadow-sm">
        <CardContent className="space-y-4 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="bg-background pl-8 placeholder:text-muted-foreground/70"
                placeholder="Tìm cán bộ, nhiệm vụ, trục công tác..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>

            <Select
              value={departmentId}
              onValueChange={(value) => {
                setDepartmentId(value);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[180px] bg-background">
                <SelectValue placeholder="Đơn vị" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Tất cả đơn vị</SelectItem>
                {departments.map((department) => (
                  <SelectItem key={department.id} value={department.id}>
                    {department.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Nói rõ lọc theo ngày nào - "từ ngày / đến ngày" trơ trọi dễ bị
                hiểu thành ngày gửi. */}
            <DateRangeFilter
              from={fromDate}
              to={toDate}
              isDefault={usingDefaultWeek}
              onFromChange={(value) => {
                setFromOverride(value);
                setPage(1);
              }}
              onToChange={(value) => {
                setToOverride(value);
                setPage(1);
              }}
              onReset={() => {
                setFromOverride(null);
                setToOverride(null);
                setPage(1);
              }}
            />

            <SegmentedTabs
              ariaLabel="Lọc theo tình trạng"
              value={tab}
              onChange={(next) => {
                setTab(next);
                setPage(1);
              }}
              items={TABS.map((entry) => ({
                value: entry.value,
                label: `${entry.label} (${counts[entry.value]})`,
              }))}
            />

            <SegmentedTabs
              ariaLabel="Cách nhóm danh sách"
              value={groupMode}
              onChange={(next) => {
                setGroupMode(next);
                // Xem phẳng đang ở trang 5 mà chuyển sang xem theo nhóm rồi
                // quay lại thì trang 5 có thể không còn tồn tại nữa.
                setPage(1);
              }}
              items={GROUP_MODES}
              className="ml-auto flex-nowrap border bg-transparent"
              indicatorClassName="bg-muted shadow-none"
            />
          </div>

          {groups ? (
            /*
              Xem theo nhóm: server trả TIÊU ĐỀ nhóm cho toàn bộ bộ lọc, dòng
              thì để từng nhóm tự tải khi người dùng bung ra.

              Nhờ vậy con số ở tiêu đề luôn đúng trên cả khoảng ngày mà không
              phải tải dòng nào - cấp có năm chục đơn vị vẫn mở trang tức thì,
              còn ai muốn xem chi tiết đơn vị nào thì bấm mở đúng đơn vị đó.
            */
            <div className="space-y-3">
              {groups.length === 0 ? (
                <div className="rounded-md border p-10 text-center text-sm text-muted-foreground">
                  {emptyText}
                </div>
              ) : (
                groups.map((group) => (
                  <TrackingGroupPanel
                    key={group.key || "__unknown__"}
                    group={group}
                    boardQuery={boardQuery}
                    groupMode={groupMode}
                    qualityLevelById={qualityLevelById}
                    todayYmd={todayYmd}
                    axisOrderById={axisOrderById}
                    busyId={busyId}
                    onOpenDayReport={openDayReport}
                    onDetail={openDetail}
                    onEdit={openEdit}
                    onComplete={openScore}
                    onReturn={openReturn}
                  />
                ))
              )}
            </div>
          ) : isLoading ? (
            <div className="rounded-md border p-10 text-center text-sm text-muted-foreground">
              Đang tải...
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-md border p-10 text-center text-sm text-muted-foreground">
              {emptyText}
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border">
              <TrackingTable
                rows={rows}
                busyId={busyId}
                axisOrderById={axisOrderById}
                onDetail={openDetail}
                onEdit={openEdit}
                onComplete={openScore}
                onReturn={openReturn}
              />
            </div>
          )}

          {groupMode === "TASK" ? (
            <TablePagination
              page={safePage}
              limit={limit}
              total={total}
              totalPages={totalPages}
              onPageChange={setPage}
              onLimitChange={setLimit}
              disabled={isLoading}
            />
          ) : null}
        </CardContent>
      </Card>

      <ReviewerEditDialog
        open={editOpen}
        item={editRow?.item ?? null}
        onOpenChange={setEditOpen}
        /* Sửa xong quay về đúng hộp thoại chi tiết của nhiệm vụ đó - người
           duyệt xem lại ngay số vừa sửa và mốc vừa ghi vào nhật ký. */
        onSaved={async () => {
          await refresh();
          if (editRow) {
            setDetailRow(editRow);
            setDetailOpen(true);
          }
        }}
      />

      <StaffDayReportDialog
        open={!!dayReport}
        onOpenChange={(next) => {
          if (!next) setDayReport(null);
        }}
        ownerId={dayReport?.ownerId ?? null}
        ownerName={dayReport?.ownerName ?? ""}
        reportDate={dayReportDate}
        onReportDateChange={setDayReportDate}
        availableDates={dayReport?.dates ?? []}
        axisOrderById={axisOrderById}
      />

      <ReviewScoreDialog
        open={scoreOpen}
        item={scoreRow?.item ?? null}
        template={scoreRow?.template ?? null}
        progressPercent={scoreRow?.summary.progressPercent ?? null}
        tracksProgress={scoreRow?.summary.tracksProgress ?? false}
        onOpenChange={setScoreOpen}
        onScored={refresh}
      />

      <ProgressUpdateDialog
        open={detailOpen && Boolean(detailRow)}
        item={detailRow?.item ?? null}
        template={detailRow?.template ?? null}
        readOnly
        onOpenChange={setDetailOpen}
        onSaved={refresh}
        /* Quyết ngay trong màn chi tiết: đóng chi tiết rồi mở đúng form của
           dòng đang xem, khỏi phải dò lại ngoài bảng. */
        onComplete={() => {
          setDetailOpen(false);
          if (detailRow) openScore(detailRow);
        }}
        /* Sửa / trả lại chỉ áp cho việc còn chờ mình quyết - hộp thoại không
           tự đoán luật, màn gọi truyền vào hay không truyền. */
        onEdit={
          detailRow && canReviewPersonalMission(detailRow.item.status)
            ? () => {
                setDetailOpen(false);
                setEditRow(detailRow);
                setEditOpen(true);
              }
            : undefined
        }
        onReturn={
          detailRow && canReviewPersonalMission(detailRow.item.status)
            ? () => {
                setDetailOpen(false);
                setReturnRow(detailRow);
                setReturnReason("");
              }
            : undefined
        }
      />

      <Dialog
        open={!!returnRow}
        onOpenChange={(open) => {
          if (!open && !busyId) setReturnRow(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Trả lại nhiệm vụ</DialogTitle>
            <DialogDescription>
              {returnRow
                ? `${returnRow.ownerName} · ${returnRow.summary.title || returnRow.item.workContentName}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="return-reason">
              Lý do trả lại <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="return-reason"
              className="min-h-[96px]"
              placeholder="Nêu rõ cần bổ sung gì để cán bộ làm tiếp..."
              value={returnReason}
              onChange={(e) => setReturnReason(e.target.value)}
              disabled={!!busyId}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="bg-background"
              onClick={() => setReturnRow(null)}
              disabled={!!busyId}
            >
              Hủy
            </Button>
            <Button
              type="button"
              onClick={() => void doReturn()}
              disabled={!!busyId || !returnReason.trim()}
            >
              <Undo2 className="h-4 w-4" />
              Trả lại
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
