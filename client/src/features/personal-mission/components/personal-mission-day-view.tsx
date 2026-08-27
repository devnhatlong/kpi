"use client";

import { useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  CircleCheck,
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

import { DateRangeFilter } from "@/components/common/date-range-filter";
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
import { Card, CardContent } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/features/auth/auth-provider";
import { NoReportTemplateNotice } from "@/features/mission-form-config/components/no-report-template-notice";
import { entityId } from "@/features/mission-form-config/types";
import { useQualityLevelMap } from "@/features/mission-form-config/use-quality-levels";
import { useScopedAxes } from "@/features/mission-form-config/use-scoped-axes";
import {
  deletePersonalMission,
  fetchMyPersonalMission,
  criteriaPeriodOf,
  fetchPersonalCriteriaList,
  fetchPersonalCriteriaSheet,
  formatCriteriaPeriod,
  personalCriteriaKeys,
  personalMissionKeys,
  submitPersonalMissionReport,
  type PersonalCriteriaSheetSummary,
  type SubmitPersonalMissionPayload,
} from "@/features/personal-mission/api";
import {
  DayTaskTable,
  isSilent,
  type DayTaskRow,
} from "@/features/personal-mission/components/day-task-table";
import { PersonalReportDetailDrawer } from "@/features/personal-mission/components/personal-report-detail-drawer";
import { PersonalTaskDrawer } from "@/features/personal-mission/components/personal-task-drawer";
import { ProgressUpdateDialog } from "@/features/personal-mission/components/progress-update-dialog";
import { SendRecipientDialog } from "@/features/personal-mission/components/send-recipient-dialog";
import { missionTone } from "@/features/personal-mission/status-styles";
import {
  SILENCE_ALERT_DAYS,
  deadlineState,
  silenceDays,
  readResultInfo,
  resultColumns,
  summarizeTask,
  workStateOf,
} from "@/features/personal-mission/task-summary";
import {
  canEditPersonalMission,
  canSendPersonalMission,
  type PersonalMissionItem,
} from "@/features/personal-mission/types";
import { useAxisTemplates } from "@/features/personal-mission/use-axis-templates";
import { useListPagination } from "@/hooks/use-list-pagination";
import { useServerTime } from "@/hooks/use-server-time";
import { getApiErrorMessage } from "@/lib/api-client";
import { currentWeekRange, formatYmd, serverYmd } from "@/lib/server-time";
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

/** Cách bày danh sách: phẳng, hay gom theo trục / đơn vị / cán bộ. */
type GroupMode = "TASK" | "AXIS" | "UNIT" | "PERSON";

const GROUP_MODES: Array<{ value: GroupMode; label: string }> = [
  { value: "TASK", label: "Theo nội dung nhiệm vụ" },
  { value: "AXIS", label: "Theo trục" },
  { value: "UNIT", label: "Theo đơn vị" },
  { value: "PERSON", label: "Theo cá nhân" },
];

function matchesTab(item: PersonalMissionItem, tab: TabValue): boolean {
  if (tab === "ALL") return true;
  if (tab === "DONE") {
    return item.status === "APPROVED" || item.status === "COMPLETED";
  }
  return item.status === tab;
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
  return Math.round(
    values.reduce((sum, value) => sum + value, 0) / values.length,
  );
}

type StatCardProps = {
  label: string;
  value: number;
  icon: LucideIcon;
  /** Màu chữ + nền huy hiệu icon, lấy theo tông trạng thái. */
  tone?: { text: string; icon: string };
};

/**
 * Icon đứng riêng một bên, chữ dồn hết sang bên kia.
 *
 * Kiểu cũ xếp dọc (nhãn trên, icon + số dưới) làm con số - thứ người ta liếc
 * vào tìm - bị đẩy xuống đáy thẻ và chỉ to bằng dòng chữ thường. Tách thành hai
 * cột thì số nằm giữa thẻ, phóng lên được cỡ lớn mà thẻ không cao thêm.
 *
 * Màu do hộp icon và con số mang, còn nhãn để xám: nhãn tô màu theo tông cảnh
 * báo thì chữ nhỏ trên nền sáng tụt tương phản, mà cũng chẳng thêm thông tin gì.
 */
function StatCard({ label, value, icon: Icon, tone }: StatCardProps) {
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
        </div>
      </CardContent>
    </Card>
  );
}

type PersonalMissionDayViewProps = {
  /** Ngày báo cáo YYYY-MM-DD; bỏ trống = hôm nay theo giờ server. */
  reportDate?: string;
};

export function PersonalMissionDayView({
  reportDate,
}: PersonalMissionDayViewProps) {
  const { page, setPage, limit, setLimit, query, setQuery, debouncedQuery } =
    useListPagination();
  const [tab, setTab] = useState<TabValue>("ALL");
  const [groupMode, setGroupMode] = useState<GroupMode>("TASK");
  /*
    Đơn vị có mẫu báo cáo áp dụng không - chưa có thì không nhập được nhiệm vụ
    nào. Dùng chung khoá SWR với form nhập nên không tốn thêm lượt gọi.
  */
  const {
    axes: scopedAxes,
    hasTemplate: canEnter,
    isLoading: loadingScope,
  } = useScopedAxes();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [edit, setEdit] = useState<PersonalMissionItem | null>(null);
  /** Nhiệm vụ đang mở ô cập nhật tiến độ hằng ngày. */
  const [progressItem, setProgressItem] = useState<PersonalMissionItem | null>(
    null,
  );
  const [progressOpen, setProgressOpen] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);
  /** null = đang theo khoảng mặc định (tuần này), có giá trị = người dùng tự chọn. */
  const [fromOverride, setFromOverride] = useState<string | null>(null);
  const [toOverride, setToOverride] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<PersonalMissionItem | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [sendingItem, setSendingItem] = useState<PersonalMissionItem | null>(
    null,
  );
  const [sendAllOpen, setSendAllOpen] = useState(false);
  const [sending, setSending] = useState(false);
  /**
   * Ngày mà hai drawer đang mở cho, khi khác ngày đang nhập.
   *
   * Danh sách trải cả tuần nên bấm vào dòng khối A của thứ Hai phải mở đúng
   * bảng thứ Hai, không phải bảng của ngày đang nhập.
   */
  const [focusDate, setFocusDate] = useState<string | null>(null);

  const { user } = useAuth();

  // Sync giờ server để "trễ hạn / còn N ngày" tính theo giờ hệ thống, không
  // theo đồng hồ máy người dùng.
  const { ready } = useServerTime();
  const todayYmd = serverYmd();

  /*
    Tính lại khi đồng bộ xong giờ server - lần render đầu còn đang dùng giờ máy.
    `ready` không xuất hiện trong thân hàm nên eslint coi là thừa, nhưng độ lệch
    giờ mà `currentWeekRange` đọc lại nằm ở module ngoài React.
  */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const week = useMemo(() => currentWeekRange(), [ready]);
  /*
    Mặc định xem cả tuần hiện tại; vào thẳng một ngày qua đường dẫn thì mặc
    định đúng ngày đó. Người dùng chỉnh tay thì override đè lên mặc định.
  */
  const defaultRange = reportDate ? { from: reportDate, to: reportDate } : week;
  const fromDate = fromOverride ?? defaultRange.from;
  const toDate = toOverride ?? defaultRange.to;
  const usingDefaultRange = fromOverride === null && toOverride === null;

  /**
   * Ngày đang NHẬP báo cáo, suy ra từ chính khoảng lọc chứ không có ô riêng:
   * khoảng còn chứa hôm nay thì nhập cho hôm nay, kéo hẳn về quá khứ thì nhập
   * cho ngày cuối khoảng - chọn từ ngày = đến ngày là quay lại đúng kiểu xem
   * một ngày như trước.
   */
  const activeDate =
    todayYmd >= fromDate && todayYmd <= toDate ? todayYmd : toDate;
  const activeDayLabel =
    activeDate === todayYmd ? "hôm nay" : formatYmd(activeDate);

  const listParams = useMemo(
    () => ({
      fromDate,
      toDate,
      page: 1,
      limit: DAY_FETCH_LIMIT,
    }),
    [fromDate, toDate],
  );

  const { data, isLoading, mutate } = useSWR(
    personalMissionKeys.byDate(listParams),
    () => fetchMyPersonalMission(listParams),
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
        const result = readResultInfo(item.task, resultColumns(template), {
          values: item.reviewValues,
          catalogValues: item.reviewCatalogValues,
        });
        return {
          item,
          summary,
          result,
          deadline: deadlineState(summary.deadline, todayYmd),
          work: workStateOf(summary, {
            completed: item.status === "COMPLETED",
            touched: !!item.lastProgressAt,
            hasResult: result.declared,
          }),
          /*
            Chưa cập nhật lần nào thì tính từ lúc đăng ký nhiệm vụ.
            Trục không có cột tiến độ thì không đếm ngày: cán bộ có muốn cập
            nhật cũng không có ô nào để nhập, gắn nhãn "chưa cập nhật" là oan.
          */
          silence: summary.tracksProgress
            ? silenceDays(item.lastProgressAt ?? item.createdAt, todayYmd)
            : null,
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

  /*
    Bảng khối A của THÁNG chứa ngày đang nhập. Dùng chung khoá SWR (theo tháng)
    với drawer nên không tốn thêm lượt gọi - ở đây chỉ cần biết bảng có kèm được
    vào lượt gửi hay không.
  */
  const { data: criteriaSheet, mutate: mutateCriteria } = useSWR(
    personalCriteriaKeys.sheet(criteriaPeriodOf(activeDate)),
    () => fetchPersonalCriteriaSheet(activeDate),
    { revalidateOnFocus: false },
  );
  /*
    Bảng khối A của CẢ KHOẢNG đang xem - mỗi ngày một dòng trong danh sách, đứng
    ngang hàng với nhiệm vụ. Danh sách trải cả tuần nên không dùng lại bản của
    riêng `activeDate` được.
  */
  const { data: criteriaList, mutate: mutateCriteriaList } = useSWR(
    personalCriteriaKeys.list(fromDate, toDate),
    () => fetchPersonalCriteriaList({ fromDate, toDate }),
    { revalidateOnFocus: false },
  );

  /**
   * Dòng khối A của danh sách - lọc theo cùng tab và cùng ô tìm kiếm với nhiệm
   * vụ, nếu không thì bấm tab "Nháp" xong vẫn thấy bảng A đã chốt nằm đó.
   */
  const criteriaRows = useMemo(() => {
    const term = normalizeText(debouncedQuery);
    return (criteriaList ?? []).filter((sheet) => {
      const okTab =
        tab === "ALL"
          ? true
          : tab === "DONE"
            ? sheet.reviewStatus === "APPROVED" ||
              sheet.reviewStatus === "COMPLETED"
            : sheet.reviewStatus === tab;
      const haystack = normalizeText(
        `tiêu chí chung khối a ${sheet.period} ${formatCriteriaPeriod(sheet.period)}`,
      );
      return okTab && (!term || haystack.includes(term));
    });
  }, [criteriaList, tab, debouncedQuery]);

  /**
   * Nhóm theo trục, theo đơn vị, hoặc theo cán bộ.
   *
   * Màn này chỉ có nhiệm vụ của chính mình nên "theo đơn vị" và "theo cá nhân"
   * đều ra đúng một nhóm - là đơn vị và tên của người đang xem. Cách gom giữ
   * nguyên để khi màn cấp trên dùng lại thì mỗi đơn vị / mỗi cán bộ ra một nhóm.
   *
   * Khoá gom lấy từ CHÍNH DÒNG (`row.item.ownerName`) chứ không lấy tên người
   * đang đăng nhập: hai thứ đó trùng nhau ở màn này, nhưng chỉ có cái trước mới
   * đúng khi danh sách chứa việc của nhiều người.
   */
  const groups = useMemo(() => {
    if (groupMode === "TASK") return [];

    const byKey = new Map<string, DayTaskRow[]>();
    for (const row of filtered) {
      const key =
        groupMode === "AXIS"
          ? row.item.axisName || "Chưa rõ trục"
          : groupMode === "PERSON"
            ? row.item.ownerName ||
              user?.fullName ||
              user?.username ||
              "Chưa rõ cán bộ"
            : user?.departmentName || "Đơn vị công tác";
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
  }, [
    filtered,
    groupMode,
    user?.departmentName,
    user?.fullName,
    user?.username,
  ]);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  // Lọc xong có thể còn ít trang hơn trang đang đứng - kẹp lại kẻo bảng trống.
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * limit, safePage * limit);

  /*
    Bảng xem cả khoảng ngày, nhưng "báo cáo ngày" thì vẫn là chuyện của ĐÚNG
    một ngày: gửi, nhắc gửi, đếm đã gửi đều chỉ tính việc của `activeDate`.
    Lấy cả tuần rồi đếm chung là con số nói dối ngay ở dòng đầu trang.
  */
  const dayItems = useMemo(
    () =>
      items.filter((item) => (item.reportDate ?? activeDate) === activeDate),
    [items, activeDate],
  );

  /**
   * Gửi bao nhiêu lượt trong ngày cũng được - việc phát sinh buổi chiều vẫn
   * lên tới cấp trên trong ngày, việc bị trả lại sửa xong gửi lại ngay.
   */
  const sentCount = dayItems.filter((item) => Boolean(item.sentAt)).length;
  const alreadySent = sentCount > 0;
  const sendableItems = useMemo(
    () => dayItems.filter((item) => canSendPersonalMission(item.status)),
    [dayItems],
  );

  const criteriaFilled = (criteriaSheet?.rows ?? []).some(
    (row) =>
      Object.values(row.fieldValues ?? {}).some(
        (value) => value !== "" && value !== false && value !== null,
      ) || Object.keys(row.catalogValues ?? {}).length > 0,
  );
  /*
    Kèm được khi bảng đã chấm và còn ở chỗ mình. Gửi lẻ một nhiệm vụ thì không
    hỏi: lượt đó nói về đúng một dòng, đính kèm cả bảng đánh giá ngày vào là
    gửi thứ người ta không định gửi.
  */
  const canSendCriteria =
    !sendingItem && criteriaFilled && (criteriaSheet?.canEdit ?? false);
  const emptyText =
    rows.length === 0
      ? fromDate === toDate
        ? "Ngày này chưa có nhiệm vụ nào."
        : `Từ ${formatYmd(fromDate)} đến ${formatYmd(toDate)} chưa có nhiệm vụ nào.`
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

    if (dayItems.length === 0) {
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
  }, [
    activeDate,
    todayYmd,
    dayItems.length,
    sendableItems.length,
    alreadySent,
  ]);

  const openCreate = () => {
    // Chốt chặn thật nằm ở form nhập và ở server; đây chỉ để không mở ra một
    // drawer chỉ để báo là không nhập được.
    if (!canEnter) {
      toast.error(
        "Đơn vị chưa được gán mẫu báo cáo nào - chưa nhập nhiệm vụ được.",
      );
      return;
    }
    setEdit(null);
    setDrawerOpen(true);
  };

  const openEdit = (item: PersonalMissionItem) => {
    if (!canEditPersonalMission(item.status)) {
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
  const openProgress = (item: PersonalMissionItem) => {
    setProgressItem(item);
    setProgressOpen(true);
  };

  const openSend = (item: PersonalMissionItem) => {
    if (!canSendPersonalMission(item.status)) {
      toast.error("Chỉ gửi được khi đang Nháp hoặc bị Trả lại.");
      return;
    }
    setSendingItem(item);
  };

  const refreshDay = async () => {
    await Promise.all([mutate(), mutateCriteria(), mutateCriteriaList()]);
  };

  /**
   * Mở bảng khối A của một tháng bất kỳ trong danh sách.
   *
   * Còn sửa được thì vào phiếu nhập để chấm; đã chốt thì mở bảng tổng hợp để
   * xem lại - phiếu nhập lúc đó chỉ bày một bảng khoá.
   *
   * Hai drawer đều mở theo NGÀY, nên tháng của bảng phải quy về một ngày cụ
   * thể: lấy ngày đang nhập nếu nó nằm trong tháng đó, không thì mùng 1.
   */
  const openCriteria = (sheet: PersonalCriteriaSheetSummary) => {
    setFocusDate(
      criteriaPeriodOf(activeDate) === sheet.period
        ? activeDate
        : `${sheet.period}-01`,
    );
    if (sheet.canEdit || sheet.canUpdate) {
      setEdit(null);
      setDrawerOpen(true);
      return;
    }
    setBoardOpen(true);
  };

  /**
   * Gửi luôn đi qua API báo cáo ngày; gửi một dòng chỉ là truyền đúng một id.
   * Nhờ vậy mỗi lần gửi vẫn sinh ra một lượt gửi có người nhận và ghi chú.
   */
  const confirmSend = async (payload: SubmitPersonalMissionPayload) => {
    const targets = sendingItem ? [sendingItem] : sendableItems;
    const withCriteria = canSendCriteria && payload.includeCriteria === true;
    // Không có nhiệm vụ nào nhưng có bảng A thì vẫn gửi - ngày không phát sinh
    // việc vẫn phải trình bảng đánh giá chung lên.
    if (!targets.length && !withCriteria) return;
    /*
      Gửi theo ĐÚNG ngày báo cáo của nhiệm vụ. Bảng giờ trải cả tuần nên bấm
      gửi ở một dòng của hôm kia mà lại nộp vào phiếu hôm nay là sai ngày -
      server cũng chặn vì một lượt gửi chỉ được gồm nhiệm vụ cùng một ngày.
    */
    const sendDate = sendingItem?.reportDate ?? activeDate;
    setSending(true);
    setActingId(sendingItem?.id ?? null);
    try {
      const result = await submitPersonalMissionReport(sendDate, {
        ...payload,
        includeCriteria: withCriteria,
        itemIds: targets.map((item) => item.id),
      });
      await refreshDay();
      if (withCriteria) await mutateCriteria();
      const sentParts = [
        result.sentCount ? `${result.sentCount} nhiệm vụ` : "",
        result.criteriaSentCount ? "bảng khối A" : "",
      ].filter(Boolean);
      toast.success(
        `Đã gửi ${sentParts.join(" và ")} tới ${result.recipientName}.`,
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
      await deletePersonalMission(deleting.id);
      await refreshDay();
      toast.success("Đã xoá nhiệm vụ.");
      setDeleting(null);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không xoá được nhiệm vụ."));
    } finally {
      setActingId(null);
    }
  };

  /*
    Số hiệu khối B của từng trục, theo đúng thứ tự của mẫu báo cáo đang áp dụng
    cho đơn vị - để cột Biểu mẫu đối chiếu thẳng được với bản in.
  */
  const axisOrderById = useMemo(
    () => new Map(scopedAxes.map((axis, index) => [entityId(axis), index + 1])),
    [scopedAxes],
  );

  const tableProps = {
    deadlineHeader,
    actingId,
    axisOrderById,
    // Xem một ngày thì khỏi nhắc lại ngày ở từng dòng.
    showReportDate: fromDate !== toDate,
    onUpdateProgress: openProgress,
    onEditDetail: openEdit,
    onSend: openSend,
    onDelete: setDeleting,
  };

  return (
    <div className="space-y-4">
      <Card className="shadow-sm">
        <CardContent className="flex flex-wrap items-start justify-between gap-4 py-4">
          <div className="min-w-0 space-y-2">
            <p className="text-sm text-muted-foreground">
              Báo cáo ngày
              {user?.fullName ? ` · ${user.fullName}` : ""}
              {user?.departmentName ? ` · ${user.departmentName}` : ""}
            </p>
            {/* Trùng đúng chữ với mục menu để vào trang là biết mình đang ở đâu. */}
            <h1 className="font-display text-2xl font-semibold tracking-tight">
              Nhiệm vụ cá nhân
            </h1>
            <div className="flex flex-wrap items-center gap-2">
              {/*
                MỘT bộ lọc ngày cho cả trang: khoảng này quyết định bảng hiện
                việc của những ngày nào, và cũng quyết định luôn ngày đang nhập
                báo cáo (xem `activeDate`). Trước đây còn một ô chọn ngày riêng
                nữa - hai ô ngày cạnh nhau chỉ tổ làm người dùng đoán.
              */}
              <DateRangeFilter
                compact
                label=""
                from={fromDate}
                to={toDate}
                isDefault={usingDefaultRange}
                defaultLabel={reportDate ? "Đúng ngày này" : "Tuần này"}
                resetLabel={reportDate ? "Về ngày này" : "Về tuần này"}
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
              <Badge
                variant="outline"
                className={cn(
                  headerChipClass,
                  alreadySent
                    ? missionTone.success.text
                    : missionTone.warning.text,
                )}
              >
                {alreadySent ? (
                  <Check className="size-3.5" />
                ) : (
                  <TriangleAlert className="size-3.5" />
                )}
                {/* Nói rõ báo cáo của ngày nào khi ngày nhập không phải hôm
                    nay - khoảng lọc kéo về quá khứ thì "hôm nay" là sai. */}
                {alreadySent
                  ? `Đã gửi báo cáo ngày ${activeDayLabel} (${sentCount})`
                  : `Chưa gửi báo cáo ngày ${activeDayLabel}`}
              </Badge>
              {counts.overdue > 0 ? (
                <Badge
                  variant="outline"
                  className={cn(
                    headerChipClass,
                    "border-rose-200 dark:border-rose-900",
                    missionTone.danger.text,
                  )}
                >
                  <TriangleAlert className="size-3.5" />
                  {counts.overdue} nhiệm vụ trễ hạn
                </Badge>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {/* Bảng tổng hợp theo trục - đúng khuôn mẫu nhiệm vụ, để đối chiếu và
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
              disabled={sendableItems.length === 0 && !canSendCriteria}
              title={
                sendableItems.length > 0 || canSendCriteria
                  ? undefined
                  : "Chưa có nhiệm vụ nháp hoặc bị trả lại nào để gửi"
              }
            >
              <Send className="h-4 w-4" />
              {alreadySent ? "Gửi tiếp" : "Gửi báo cáo"} ({sendableItems.length}
              {canSendCriteria ? " + A" : ""})
            </Button>
            {/* Chưa có mẫu thì GIẤU hẳn, không làm mờ: nút mờ vẫn là một lời
                mời bấm, bấm xong lại chẳng có gì xảy ra. Lý do nằm ở màn chặn
                ngay bên dưới, không cần nhắc lại bằng một nút chết. */}
            {canEnter ? (
              <Button onClick={openCreate}>
                <Plus className="h-4 w-4" />
                Nhập báo cáo ngày
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {/* Chưa có mẫu thì lời nhắc "hôm nay chưa nhập nhiệm vụ nào" là sai chỗ -
          vấn đề không nằm ở cán bộ. Thay bằng đúng nguyên nhân và người xử lý. */}
      {!loadingScope && !canEnter ? (
        <NoReportTemplateNotice action="nhập báo cáo" />
      ) : reminder ? (
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
                ? missionTone.danger.text
                : reminder.tone === "warning"
                  ? missionTone.warning.text
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

      {/*
        Thứ tự đọc: tổng số trước, rồi hai trạng thái tiến triển (đang chạy /
        đã xong), cuối cùng hai thứ cần để mắt (trễ hạn / chưa cập nhật). Xen
        cảnh báo vào giữa là mắt phải nhảy qua nhảy lại giữa hai nhóm ý.
      */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard
          label="Tổng nhiệm vụ"
          value={counts.ALL}
          icon={ClipboardList}
        />
        <StatCard
          label="Đang thực hiện"
          value={counts.running}
          icon={CircleDot}
          tone={missionTone.info}
        />
        <StatCard
          label="Hoàn thành"
          value={counts.DONE}
          icon={CircleCheck}
          tone={missionTone.success}
        />
        <StatCard
          label="Trễ hạn"
          value={counts.overdue}
          icon={TriangleAlert}
          tone={missionTone.danger}
        />
        <StatCard
          label={`Chưa cập nhật ≥ ${SILENCE_ALERT_DAYS} ngày`}
          value={counts.silent}
          icon={MessageSquareWarning}
          tone={missionTone.warning}
        />
      </div>

      <Card className="shadow-sm">
        <CardContent className="space-y-4 py-4">
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
                  /* Chỉ bày ở trang đầu - lặp lại ở mọi trang thì đọc thành
                     mỗi trang một bảng A khác nhau. */
                  criteriaRows={safePage === 1 ? criteriaRows : []}
                  onOpenCriteria={openCriteria}
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
          ) : groups.length === 0 && criteriaRows.length === 0 ? (
            <div className="rounded-md border p-10 text-center text-sm text-muted-foreground">
              {emptyText}
            </div>
          ) : (
            <div className="space-y-3">
              {/* Khối A không thuộc trục nào và cũng không thuộc đơn vị nào -
                  gom nó vào một nhóm là gán bừa. Cho đứng riêng phía trên. */}
              {criteriaRows.length > 0 ? (
                <div className="overflow-hidden rounded-lg border">
                  <DayTaskTable
                    {...tableProps}
                    rows={[]}
                    criteriaRows={criteriaRows}
                    onOpenCriteria={openCriteria}
                    emptyText={emptyText}
                  />
                </div>
              ) : null}
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
                    <span className="truncate font-semibold">
                      {group.label}
                    </span>
                    <Badge
                      variant="secondary"
                      className={cn("font-normal", missionTone.info.soft)}
                    >
                      {group.rows.length} nhiệm vụ
                    </Badge>
                    {group.overdue > 0 ? (
                      <Badge
                        variant="secondary"
                        className={cn("font-normal", missionTone.danger.soft)}
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
        onOpenChange={(next) => {
          setDrawerOpen(next);
          if (!next) setFocusDate(null);
        }}
        edit={edit}
        reportDate={focusDate ?? activeDate}
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
        onOpenChange={(next) => {
          setBoardOpen(next);
          if (!next) setFocusDate(null);
        }}
        reportDate={boardOpen ? (focusDate ?? activeDate) : null}
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
            ? `Gửi nhiệm vụ ngày ${formatYmd(sendingItem.reportDate ?? activeDate)}`
            : `Gửi báo cáo ngày ${formatYmd(activeDate)} (${[
                `${sendableItems.length} nhiệm vụ`,
                canSendCriteria ? "bảng khối A" : "",
              ]
                .filter(Boolean)
                .join(" + ")})`
        }
        submitting={sending}
        canIncludeCriteria={canSendCriteria}
        criteriaHint={`Bảng chốt kết quả ${formatCriteriaPeriod(criteriaPeriodOf(activeDate))} bạn đã tự chấm. Gửi rồi vẫn sửa được cho tới khi chỉ huy chốt, nhưng mỗi lần sửa đều để lại vết.`}
        onConfirm={confirmSend}
      />
    </div>
  );
}
