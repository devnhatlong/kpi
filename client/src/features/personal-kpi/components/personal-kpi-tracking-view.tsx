"use client";

import { useMemo, useState } from "react";
import {
  CheckCheck,
  ChevronDown,
  Crosshair,
  Eye,
  MoreHorizontal,
  PencilLine,
  Search,
  TrendingUp,
  TriangleAlert,
  Undo2,
} from "lucide-react";
import useSWR from "swr";
import { toast } from "sonner";

import { DateRangeFilter } from "@/components/common/date-range-filter";
import { SegmentedTabs } from "@/components/common/segmented-tabs";
import { TablePagination } from "@/components/common/table-pagination";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
import type { ResolvedTemplate } from "@/features/kpi-form-config/form-template-utils";
import { entityId } from "@/features/kpi-form-config/types";
import { useQualityLevelMap } from "@/features/kpi-form-config/use-quality-levels";
import { useScopedAxes } from "@/features/kpi-form-config/use-scoped-axes";
import {
  fetchPersonalKpiBoard,
  mapPersonalKpiFromApi,
  reviewPersonalKpi,
  type PersonalKpiBoardRow,
} from "@/features/personal-kpi/api";
import { CriteriaReviewCard } from "@/features/personal-kpi/components/criteria-review-card";
import {
  DeadlineCell,
  ProgressBar,
  WorkStateBadge,
} from "@/features/personal-kpi/components/kpi-cells";
import { ProgressUpdateDialog } from "@/features/personal-kpi/components/progress-update-dialog";
import { ReviewerEditDialog } from "@/features/personal-kpi/components/reviewer-edit-dialog";
import { ReviewScoreDialog } from "@/features/personal-kpi/components/review-score-dialog";
import {
  kpiTone,
  personalKpiStatusBadgeClass,
} from "@/features/personal-kpi/status-styles";
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
} from "@/features/personal-kpi/task-summary";
import {
  PERSONAL_KPI_STATUS_LABEL,
  canReviewPersonalKpi,
  type PersonalKpiItem,
} from "@/features/personal-kpi/types";
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
  { value: "SILENT", label: "Im lặng" },
  { value: "AWAITING", label: "Chờ xác nhận" },
  { value: "DONE", label: "Hoàn thành" },
];

type GroupMode = "TASK" | "AXIS" | "UNIT";

const GROUP_MODES: Array<{ value: GroupMode; label: string }> = [
  { value: "TASK", label: "Theo nhiệm vụ" },
  { value: "AXIS", label: "Theo trục" },
  { value: "UNIT", label: "Theo đơn vị" },
];

type TrackingRow = {
  item: PersonalKpiItem;
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
  haystack: string;
};

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/đ/g, "d")
    .trim();
}

/**
 * Chữ cái đầu của HAI từ cuối tên: "Nguyễn Nhật Long" -> "NL".
 * Tên Việt phân biệt nhau ở tên đệm và tên, không phải ở họ - lấy chữ đầu của
 * họ thì cả phòng toàn chữ "N".
 */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return parts
    .slice(-2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

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

function matchesTab(
  row: TrackingRow,
  tab: TabValue,
  todayYmd: string,
): boolean {
  switch (tab) {
    case "ALL":
      return true;
    case "TODAY":
      return row.reportDate === todayYmd;
    case "BACKLOG":
      return row.reportDate < todayYmd && row.item.status !== "COMPLETED";
    case "OVERDUE":
      return isOverdue(row);
    case "DUE_SOON":
      return isDueSoon(row);
    case "SILENT":
      return isSilent(row);
    case "AWAITING":
      return isAwaitingConfirm(row);
    case "DONE":
      return row.item.status === "COMPLETED";
  }
}

/** "Cập nhật N ngày trước" - đọc từ mốc cập nhật tiến độ gần nhất. */
function lastTouchedLabel(row: TrackingRow): string {
  if (!row.item.lastProgressAt) return "Chưa cập nhật tiến độ";
  if (row.silence === null) return "Chưa cập nhật tiến độ";
  if (row.silence === 0) return "Cập nhật hôm nay";
  return `Cập nhật ${row.silence} ngày trước`;
}

function averagePercent(rows: TrackingRow[]): number | null {
  const values = rows
    .map((row) => row.summary.progressPercent)
    .filter((value): value is number => value !== null);
  if (!values.length) return null;
  return Math.round(
    values.reduce((sum, value) => sum + value, 0) / values.length,
  );
}

type StatCardProps = {
  label: string;
  value: string;
  hint?: string;
  icon: typeof Crosshair;
  tone?: { text: string; icon: string };
};

function StatCard({ label, value, hint, icon: Icon, tone }: StatCardProps) {
  return (
    <Card className="shadow-sm">
      <CardContent className="space-y-1.5 py-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <div className="flex items-center gap-2">
          <Icon className={cn("size-5 shrink-0", tone?.text)} />
          <span
            className={cn("text-2xl font-semibold tabular-nums", tone?.text)}
          >
            {value}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">{hint ?? " "}</p>
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
 * Ô "Kết quả KPI" - tự đổi cách bày theo MẪU của chính dòng đó.
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
              result.failed ? kpiTone.danger.soft : kpiTone.success.soft,
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
        NHÓM CỘT ("KPI tiến độ (B)") chứ không gọi tên cột: mẫu thật đặt hai cột
        trùng tên "Thực tế hoàn thành %" nên nói tên cột thì không biết là tiến
        độ hay chất lượng.
      */}
      {summary.reviewChanges.map((change) => (
        <p
          key={change.field}
          className={cn(
            "whitespace-nowrap text-xs tabular-nums",
            change.to < change.from ? kpiTone.danger.text : kpiTone.success.text,
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
          <TableHead className="w-[180px]">Cán bộ</TableHead>
          <TableHead className="w-[340px]">Biểu mẫu · Nhiệm vụ</TableHead>
          {/* MỘT cột kết quả, tự đổi theo mẫu của từng dòng. Ba cột cố định
              Tiến độ / Chất lượng / Kết quả chỉ đúng với một loại trục; danh
              sách trộn nhiều trục thì loại nào cũng sai với một nửa số dòng. */}
          <TableHead className="w-[230px]">Kết quả KPI</TableHead>
          {showDeadline ? (
            <TableHead className="w-[140px]">Hạn</TableHead>
          ) : null}
          <TableHead className="w-[130px]">Trạng thái duyệt</TableHead>
          <TableHead className="w-[160px]">Tình trạng thực hiện</TableHead>
          <TableHead className="w-[210px] text-right">Thao tác</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const awaiting = isAwaitingConfirm(row);
          const busy = busyId === row.item.id;
          return (
            <TableRow key={row.item.id}>
              <TableCell className="align-middle">
                <div className="flex items-center gap-2">
                  <Avatar className="size-8">
                    <AvatarFallback className="text-xs">
                      {initialsOf(row.ownerName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {row.ownerName}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {row.ownerDepartmentName}
                    </div>
                  </div>
                </div>
              </TableCell>

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
                    className={cn("gap-1 font-normal", kpiTone.info.soft)}
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
                  className={personalKpiStatusBadgeClass(row.item.status)}
                >
                  {PERSONAL_KPI_STATUS_LABEL[row.item.status]}
                </Badge>
                {row.summary.reviewLowered ? (
                  <Badge
                    variant="secondary"
                    className={cn("mt-1 font-normal", kpiTone.danger.soft)}
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
                      className={cn("font-normal", kpiTone.danger.soft)}
                    >
                      Trễ hạn
                    </Badge>
                  ) : isDueSoon(row) ? (
                    <Badge
                      variant="secondary"
                      className={cn("font-normal", kpiTone.warning.soft)}
                    >
                      Sắp đến hạn
                    </Badge>
                  ) : null}
                  {isSilent(row) ? (
                    <Badge
                      variant="secondary"
                      className={cn("font-normal", kpiTone.warning.soft)}
                    >
                      Im lặng {row.silence} ngày
                    </Badge>
                  ) : null}
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
                              className={cn("text-xs", kpiTone.warning.text)}
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

export function PersonalKpiTrackingView() {
  const [tab, setTab] = useState<TabValue>("ALL");
  const [groupMode, setGroupMode] = useState<GroupMode>("UNIT");
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
  const [detailId, setDetailId] = useState<string | null>(null);
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

  // Lấy hết việc đang ở chỗ mình, kể cả đã chốt - đếm tab và số thống kê phải
  // theo toàn bộ chứ không theo tab đang xem.
  const boardQuery = useMemo(
    () => ({
      includeDecided: true,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
    }),
    [fromDate, toDate],
  );
  const { data, isLoading, mutate } = useSWR(
    ["personal-kpi", "tracking-board", fromDate, toDate],
    () => fetchPersonalKpiBoard(boardQuery),
  );

  const qualityLevelById = useQualityLevelMap();

  const rows = useMemo<TrackingRow[]>(() => {
    const result: TrackingRow[] = [];
    for (const axis of data?.axes ?? []) {
      for (const group of axis.groups) {
        for (const raw of group.rows as PersonalKpiBoardRow[]) {
          const item = mapPersonalKpiFromApi(raw);
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
            haystack: normalizeText(
              [
                summary.title,
                item.workContentName,
                item.axisName,
                item.ownerName ?? "",
                department,
              ].join(" "),
            ),
          });
        }
      }
    }
    return result;
  }, [data, qualityLevelById, todayYmd]);

  /** Dòng đang mở ở hộp thoại chi tiết, luôn lấy bản mới nhất của danh sách. */
  const detailRow = useMemo(
    () => rows.find((row) => row.item.id === detailId) ?? null,
    [rows, detailId],
  );

  const departments = useMemo(() => {
    const names = new Set(rows.map((row) => row.ownerDepartmentName));
    return [...names].sort((a, b) => a.localeCompare(b, "vi"));
  }, [rows]);

  /** Bộ lọc đơn vị + tìm kiếm áp trước, tab đếm trên phần còn lại. */
  const scoped = useMemo(() => {
    const term = normalizeText(debouncedQuery);
    return rows.filter(
      (row) =>
        (departmentId === ALL || row.ownerDepartmentName === departmentId) &&
        (!term || row.haystack.includes(term)),
    );
  }, [rows, departmentId, debouncedQuery]);

  const counts = useMemo(() => {
    const byTab = (value: TabValue) =>
      scoped.filter((row) => matchesTab(row, value, todayYmd)).length;
    return {
      ALL: scoped.length,
      TODAY: byTab("TODAY"),
      BACKLOG: byTab("BACKLOG"),
      OVERDUE: byTab("OVERDUE"),
      DUE_SOON: byTab("DUE_SOON"),
      SILENT: byTab("SILENT"),
      AWAITING: byTab("AWAITING"),
      DONE: byTab("DONE"),
    };
  }, [scoped, todayYmd]);

  const filtered = useMemo(
    () => scoped.filter((row) => matchesTab(row, tab, todayYmd)),
    [scoped, tab, todayYmd],
  );

  /**
   * Phân trang chỉ áp cho kiểu xem phẳng. Xem theo nhóm mà cắt trang thì một
   * đơn vị bị xẻ đôi qua hai trang, con số ở tiêu đề nhóm đọc ra thành sai.
   */
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(page, totalPages);
  const pageRows = useMemo(
    () => filtered.slice((safePage - 1) * limit, safePage * limit),
    [filtered, safePage, limit],
  );

  const groups = useMemo(() => {
    if (groupMode === "TASK") {
      return [{ label: "", rows: pageRows }];
    }
    const byKey = new Map<string, TrackingRow[]>();
    for (const row of filtered) {
      const key =
        groupMode === "AXIS"
          ? row.item.axisName || "Chưa rõ trục"
          : row.ownerDepartmentName;
      byKey.set(key, [...(byKey.get(key) ?? []), row]);
    }
    return [...byKey.entries()]
      .sort(([left], [right]) => left.localeCompare(right, "vi"))
      .map(([label, groupRows]) => ({ label, rows: groupRows }));
  }, [filtered, pageRows, groupMode]);

  const averageAll = averagePercent(scoped);

  const refresh = async () => {
    await mutate();
  };

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
      await reviewPersonalKpi({
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
      <div className="space-y-1">
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          Theo dõi nhiệm vụ KPI cá nhân
        </h1>
        <p className="text-sm text-muted-foreground">
          Từng nhiệm vụ cán bộ tự đăng ký trong báo cáo ngày đều được chỉ huy
          theo dõi tiến độ tới khi xác nhận hoàn thành.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Nhiệm vụ đang theo dõi"
          value={String(counts.ALL)}
          hint={`Mới hôm nay: ${counts.TODAY} · Tồn đọng: ${counts.BACKLOG}`}
          icon={Crosshair}
        />
        <StatCard
          label="Trễ hạn"
          value={String(counts.OVERDUE)}
          hint={`Im lặng ≥ ${SILENCE_ALERT_DAYS} ngày: ${counts.SILENT}`}
          icon={TriangleAlert}
          tone={kpiTone.danger}
        />
        <StatCard
          label="Chờ xác nhận hoàn thành"
          value={String(counts.AWAITING)}
          icon={CheckCheck}
          tone={kpiTone.warning}
        />
        <StatCard
          label="Tiến độ trung bình"
          value={averageAll === null ? "-" : `${averageAll} %`}
          hint={`Đã hoàn thành: ${counts.DONE}`}
          icon={TrendingUp}
          tone={kpiTone.success}
        />
      </div>

      {/*
        Khối A đứng riêng phía trên bảng nhiệm vụ: nó chấm cho CẢ NGÀY của một
        cán bộ chứ không phải một việc, và duyệt theo cả bảng - trộn vào danh
        sách nhiệm vụ thì bộ lọc theo trục / hạn / tiến độ đều vô nghĩa với nó.
      */}
      <CriteriaReviewCard
        blocks={data?.criteria ?? null}
        canForwardUp={data?.canForwardUp ?? false}
        onDone={refresh}
      />

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
                {departments.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
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
              onFromChange={setFromOverride}
              onToChange={setToOverride}
              onReset={() => {
                setFromOverride(null);
                setToOverride(null);
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
              onChange={setGroupMode}
              items={GROUP_MODES}
              className="ml-auto flex-nowrap border bg-transparent"
              indicatorClassName="bg-muted shadow-none"
            />
          </div>

          {isLoading ? (
            <div className="rounded-md border p-10 text-center text-sm text-muted-foreground">
              Đang tải...
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-md border p-10 text-center text-sm text-muted-foreground">
              {rows.length === 0
                ? "Chưa có nhiệm vụ nào của cấp dưới ở chỗ bạn."
                : "Không có nhiệm vụ nào khớp bộ lọc."}
            </div>
          ) : (
            <div className="space-y-4">
              {groups.map((group) => {
                const groupOverdue = group.rows.filter(isOverdue).length;
                const groupSilent = group.rows.filter(isSilent).length;
                const groupDone = group.rows.filter(
                  (row) => row.item.status === "COMPLETED",
                ).length;
                const groupPercent = averagePercent(group.rows);
                const table = (
                  <TrackingTable
                    rows={group.rows}
                    busyId={busyId}
                    axisOrderById={axisOrderById}
                    onDetail={(row) => {
                      setDetailId(row.item.id);
                      setDetailOpen(true);
                    }}
                    onEdit={(row) => {
                      setEditRow(row);
                      setEditOpen(true);
                    }}
                    onComplete={openScore}
                    onReturn={(row) => {
                      setReturnRow(row);
                      setReturnReason("");
                    }}
                  />
                );

                // Xem phẳng thì không có tiêu đề nhóm nên chẳng có gì để thu.
                if (!group.label) {
                  return (
                    <div
                      key="all"
                      className="overflow-hidden rounded-lg border"
                    >
                      {table}
                    </div>
                  );
                }

                return (
                  <Collapsible
                    key={group.label}
                    defaultOpen
                    className="overflow-hidden rounded-lg border"
                  >
                    <div className="flex flex-wrap items-center gap-2 bg-muted/30 px-3 py-2.5">
                      {/* data-state nằm trên nút nên xoay mũi tên qua nút, icon
                          không mang thuộc tính đó. */}
                      <CollapsibleTrigger asChild>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="size-7 shrink-0 [&>svg]:transition-transform data-[state=closed]:[&>svg]:-rotate-90"
                          aria-label={`Thu gọn ${group.label}`}
                        >
                          <ChevronDown className="size-4" />
                        </Button>
                      </CollapsibleTrigger>
                      <span className="font-semibold">{group.label}</span>
                      <Badge
                        variant="secondary"
                        className={cn("font-normal", kpiTone.info.soft)}
                      >
                        {group.rows.length} nhiệm vụ
                      </Badge>
                      {groupOverdue > 0 ? (
                        <Badge
                          variant="secondary"
                          className={cn("font-normal", kpiTone.danger.soft)}
                        >
                          Trễ {groupOverdue}
                        </Badge>
                      ) : null}
                      {groupSilent > 0 ? (
                        <Badge
                          variant="secondary"
                          className={cn("font-normal", kpiTone.warning.soft)}
                        >
                          Im lặng {groupSilent}
                        </Badge>
                      ) : null}
                      {groupDone > 0 ? (
                        <Badge
                          variant="secondary"
                          className={cn("font-normal", kpiTone.success.soft)}
                        >
                          Hoàn thành {groupDone}
                        </Badge>
                      ) : null}
                      {groupPercent === null ? null : (
                        <div className="ml-auto flex min-w-[140px] items-center gap-2">
                          <ProgressBar
                            percent={groupPercent}
                            className="flex-1"
                          />
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {groupPercent}%
                          </span>
                        </div>
                      )}
                    </div>
                    <CollapsibleContent className="border-t">
                      {table}
                    </CollapsibleContent>
                  </Collapsible>
                );
              })}
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
            setDetailId(editRow.item.id);
            setDetailOpen(true);
          }
        }}
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
          detailRow && canReviewPersonalKpi(detailRow.item.status)
            ? () => {
                setDetailOpen(false);
                setEditRow(detailRow);
                setEditOpen(true);
              }
            : undefined
        }
        onReturn={
          detailRow && canReviewPersonalKpi(detailRow.item.status)
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
