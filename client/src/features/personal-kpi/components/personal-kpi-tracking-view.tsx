"use client";

import { useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCheck,
  ChevronDown,
  Crosshair,
  Eye,
  Search,
  TrendingUp,
  TriangleAlert,
  Undo2,
  X,
} from "lucide-react";
import useSWR from "swr";
import { toast } from "sonner";

import { SegmentedTabs } from "@/components/common/segmented-tabs";
import { TablePagination } from "@/components/common/table-pagination";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent } from "@/components/ui/card";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
import { useQualityLevelMap } from "@/features/kpi-form-config/use-quality-levels";
import {
  fetchPersonalKpiBoard,
  mapPersonalKpiFromApi,
  reviewPersonalKpi,
  type PersonalKpiBoardRow,
} from "@/features/personal-kpi/api";
import { ProgressUpdateDialog } from "@/features/personal-kpi/components/progress-update-dialog";
import {
  kpiTone,
  personalKpiStatusBadgeClass,
} from "@/features/personal-kpi/status-styles";
import {
  SILENCE_ALERT_DAYS,
  WORK_STATE_LABEL,
  deadlineState,
  silenceDays,
  summarizeTask,
  workState,
  type DeadlineState,
  type TaskSummary,
  type WorkState,
} from "@/features/personal-kpi/task-summary";
import {
  PERSONAL_KPI_STATUS_LABEL,
  type PersonalKpiItem,
} from "@/features/personal-kpi/types";
import { useListPagination } from "@/hooks/use-list-pagination";
import { useServerTime } from "@/hooks/use-server-time";
import { getApiErrorMessage } from "@/lib/api-client";
import { currentWeekRange, formatYmd, serverYmd } from "@/lib/server-time";
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

function matchesTab(row: TrackingRow, tab: TabValue, todayYmd: string): boolean {
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
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function dateToYmd(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function ymdToDate(ymd: string): Date | undefined {
  const [year, month, day] = ymd.split("-").map(Number);
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day, 12);
}

/**
 * Ô chọn ngày cho bộ lọc.
 * Dùng lịch riêng chứ không dùng input type="date" vì ô đó hiện ngày theo ngôn
 * ngữ trình duyệt - máy cài tiếng Anh sẽ ra 08/17/2026.
 */
function DateFilterButton({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex items-center gap-0.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "gap-2 bg-background font-normal",
              !value && "text-muted-foreground",
            )}
          >
            <CalendarDays className="size-4 text-muted-foreground" />
            {value ? formatYmd(value) : label}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            defaultMonth={ymdToDate(value)}
            selected={ymdToDate(value)}
            onSelect={(picked) => {
              if (!picked) return;
              setOpen(false);
              onChange(dateToYmd(picked));
            }}
          />
        </PopoverContent>
      </Popover>
      {value ? (
        <Button
          size="icon"
          variant="ghost"
          className="size-8 shrink-0"
          onClick={() => onChange("")}
          aria-label={`Bỏ lọc ${label.toLowerCase()}`}
        >
          <X className="size-4" />
        </Button>
      ) : null}
    </div>
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

/** Thanh tiến độ nhỏ dùng cho cả dòng nhiệm vụ lẫn tiêu đề nhóm. */
function ProgressBar({
  percent,
  className,
}: {
  percent: number;
  className?: string;
}) {
  return (
    <div
      className={cn("h-1.5 overflow-hidden rounded-full bg-muted", className)}
    >
      <div
        className={cn(
          "h-full rounded-full",
          percent >= 100
            ? "bg-emerald-500"
            : percent < 50
              ? "bg-rose-500"
              : "bg-primary",
        )}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

type TrackingTableProps = {
  rows: TrackingRow[];
  /** Dòng đang chờ thao tác chạy xong - khoá nút của riêng dòng đó. */
  busyId: string | null;
  onDetail: (row: TrackingRow) => void;
  onComplete: (row: TrackingRow) => void;
  onReturn: (row: TrackingRow) => void;
};

/** Bảng nhiệm vụ - dùng lại cho cả xem phẳng lẫn từng nhóm thu gọn được. */
function TrackingTable({
  rows,
  busyId,
  onDetail,
  onComplete,
  onReturn,
}: TrackingTableProps) {
  return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[180px]">Cán bộ</TableHead>
            <TableHead className="w-[360px]">
              Trục · Nhiệm vụ
            </TableHead>
            <TableHead className="w-[190px] whitespace-nowrap">
              Tiến độ
            </TableHead>
            <TableHead className="w-[140px]">Hạn</TableHead>
            <TableHead className="w-[130px]">
              Trạng thái duyệt
            </TableHead>
            <TableHead className="w-[110px]">Chất lượng</TableHead>
            <TableHead className="w-[160px]">
              Tình trạng thực hiện
            </TableHead>
            <TableHead className="w-[210px] text-right">
              Thao tác
            </TableHead>
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
                      className={cn(
                        "font-normal",
                        kpiTone.info.soft,
                      )}
                    >
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
                  {row.summary.progressPercent === null ? (
                    <span className="text-sm text-muted-foreground">
                      -
                    </span>
                  ) : (
                    <div className="flex items-center gap-2">
                      <ProgressBar
                        percent={row.summary.progressPercent}
                        className="flex-1"
                      />
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                        {row.summary.progressPercent}%
                      </span>
                    </div>
                  )}
                  <div className="mt-1 whitespace-nowrap text-xs text-muted-foreground">
                    {lastTouchedLabel(row)}
                  </div>
                </TableCell>

                <TableCell className="align-middle">
                  {row.summary.deadline ? (
                    <>
                      <div className="whitespace-nowrap text-sm tabular-nums">
                        {formatYmd(row.summary.deadline)}
                      </div>
                      {row.deadline ? (
                        <Badge
                          variant="secondary"
                          className={cn(
                            "font-normal",
                            row.deadline.tone === "danger"
                              ? kpiTone.danger.soft
                              : row.deadline.tone === "warning"
                                ? kpiTone.warning.soft
                                : kpiTone.neutral.soft,
                          )}
                        >
                          {row.deadline.label}
                        </Badge>
                      ) : null}
                    </>
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      -
                    </span>
                  )}
                </TableCell>

                <TableCell className="align-middle">
                  <Badge
                    variant="secondary"
                    className={personalKpiStatusBadgeClass(
                      row.item.status,
                    )}
                  >
                    {PERSONAL_KPI_STATUS_LABEL[row.item.status]}
                  </Badge>
                </TableCell>

                <TableCell className="align-middle text-sm tabular-nums">
                  {row.summary.qualityPercent === null ? (
                    <span className="text-muted-foreground">
                      -
                    </span>
                  ) : (
                    `${row.summary.qualityPercent}%`
                  )}
                </TableCell>

                <TableCell className="align-middle">
                  <div className="flex flex-wrap gap-1">
                    <Badge
                      variant="secondary"
                      className={cn(
                        "font-normal",
                        row.work === "DONE"
                          ? kpiTone.success.soft
                          : row.work === "IN_PROGRESS"
                            ? kpiTone.info.soft
                            : kpiTone.neutral.soft,
                      )}
                    >
                      {WORK_STATE_LABEL[row.work]}
                    </Badge>
                    {isOverdue(row) ? (
                      <Badge
                        variant="secondary"
                        className={cn(
                          "font-normal",
                          kpiTone.danger.soft,
                        )}
                      >
                        Trễ hạn
                      </Badge>
                    ) : isDueSoon(row) ? (
                      <Badge
                        variant="secondary"
                        className={cn(
                          "font-normal",
                          kpiTone.warning.soft,
                        )}
                      >
                        Sắp đến hạn
                      </Badge>
                    ) : null}
                    {isSilent(row) ? (
                      <Badge
                        variant="secondary"
                        className={cn(
                          "font-normal",
                          kpiTone.warning.soft,
                        )}
                      >
                        Im lặng {row.silence} ngày
                      </Badge>
                    ) : null}
                  </div>
                </TableCell>

                <TableCell className="text-right align-middle">
                  <div className="inline-flex flex-wrap justify-end gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="bg-background"
                      onClick={() => onDetail(row)}
                    >
                      <Eye className="h-4 w-4" />
                      Chi tiết
                    </Button>
                    {/* Chốt / trả lại chỉ áp cho việc đang chờ
                        quyết ở chỗ mình. */}
                    {row.item.status === "PENDING" ? (
                      <>
                        <Button
                          size="sm"
                          onClick={() => onComplete(row)}
                          disabled={busy || !awaiting}
                          title={
                            awaiting
                              ? "Chốt hoàn thành nhiệm vụ này"
                              : "KPI tiến độ chưa đạt 100%"
                          }
                        >
                          <CheckCheck className="h-4 w-4" />
                          Hoàn thành
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-rose-300 bg-background text-rose-600 hover:border-rose-400 hover:bg-rose-50 hover:text-rose-700 dark:border-rose-900 dark:text-rose-400"
                          onClick={() => onReturn(row)}
                          disabled={busy}
                        >
                          <Undo2 className="h-4 w-4" />
                          Trả lại
                        </Button>
                      </>
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
  const [detailRow, setDetailRow] = useState<TrackingRow | null>(null);
  const [returnRow, setReturnRow] = useState<TrackingRow | null>(null);
  const [returnReason, setReturnReason] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

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
          );
          const department =
            raw.ownerDepartmentId && typeof raw.ownerDepartmentId === "object"
              ? (raw.ownerDepartmentId.name ?? "")
              : "";
          result.push({
            item,
            template: axis.template,
            summary,
            deadline: deadlineState(summary.deadline, todayYmd),
            work: workState(summary.progressPercent),
            silence: silenceDays(
              item.lastProgressAt ?? item.createdAt,
              todayYmd,
            ),
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

  const doComplete = async (row: TrackingRow) => {
    setBusyId(row.item.id);
    try {
      const result = await reviewPersonalKpi({
        itemIds: [row.item.id],
        decision: "COMPLETE",
      });
      toast.success(`Đã chốt hoàn thành ${result.count} nhiệm vụ.`);
      await refresh();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không chốt được."));
    } finally {
      setBusyId(null);
    }
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

      <Card className="shadow-sm">
        <CardContent className="space-y-4 py-5">
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
            <span className="text-sm text-muted-foreground">Ngày báo cáo</span>
            <DateFilterButton
              label="Từ ngày"
              value={fromDate}
              onChange={setFromOverride}
            />
            <DateFilterButton
              label="Đến ngày"
              value={toDate}
              onChange={setToOverride}
            />
            {usingDefaultWeek ? (
              <span className="text-xs text-muted-foreground">Tuần này</span>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFromOverride(null);
                  setToOverride(null);
                }}
              >
                Về tuần này
              </Button>
            )}

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
                    onDetail={setDetailRow}
                    onComplete={(row) => void doComplete(row)}
                    onReturn={(row) => {
                      setReturnRow(row);
                      setReturnReason("");
                    }}
                  />
                );

                // Xem phẳng thì không có tiêu đề nhóm nên chẳng có gì để thu.
                if (!group.label) {
                  return (
                    <div key="all" className="overflow-hidden rounded-lg border">
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
                          <ProgressBar percent={groupPercent} className="flex-1" />
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

      <ProgressUpdateDialog
        item={detailRow?.item ?? null}
        template={detailRow?.template ?? null}
        readOnly
        onOpenChange={(open) => {
          if (!open) setDetailRow(null);
        }}
        onSaved={refresh}
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
