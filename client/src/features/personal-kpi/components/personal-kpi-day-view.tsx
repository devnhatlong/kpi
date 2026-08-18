"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  Check,
  ChevronDown,
  CircleDot,
  ClipboardList,
  MessageSquareWarning,
  Plus,
  Search,
  Send,
  Table2,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import useSWR from "swr";
import { toast } from "sonner";

import { SegmentedTabs } from "@/components/common/segmented-tabs";
import { TablePagination } from "@/components/common/table-pagination";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useAuth } from "@/features/auth/auth-provider";
import { useQualityLevelMap } from "@/features/kpi-form-config/use-quality-levels";
import {
  deletePersonalKpi,
  fetchMyPersonalKpi,
  personalKpiKeys,
  submitPersonalKpiReport,
  type SubmitPersonalKpiPayload,
} from "@/features/personal-kpi/api";
import {
  DayTaskTable,
  isSilent,
  type DayTaskRow,
} from "@/features/personal-kpi/components/day-task-table";
import { PersonalReportDetailDrawer } from "@/features/personal-kpi/components/personal-report-detail-drawer";
import { PersonalTaskDrawer } from "@/features/personal-kpi/components/personal-task-drawer";
import { ProgressUpdateDialog } from "@/features/personal-kpi/components/progress-update-dialog";
import { SendRecipientDialog } from "@/features/personal-kpi/components/send-recipient-dialog";
import { kpiTone } from "@/features/personal-kpi/status-styles";
import {
  SILENCE_ALERT_DAYS,
  deadlineState,
  silenceDays,
  summarizeTask,
  workState,
} from "@/features/personal-kpi/task-summary";
import {
  canEditPersonalKpi,
  canSendPersonalKpi,
  type PersonalKpiItem,
} from "@/features/personal-kpi/types";
import { useAxisTemplates } from "@/features/personal-kpi/use-axis-templates";
import { useListPagination } from "@/hooks/use-list-pagination";
import { useServerTime } from "@/hooks/use-server-time";
import { getApiErrorMessage } from "@/lib/api-client";
import { formatYmd, serverYmd } from "@/lib/server-time";
import { cn } from "@/lib/utils";

/** Một ngày của một người hiếm khi quá vài chục việc - lấy hết rồi lọc tại chỗ
 * để đếm được số việc từng thẻ mà không phải gọi thêm API đếm. */
const DAY_FETCH_LIMIT = 200;

type TabValue = "ALL" | "DRAFT" | "PENDING" | "RETURNED" | "DONE";

const TABS: Array<{ value: TabValue; label: string }> = [
  { value: "ALL", label: "Tất cả" },
  { value: "DRAFT", label: "Chưa gửi" },
  { value: "PENDING", label: "Chờ duyệt" },
  { value: "RETURNED", label: "Trả lại" },
  { value: "DONE", label: "Hoàn thành" },
];

/** Chip trạng thái cạnh ô ngày - cao bằng nút chọn ngày cho thẳng hàng. */
const headerChipClass = "h-8 gap-1.5 rounded-md px-3 text-sm font-normal";

/** Cách bày danh sách: phẳng, gom theo trục, hay gom theo đơn vị. */
type GroupMode = "TASK" | "AXIS" | "UNIT";

const GROUP_MODES: Array<{ value: GroupMode; label: string }> = [
  { value: "TASK", label: "Theo nhiệm vụ" },
  { value: "AXIS", label: "Theo trục" },
  { value: "UNIT", label: "Theo đơn vị" },
];

function matchesTab(item: PersonalKpiItem, tab: TabValue): boolean {
  if (tab === "ALL") return true;
  if (tab === "DONE") {
    return item.status === "APPROVED" || item.status === "COMPLETED";
  }
  return item.status === tab;
}

/**
 * Ngày cho ô lịch. Lịch làm việc bằng Date của máy nên chỉ dựng đúng ngày /
 * tháng / năm ở giữa trưa - không quy đổi múi giờ ở đây, mọi phép tính ngày
 * nghiệp vụ đã nằm ở lib/server-time.
 */
function ymdToDate(ymd: string): Date | undefined {
  const [year, month, day] = ymd.split("-").map(Number);
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day, 12);
}

function dateToYmd(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/đ/g, "d")
    .trim();
}

/** Số việc trễ hạn trong một tập dòng - dùng cho cả thẻ đầu trang lẫn nhóm. */
function countOverdue(rows: DayTaskRow[]): number {
  return rows.filter(
    (row) =>
      row.deadline &&
      row.deadline.days < 0 &&
      row.work !== "DONE" &&
      !matchesTab(row.item, "DONE"),
  ).length;
}

/** Tiến độ trung bình của một nhóm; null khi cả nhóm chưa có số nào. */
function averagePercent(rows: DayTaskRow[]): number | null {
  const values = rows
    .map((row) => row.summary.progressPercent)
    .filter((value): value is number => value !== null);
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

type StatCardProps = {
  label: string;
  value: number;
  icon: LucideIcon;
  /** Màu chữ + nền huy hiệu icon, lấy theo tông trạng thái. */
  tone?: { text: string; icon: string };
};

function StatCard({ label, value, icon: Icon, tone }: StatCardProps) {
  return (
    <Card className="shadow-sm">
      <CardContent className="space-y-2 py-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-lg",
              tone?.icon ?? kpiTone.neutral.icon,
            )}
          >
            <Icon className="size-4" />
          </span>
          <span
            className={cn("text-2xl font-semibold tabular-nums", tone?.text)}
          >
            {value}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

type PersonalKpiDayViewProps = {
  /** Ngày báo cáo YYYY-MM-DD; bỏ trống = hôm nay theo giờ server. */
  reportDate?: string;
};

export function PersonalKpiDayView({ reportDate }: PersonalKpiDayViewProps) {
  const { page, setPage, limit, setLimit, query, setQuery, debouncedQuery } =
    useListPagination();
  const [tab, setTab] = useState<TabValue>("ALL");
  const [groupMode, setGroupMode] = useState<GroupMode>("TASK");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [edit, setEdit] = useState<PersonalKpiItem | null>(null);
  /** Nhiệm vụ đang mở ô cập nhật tiến độ hằng ngày. */
  const [progressItem, setProgressItem] = useState<PersonalKpiItem | null>(null);
  const [progressOpen, setProgressOpen] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [deleting, setDeleting] = useState<PersonalKpiItem | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [sendingItem, setSendingItem] = useState<PersonalKpiItem | null>(null);
  const [sendAllOpen, setSendAllOpen] = useState(false);
  const [sending, setSending] = useState(false);

  const router = useRouter();
  const { user } = useAuth();

  // Sync giờ server để "trễ hạn / còn N ngày" tính theo giờ hệ thống, không
  // theo đồng hồ máy người dùng.
  useServerTime();
  const todayYmd = serverYmd();
  const activeDate = reportDate || todayYmd;

  const listParams = useMemo(
    () => ({ reportDate: activeDate, page: 1, limit: DAY_FETCH_LIMIT }),
    [activeDate],
  );

  const { data, isLoading, mutate } = useSWR(
    personalKpiKeys.byDate(listParams),
    () => fetchMyPersonalKpi(listParams),
  );

  const items = useMemo(() => data?.data ?? [], [data]);

  // Bộ cột của mọi trục - cần để biết cột nào là tên việc, cột nào là hạn.
  const templates = useAxisTemplates(true);
  const hasQualityColumn = useMemo(
    () =>
      [...templates.byAxis.values()].some((template) =>
        template.columns.some(
          (column) => column.semanticKey === "quality_level",
        ),
      ),
    [templates.byAxis],
  );
  const qualityLevelById = useQualityLevelMap(hasQualityColumn);

  const rows = useMemo<DayTaskRow[]>(
    () =>
      items.map((item) => {
        const template = templates.byAxis.get(item.axisId) ?? null;
        const summary = summarizeTask(item.task, template, qualityLevelById, {
          values: item.reviewValues,
          catalogValues: item.reviewCatalogValues,
        });
        return {
          item,
          summary,
          deadline: deadlineState(summary.deadline, todayYmd),
          work: workState(summary.progressPercent),
          // Chưa cập nhật lần nào thì tính từ lúc đăng ký nhiệm vụ.
          silence: silenceDays(
            item.lastProgressAt ?? item.createdAt,
            todayYmd,
          ),
          haystack: normalizeText(
            [
              summary.title,
              item.workContentName,
              item.axisName,
              item.recipientName ?? "",
              ...Object.values(item.task.fieldValues ?? {}),
            ].join(" "),
          ),
        };
      }),
    [items, templates.byAxis, qualityLevelById, todayYmd],
  );

  /** Nhãn cột hạn lấy từ mẫu - mỗi trục đặt tên khác nhau thì dùng tên chung. */
  const deadlineHeader = useMemo(() => {
    const titles = new Set(
      rows.map((row) => row.summary.deadlineTitle).filter(Boolean),
    );
    return titles.size === 1 ? [...titles][0]! : "Hạn";
  }, [rows]);

  const counts = useMemo(() => {
    const byTab = (value: TabValue) =>
      rows.filter((row) => matchesTab(row.item, value)).length;
    return {
      ALL: rows.length,
      DRAFT: byTab("DRAFT"),
      PENDING: byTab("PENDING"),
      RETURNED: byTab("RETURNED"),
      DONE: byTab("DONE"),
      overdue: countOverdue(rows),
      sent: rows.filter((row) => Boolean(row.item.sentAt)).length,
      // "Đang thực hiện" tính cả việc đã gửi đang chờ duyệt: chừng nào cấp
      // trên chưa chốt hoàn thành thì việc vẫn còn đang chạy.
      running: rows.filter((row) => row.item.status !== "COMPLETED").length,
      silent: rows.filter(isSilent).length,
    };
  }, [rows]);

  const filtered = useMemo(() => {
    const term = normalizeText(debouncedQuery);
    return rows.filter(
      (row) =>
        matchesTab(row.item, tab) && (!term || row.haystack.includes(term)),
    );
  }, [rows, tab, debouncedQuery]);

  /**
   * Nhóm theo trục hoặc theo đơn vị.
   *
   * Màn này chỉ có nhiệm vụ của chính mình nên "theo đơn vị" ra đúng một nhóm -
   * là đơn vị của người đang xem. Cách gom giữ nguyên để khi màn cấp trên dùng
   * lại thì mỗi cán bộ ra một nhóm.
   */
  const groups = useMemo(() => {
    if (groupMode === "TASK") return [];

    const byKey = new Map<string, DayTaskRow[]>();
    for (const row of filtered) {
      const key =
        groupMode === "AXIS"
          ? row.item.axisName || "Chưa rõ trục"
          : user?.departmentName || "Đơn vị của tôi";
      byKey.set(key, [...(byKey.get(key) ?? []), row]);
    }

    return [...byKey.entries()]
      .sort(([left], [right]) => left.localeCompare(right, "vi"))
      .map(([label, groupRows]) => ({
        label,
        rows: groupRows,
        overdue: countOverdue(groupRows),
        percent: averagePercent(groupRows),
      }));
  }, [filtered, groupMode, user?.departmentName]);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  // Lọc xong có thể còn ít trang hơn trang đang đứng - kẹp lại kẻo bảng trống.
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * limit, safePage * limit);

  /**
   * Gửi bao nhiêu lượt trong ngày cũng được - việc phát sinh buổi chiều vẫn
   * lên tới cấp trên trong ngày, việc bị trả lại sửa xong gửi lại ngay.
   */
  const alreadySent = counts.sent > 0;
  const sendableItems = useMemo(
    () => items.filter((item) => canSendPersonalKpi(item.status)),
    [items],
  );
  const emptyText =
    rows.length === 0
      ? "Ngày này chưa có nhiệm vụ nào."
      : "Không có nhiệm vụ phù hợp bộ lọc.";

  /**
   * Lời nhắc gửi báo cáo.
   *
   * Không chặn gửi nhiều lượt nữa, nhưng vẫn phải soi xem hôm đó đã gửi chưa -
   * quên gửi thì cấp trên không thấy việc, mà hệ thống thì im lặng.
   * Ngày đã qua mà chưa gửi là nhắc gắt hơn: không còn cứu được trong ngày.
   */
  const reminder = useMemo(() => {
    if (activeDate > todayYmd) return null;
    const isPast = activeDate < todayYmd;
    const pending = sendableItems.length;

    if (rows.length === 0) {
      if (isPast) return null;
      return {
        tone: "warning" as const,
        text: "Hôm nay chưa nhập nhiệm vụ nào - nhập báo cáo ngày để chỉ huy nắm được việc đang chạy.",
        action: null,
      };
    }
    if (pending === 0) return null;

    if (!alreadySent) {
      return {
        tone: isPast ? ("danger" as const) : ("warning" as const),
        text: isPast
          ? `Ngày này chưa gửi báo cáo - còn ${pending} nhiệm vụ chưa lên cấp trên.`
          : `Chưa gửi báo cáo hôm nay - ${pending} nhiệm vụ đang chờ gửi.`,
        action: "Gửi báo cáo",
      };
    }
    return {
      tone: "info" as const,
      text: `${pending} nhiệm vụ nhập thêm hoặc vừa sửa chưa gửi lên cấp trên.`,
      action: "Gửi tiếp",
    };
  }, [activeDate, todayYmd, rows.length, sendableItems.length, alreadySent]);

  const openCreate = () => {
    setEdit(null);
    setDrawerOpen(true);
  };

  const openEdit = (item: PersonalKpiItem) => {
    if (!canEditPersonalKpi(item.status)) {
      toast.error(
        item.status === "PENDING"
          ? "Đã gửi, đang chờ cấp trên duyệt - không sửa được."
          : "Nhiệm vụ đã duyệt - không sửa được.",
      );
      return;
    }
    setEdit(item);
    setDrawerOpen(true);
  };

  /** Việc đã chốt vẫn mở được - hộp thoại tự chuyển sang chế độ chỉ xem. */
  const openProgress = (item: PersonalKpiItem) => {
    setProgressItem(item);
    setProgressOpen(true);
  };

  const openSend = (item: PersonalKpiItem) => {
    if (!canSendPersonalKpi(item.status)) {
      toast.error("Chỉ gửi được khi đang Nháp hoặc bị Trả lại.");
      return;
    }
    setSendingItem(item);
  };

  const refreshDay = async () => {
    await mutate();
  };

  /**
   * Gửi luôn đi qua API báo cáo ngày; gửi một dòng chỉ là truyền đúng một id.
   * Nhờ vậy mỗi lần gửi vẫn sinh ra một lượt gửi có người nhận và ghi chú.
   */
  const confirmSend = async (payload: SubmitPersonalKpiPayload) => {
    const targets = sendingItem ? [sendingItem] : sendableItems;
    if (!targets.length) return;
    setSending(true);
    setActingId(sendingItem?.id ?? null);
    try {
      const result = await submitPersonalKpiReport(activeDate, {
        ...payload,
        itemIds: targets.map((item) => item.id),
      });
      await refreshDay();
      toast.success(
        `Đã gửi ${result.sentCount} nhiệm vụ tới ${result.recipientName}.`,
      );
      setSendingItem(null);
      setSendAllOpen(false);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không gửi được nhiệm vụ."));
    } finally {
      setSending(false);
      setActingId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setActingId(deleting.id);
    try {
      await deletePersonalKpi(deleting.id);
      await refreshDay();
      toast.success("Đã xoá nhiệm vụ.");
      setDeleting(null);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không xoá được nhiệm vụ."));
    } finally {
      setActingId(null);
    }
  };

  const tableProps = {
    deadlineHeader,
    actingId,
    onUpdateProgress: openProgress,
    onEditDetail: openEdit,
    onSend: openSend,
    onDelete: setDeleting,
  };

  return (
    <div className="space-y-4">
      <Card className="shadow-sm">
        <CardContent className="flex flex-wrap items-start justify-between gap-4 py-5">
          <div className="min-w-0 space-y-2">
            <p className="text-sm text-muted-foreground">
              Báo cáo ngày
              {user?.fullName ? ` · ${user.fullName}` : ""}
              {user?.departmentName ? ` · ${user.departmentName}` : ""}
            </p>
            <h1 className="font-display text-2xl font-semibold tracking-tight">
              Nhiệm vụ của tôi
            </h1>
            <div className="flex flex-wrap items-center gap-2">
              {/*
                Đổi ngày ngay tại đây - thay cho bảng danh sách ngày đã bỏ.
                Dùng lịch riêng chứ không dùng <input type="date"> vì ô đó hiện
                ngày theo ngôn ngữ của trình duyệt, máy cài tiếng Anh sẽ ra
                08/17/2026 thay vì 17/08/2026.
              */}
              <Popover open={dateOpen} onOpenChange={setDateOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="h-8 gap-2 bg-background px-3 font-normal"
                    aria-label="Ngày báo cáo"
                  >
                    <CalendarDays className="size-3.5 text-muted-foreground" />
                    <span className="tabular-nums">
                      {formatYmd(activeDate)}
                    </span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    defaultMonth={ymdToDate(activeDate)}
                    selected={ymdToDate(activeDate)}
                    onSelect={(picked) => {
                      if (!picked) return;
                      setDateOpen(false);
                      router.push(`/kpi/personal/${dateToYmd(picked)}`);
                    }}
                  />
                </PopoverContent>
              </Popover>
              {activeDate !== todayYmd ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8"
                  onClick={() => router.push(`/kpi/personal/${todayYmd}`)}
                >
                  Về hôm nay
                </Button>
              ) : null}
              <Badge
                variant="outline"
                className={cn(
                  headerChipClass,
                  alreadySent ? kpiTone.success.text : kpiTone.warning.text,
                )}
              >
                {alreadySent ? (
                  <Check className="size-3.5" />
                ) : (
                  <TriangleAlert className="size-3.5" />
                )}
                {alreadySent
                  ? `Đã gửi báo cáo ngày (${counts.sent})`
                  : "Chưa gửi báo cáo ngày"}
              </Badge>
              {counts.overdue > 0 ? (
                <Badge
                  variant="outline"
                  className={cn(
                    headerChipClass,
                    "border-rose-200 dark:border-rose-900",
                    kpiTone.danger.text,
                  )}
                >
                  <TriangleAlert className="size-3.5" />
                  {counts.overdue} nhiệm vụ trễ hạn
                </Badge>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {/* Bảng tổng hợp theo trục - đúng khuôn mẫu KPI, để đối chiếu và
                gửi theo nhóm như màn cũ. */}
            <Button
              variant="ghost"
              onClick={() => setBoardOpen(true)}
              disabled={rows.length === 0}
            >
              <Table2 className="h-4 w-4" />
              Bảng tổng hợp
            </Button>
            {/* Gửi được nhiều lượt trong ngày - lượt sau gom nốt việc còn nháp
                và việc vừa sửa sau khi bị trả lại. */}
            <Button
              variant="outline"
              className="bg-background"
              onClick={() => setSendAllOpen(true)}
              disabled={sendableItems.length === 0}
              title={
                sendableItems.length > 0
                  ? undefined
                  : "Chưa có nhiệm vụ nháp hoặc bị trả lại nào để gửi"
              }
            >
              <Send className="h-4 w-4" />
              {alreadySent ? "Gửi tiếp" : "Gửi báo cáo"} ({sendableItems.length})
            </Button>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Nhập báo cáo ngày
            </Button>
          </div>
        </CardContent>
      </Card>

      {reminder ? (
        <div
          className={cn(
            "flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm",
            reminder.tone === "danger"
              ? "border-rose-200 bg-rose-500/5 dark:border-rose-900"
              : reminder.tone === "warning"
                ? "border-amber-200 bg-amber-500/5 dark:border-amber-900"
                : "bg-muted/30",
          )}
        >
          <TriangleAlert
            className={cn(
              "size-4 shrink-0",
              reminder.tone === "danger"
                ? kpiTone.danger.text
                : reminder.tone === "warning"
                  ? kpiTone.warning.text
                  : "text-muted-foreground",
            )}
          />
          <p className="min-w-0 flex-1">{reminder.text}</p>
          {reminder.action ? (
            <Button size="sm" onClick={() => setSendAllOpen(true)}>
              <Send className="h-4 w-4" />
              {reminder.action}
            </Button>
          ) : (
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Nhập báo cáo ngày
            </Button>
          )}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Tổng nhiệm vụ"
          value={counts.ALL}
          icon={ClipboardList}
        />
        <StatCard
          label="Đang thực hiện"
          value={counts.running}
          icon={CircleDot}
          tone={kpiTone.info}
        />
        <StatCard
          label="Trễ hạn"
          value={counts.overdue}
          icon={TriangleAlert}
          tone={kpiTone.danger}
        />
        <StatCard
          label={`Im lặng ≥ ${SILENCE_ALERT_DAYS} ngày`}
          value={counts.silent}
          icon={MessageSquareWarning}
          tone={kpiTone.warning}
        />
      </div>

      <Card className="shadow-sm">
        <CardContent className="space-y-4 py-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SegmentedTabs
              ariaLabel="Lọc theo trạng thái"
              value={tab}
              onChange={(next) => {
                setTab(next);
                setPage(1);
              }}
              items={TABS.map((item) => ({
                value: item.value,
                label: `${item.label} (${counts[item.value]})`,
              }))}
            />

            <div className="flex flex-wrap items-center gap-2">
              <SegmentedTabs
                ariaLabel="Cách nhóm danh sách"
                value={groupMode}
                onChange={setGroupMode}
                items={GROUP_MODES}
                className="border bg-transparent"
                indicatorClassName="bg-muted shadow-none"
              />

              <div className="relative w-full sm:w-56">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="bg-background pl-8 placeholder:text-muted-foreground/70"
                  placeholder="Tìm nhiệm vụ..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
            </div>
          </div>

          {groupMode === "TASK" ? (
            <>
              <div className="rounded-md border">
                <DayTaskTable
                  {...tableProps}
                  rows={pageRows}
                  loading={isLoading}
                  emptyText={emptyText}
                />
              </div>
              <TablePagination
                page={safePage}
                limit={limit}
                total={total}
                totalPages={totalPages}
                onPageChange={setPage}
                onLimitChange={setLimit}
                disabled={isLoading}
              />
            </>
          ) : isLoading ? (
            <div className="rounded-md border p-10 text-center text-sm text-muted-foreground">
              Đang tải...
            </div>
          ) : groups.length === 0 ? (
            <div className="rounded-md border p-10 text-center text-sm text-muted-foreground">
              {emptyText}
            </div>
          ) : (
            <div className="space-y-3">
              {groups.map((group) => (
                <Collapsible
                  key={group.label}
                  defaultOpen
                  className="overflow-hidden rounded-lg border"
                >
                  <div className="flex flex-wrap items-center gap-2 bg-muted/30 px-3 py-2.5">
                    <CollapsibleTrigger asChild>
                      {/* data-state nằm trên nút, nên xoay mũi tên qua nút chứ
                          không gắn thẳng lên icon (icon không có thuộc tính đó). */}
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
                    <span className="truncate font-semibold">{group.label}</span>
                    <Badge
                      variant="secondary"
                      className={cn("font-normal", kpiTone.info.soft)}
                    >
                      {group.rows.length} nhiệm vụ
                    </Badge>
                    {group.overdue > 0 ? (
                      <Badge
                        variant="secondary"
                        className={cn("font-normal", kpiTone.danger.soft)}
                      >
                        Trễ {group.overdue}
                      </Badge>
                    ) : null}
                    {group.percent === null ? null : (
                      <div className="ml-auto flex min-w-[140px] items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                          <div
                            className={cn(
                              "h-full rounded-full",
                              group.percent >= 100
                                ? "bg-emerald-500"
                                : "bg-primary",
                            )}
                            style={{ width: `${group.percent}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {group.percent}%
                        </span>
                      </div>
                    )}
                  </div>
                  <CollapsibleContent className="border-t">
                    <DayTaskTable
                      {...tableProps}
                      rows={group.rows}
                      emptyText={emptyText}
                    />
                  </CollapsibleContent>
                </Collapsible>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <PersonalTaskDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        edit={edit}
        reportDate={activeDate}
        notice={
          !edit && alreadySent
            ? "Báo cáo ngày này đã gửi một lượt. Nhiệm vụ nhập thêm sẽ nằm ở Nháp, bấm Gửi tiếp là lên cấp trên."
            : undefined
        }
        onSaved={async () => {
          await refreshDay();
        }}
      />

      <PersonalReportDetailDrawer
        open={boardOpen}
        onOpenChange={setBoardOpen}
        reportDate={boardOpen ? activeDate : null}
        onChanged={async () => {
          await refreshDay();
        }}
      />

      <ProgressUpdateDialog
        open={progressOpen}
        item={progressItem}
        template={
          progressItem
            ? (templates.byAxis.get(progressItem.axisId) ?? null)
            : null
        }
        onOpenChange={setProgressOpen}
        onSaved={async () => {
          await refreshDay();
        }}
        onRequestConfirm={(target) => {
          setProgressOpen(false);
          openSend(target);
        }}
      />

      <AlertDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xoá nhiệm vụ nháp?</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn sắp xoá{" "}
              <span className="font-medium text-foreground">
                {deleting?.workContentName}
              </span>
              .
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDelete()}>
              Xoá
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SendRecipientDialog
        open={!!sendingItem || sendAllOpen}
        onOpenChange={(open) => {
          if (open || sending) return;
          setSendingItem(null);
          setSendAllOpen(false);
        }}
        title={
          sendingItem
            ? "Gửi nhiệm vụ"
            : `Gửi báo cáo ngày ${formatYmd(activeDate)} (${sendableItems.length} nhiệm vụ)`
        }
        submitting={sending}
        onConfirm={confirmSend}
      />
    </div>
  );
}
