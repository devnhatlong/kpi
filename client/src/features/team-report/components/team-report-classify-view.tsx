"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import {
  Check,
  CircleCheck,
  ClipboardList,
  Info,
  Loader2,
  Lock,
  Search,
  Send,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SegmentedTabs } from "@/components/common/segmented-tabs";
import {
  classifyTeamReportTask,
  fetchTeamReportClassify,
  submitTeamReportDay,
  teamReportKeys,
  type TeamReportClassifyInput,
} from "@/features/team-report/api";
import { DynamicColumnCell } from "@/features/team-report/components/dynamic-column-cell";
import { TeamReportDayPicker } from "@/features/team-report/components/team-report-day-picker";
import {
  READINESS_LABEL,
  TEAM_REPORT_STATUS_LABEL,
  catalogOfColumn,
  finalCatalogValue,
  finalFieldValue,
  inputColumns,
  isColumnReviewed,
  missingRequiredColumns,
  narrowCatalogs,
  readinessOf,
  refId,
  workContentColumnOf,
  type TaskReadiness,
  type TeamReportAxis,
  type TeamReportCatalogs,
  type TeamReportTask,
  type TeamReportTemplate,
  type TeamReportWorkContent,
} from "@/features/team-report/types";
import { useServerTime } from "@/hooks/use-server-time";
import { getApiErrorMessage } from "@/lib/api-client";
import { formatServerHm, formatYmd, serverYmd } from "@/lib/server-time";
import { cn } from "@/lib/utils";

const REFRESH_MS = 8000;

const READINESS_CLASS: Record<TaskReadiness, string> = {
  UNCLASSIFIED:
    "border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200",
  IN_PROGRESS:
    "border-sky-300 bg-sky-100 text-sky-900 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-200",
  READY:
    "border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
};

type QueueFilter = "ALL" | TaskReadiness;

/**
 * Giai đoạn 2 - phân loại theo TRỤC rồi chấm theo bộ cột của trục đó.
 *
 * Làm MỘT nhiệm vụ mỗi lần chứ không bày cả bảng: mẫu của một trục có thể tới
 * hơn chục cột, xếp ngang thành bảng thì phải cuộn ngang và cột cuối khuất hẳn
 * khỏi màn hình. Xếp dọc từng nhiệm vụ thì nhìn thấy trọn biểu mẫu.
 *
 * Vẫn gửi theo NGÀY như đã chốt: hàng đợi bên trái chỉ để biết còn nhiệm vụ nào
 * chưa xong, không phải để gửi lẻ từng cái.
 */
export function TeamReportClassifyView() {
  /*
    Mọi thứ dính tới ngày đều chờ ĐỒNG BỘ GIỜ SERVER xong. `serverYmd()` trả giờ
    MÁY khi chưa đồng bộ, nên khởi tạo state bằng nó là chốt cứng một ngày có
    thể sai - mà cả đội chung một tài khoản nên hai người sẽ thấy hai ngày.
  */
  const { ready } = useServerTime();
  const today = serverYmd();
  const [pickedDate, setPickedDate] = useState<string | null>(null);
  const reportDate = pickedDate ?? today;

  const [pickedTaskId, setPickedTaskId] = useState<string | null>(null);
  const [filter, setFilter] = useState<QueueFilter>("ALL");
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  /*
    Màn này TỰ LƯU: đổi ô nào là gửi ngay ô đó. Nhưng tự lưu mà không báo gì thì
    người dùng không biết đã xong hay chưa, và dễ ngồi tìm nút "Lưu" không tồn
    tại. Giữ mốc lưu gần nhất để hiện ngay cạnh tiêu đề.
  */
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [note, setNote] = useState("");
  const [closeIds, setCloseIds] = useState<Set<string>>(new Set());

  const { data, isLoading, mutate } = useSWR(
    ready ? teamReportKeys.classify(reportDate) : null,
    () => fetchTeamReportClassify({ reportDate }),
    {
      refreshInterval: REFRESH_MS,
      revalidateOnFocus: false,
      keepPreviousData: true,
    },
  );

  const tasks = useMemo(() => data?.tasks ?? [], [data]);
  const axes = useMemo(() => data?.axes ?? [], [data]);
  const contents = useMemo(() => data?.workContents ?? [], [data]);
  const templates = useMemo(() => data?.templates ?? {}, [data]);
  const catalogs = useMemo(() => data?.catalogs ?? {}, [data]);

  const locked = data?.locked ?? false;
  const canSubmit = data?.canSubmit ?? false;
  const editable = ready && !locked && reportDate === today;

  const templateOf = (task: TeamReportTask) => {
    const axisId = refId(task.axisId);
    return axisId ? (templates[axisId] ?? null) : null;
  };

  /** Trạng thái từng nhiệm vụ, tính một lần cho cả hàng đợi lẫn bảng tổng quan. */
  const rows = useMemo(
    () =>
      tasks.map((task) => ({
        task,
        template: templateOf(task),
        readiness: readinessOf(task, templateOf(task)),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasks, templates],
  );

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return rows.filter(
      (row) =>
        (filter === "ALL" || row.readiness === filter) &&
        (!term || row.task.name.toLowerCase().includes(term)),
    );
  }, [rows, filter, query]);

  /*
    Suy ra nhiệm vụ đang mở thay vì giữ trong state rồi đồng bộ bằng effect: bảng
    tự nạp lại mỗi vài giây, mà nhiệm vụ đang chọn có thể vừa bị người khác đóng.
    Suy ra thì luôn trỏ vào một dòng còn tồn tại.
  */
  const selected =
    rows.find((row) => row.task._id === pickedTaskId) ?? visible[0] ?? rows[0];

  const counts = useMemo(() => {
    const byReadiness: Record<TaskReadiness, number> = {
      UNCLASSIFIED: 0,
      IN_PROGRESS: 0,
      READY: 0,
    };
    const byAxis = new Map<string, number>();
    for (const row of rows) {
      byReadiness[row.readiness] += 1;
      const axisId = refId(row.task.axisId);
      if (axisId) byAxis.set(axisId, (byAxis.get(axisId) ?? 0) + 1);
    }
    return { byReadiness, byAxis };
  }, [rows]);

  const patch = async (
    task: TeamReportTask,
    input: TeamReportClassifyInput,
  ) => {
    setBusyId(task._id);
    try {
      await classifyTeamReportTask(task._id, input);
      await mutate();
      setSavedAt(formatServerHm(Date.now()));
    } catch (error) {
      const status = (error as { response?: { status?: number } })?.response
        ?.status;
      if (status === 409) {
        toast.error(
          "Nhiệm vụ này vừa được người khác sửa. Đã tải lại bản mới.",
        );
      } else {
        toast.error(getApiErrorMessage(error, "Không lưu được."));
      }
      // Nạp lại để ô trên màn quay về đúng giá trị server đang giữ, không để
      // người dùng tưởng đã lưu xong.
      await mutate();
    } finally {
      setBusyId(null);
    }
  };

  const confirmSend = async () => {
    setSending(true);
    try {
      const result = await submitTeamReportDay({
        reportDate,
        note: note.trim() || undefined,
        closeTaskIds: [...closeIds],
      });
      setSendOpen(false);
      await mutate();
      toast.success(`Đã gửi ${result.rowCount} nhiệm vụ lên cấp trên.`);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không gửi được báo cáo."));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Báo cáo ngày của đội · {formatYmd(reportDate)}
          </p>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            Phân loại &amp; gửi
          </h1>
          <p className="text-sm text-muted-foreground">
            Chọn trục cho từng nhiệm vụ, hoàn thiện đúng biểu mẫu của trục đó,
            rồi gửi cả bảng ngày lên cấp trên.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <TeamReportDayPicker
            value={reportDate}
            onChange={setPickedDate}
            today={today}
          />
          <Button
            type="button"
            disabled={!editable || !canSubmit}
            onClick={() => {
              setNote("");
              setCloseIds(new Set());
              setSendOpen(true);
            }}
            title={
              canSubmit
                ? undefined
                : "Còn nhiệm vụ chưa phân loại - phân loại hết mới gửi được"
            }
          >
            <Send className="size-4" />
            Gửi báo cáo ngày
          </Button>
        </div>
      </div>

      {locked && data?.day ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2.5 text-sm">
          <Lock className="size-4 text-muted-foreground" />
          <span>
            Đã gửi ngày {formatYmd(reportDate)} -{" "}
            {TEAM_REPORT_STATUS_LABEL[data.day.status]}.
          </span>
          {data.day.returnReason ? (
            <span className="text-destructive">
              Lý do trả lại: {data.day.returnReason}
            </span>
          ) : null}
        </div>
      ) : null}

      {!locked && reportDate !== today ? (
        <div className="rounded-md border bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground">
          Đang xem lại ngày {formatYmd(reportDate)}. Chỉ bảng của hôm nay mới
          phân loại và gửi được.
        </div>
      ) : null}

      {isLoading && !tasks.length ? (
        <div className="rounded-md border p-10 text-center text-sm text-muted-foreground">
          Đang tải...
        </div>
      ) : null}

      {!isLoading && !tasks.length ? (
        <div className="rounded-md border p-10 text-center text-sm text-muted-foreground">
          Chưa có nhiệm vụ nào của ngày này.
        </div>
      ) : null}

      {tasks.length ? (
        <div className="grid gap-4 xl:grid-cols-[19rem_minmax(0,1fr)_17rem]">
          <TaskQueue
            rows={visible}
            total={rows.length}
            selectedId={selected?.task._id ?? null}
            filter={filter}
            query={query}
            counts={counts.byReadiness}
            onFilter={setFilter}
            onQuery={setQuery}
            onPick={setPickedTaskId}
          />

          {selected ? (
            <TaskDetailPanel
              task={selected.task}
              template={selected.template}
              readiness={selected.readiness}
              axes={axes}
              contents={contents}
              templates={templates}
              catalogs={catalogs}
              saving={busyId === selected.task._id}
              savedAt={savedAt}
              disabled={!editable || busyId === selected.task._id}
              onPatch={patch}
            />
          ) : (
            <Card className="shadow-sm">
              <CardContent className="p-10 text-center text-sm text-muted-foreground">
                Không có nhiệm vụ nào khớp bộ lọc.
              </CardContent>
            </Card>
          )}

          <DaySummary
            counts={counts.byReadiness}
            byAxis={counts.byAxis}
            axes={axes}
          />
        </div>
      ) : null}

      <Dialog open={sendOpen} onOpenChange={setSendOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Gửi báo cáo ngày {formatYmd(reportDate)}</DialogTitle>
            <DialogDescription>
              Gửi xong thì bảng của ngày này khoá lại. Nhiệm vụ chưa đóng vẫn
              chạy tiếp và hiện lại ở bảng ngày mai.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="rounded-md border bg-muted/40 px-3 py-2.5 text-sm">
              Bản gửi gồm <strong>{tasks.length} nhiệm vụ</strong>.
            </div>

            {/* Đóng việc là quyết định riêng, không suy từ con số nào: mỗi trục
                chấm một kiểu, "đủ 100%" không phải khái niệm chung mọi mẫu. */}
            {tasks.filter((task) => task.isOpen).length ? (
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  Đánh dấu nhiệm vụ đã xong (đóng lại, mai không hiện nữa)
                </p>
                <div className="max-h-52 space-y-1.5 overflow-y-auto rounded-md border p-2">
                  {tasks
                    .filter((task) => task.isOpen)
                    .map((task) => (
                      <label
                        key={task._id}
                        className="flex cursor-pointer items-start gap-2 rounded p-1.5 text-sm hover:bg-muted/60"
                      >
                        <Checkbox
                          checked={closeIds.has(task._id)}
                          onCheckedChange={(checked) => {
                            setCloseIds((prev) => {
                              const next = new Set(prev);
                              if (checked) next.add(task._id);
                              else next.delete(task._id);
                              return next;
                            });
                          }}
                          className="mt-0.5"
                        />
                        <span className="min-w-0 break-words">{task.name}</span>
                      </label>
                    ))}
                </div>
              </div>
            ) : null}

            <div className="space-y-1.5">
              <p className="text-sm font-medium">Ghi chú gửi kèm</p>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="Không bắt buộc"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setSendOpen(false)}>
              Huỷ
            </Button>
            <Button disabled={sending} onClick={() => void confirmSend()}>
              <Send className="size-4" />
              Gửi lên cấp trên
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================= hàng đợi

type QueueRow = {
  task: TeamReportTask;
  template: TeamReportTemplate | null;
  readiness: TaskReadiness;
};

type TaskQueueProps = {
  rows: QueueRow[];
  total: number;
  selectedId: string | null;
  filter: QueueFilter;
  query: string;
  counts: Record<TaskReadiness, number>;
  onFilter: (next: QueueFilter) => void;
  onQuery: (next: string) => void;
  onPick: (id: string) => void;
};

/** Danh sách nhiệm vụ trong ngày, chọn một cái để mở biểu mẫu bên phải. */
function TaskQueue({
  rows,
  total,
  selectedId,
  filter,
  query,
  counts,
  onFilter,
  onQuery,
  onPick,
}: TaskQueueProps) {
  return (
    <Card className="shadow-sm xl:sticky xl:top-4 xl:self-start">
      <CardContent className="space-y-3 py-4">
        <div className="space-y-1">
          <h2 className="font-display text-sm font-semibold">
            Hàng đợi nhiệm vụ
          </h2>
          <p className="text-xs text-muted-foreground">
            {total} nhiệm vụ trong ngày · chọn một nhiệm vụ để xử lý
          </p>
        </div>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder="Tìm nhiệm vụ..."
            className="bg-background pl-8"
          />
        </div>

        <SegmentedTabs
          ariaLabel="Lọc theo trạng thái"
          value={filter}
          onChange={onFilter}
          items={[
            { value: "ALL" as const, label: `Tất cả (${total})` },
            {
              value: "UNCLASSIFIED" as const,
              label: `Chưa phân loại (${counts.UNCLASSIFIED})`,
            },
            {
              value: "IN_PROGRESS" as const,
              label: `Đang hoàn thiện (${counts.IN_PROGRESS})`,
            },
            { value: "READY" as const, label: `Sẵn sàng (${counts.READY})` },
          ]}
          className="flex-wrap"
        />

        <div className="max-h-[32rem] space-y-1.5 overflow-y-auto">
          {rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Không có nhiệm vụ nào khớp.
            </p>
          ) : null}

          {rows.map(({ task, readiness }) => (
            <button
              key={task._id}
              type="button"
              onClick={() => onPick(task._id)}
              className={cn(
                "w-full cursor-pointer rounded-md border p-2.5 text-left transition-colors",
                task._id === selectedId
                  ? "border-primary bg-primary/5"
                  : "hover:bg-muted/60",
              )}
            >
              <div className="line-clamp-2 break-words text-sm font-medium">
                {task.name}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-muted-foreground tabular-nums">
                  {task.deadline
                    ? `Hạn ${formatYmd(task.deadline)}`
                    : "Không đặt hạn"}
                </span>
                <Badge
                  variant="secondary"
                  className={cn("font-normal", READINESS_CLASS[readiness])}
                >
                  {READINESS_LABEL[readiness]}
                </Badge>
              </div>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ======================================================= nhiệm vụ đang làm

type TaskDetailPanelProps = {
  task: TeamReportTask;
  template: TeamReportTemplate | null;
  readiness: TaskReadiness;
  axes: TeamReportAxis[];
  contents: TeamReportWorkContent[];
  templates: Record<string, TeamReportTemplate | null>;
  catalogs: TeamReportCatalogs;
  /** Đang gửi một thay đổi lên server. */
  saving: boolean;
  /** Giờ lưu gần nhất trong phiên này; null = chưa lưu lần nào. */
  savedAt: string | null;
  disabled: boolean;
  onPatch: (task: TeamReportTask, input: TeamReportClassifyInput) => void;
};

/**
 * Biểu mẫu của MỘT nhiệm vụ, xếp dọc.
 *
 * Ghép `version` vào khoá để React dựng lại các ô khi nhiệm vụ thật sự đổi: ô
 * nhập giữ bản nháp cục bộ, mà state cục bộ thì không tự nhận giá trị mới khi
 * props đổi.
 */
function TaskDetailPanel(props: TaskDetailPanelProps) {
  return (
    <TaskDetailBody
      key={`${props.task._id}:${props.task.version}`}
      {...props}
    />
  );
}

function TaskDetailBody({
  task,
  template,
  readiness,
  axes,
  contents,
  templates,
  catalogs,
  saving,
  savedAt,
  disabled,
  onPatch,
}: TaskDetailPanelProps) {
  const axisId = refId(task.axisId);
  const contentId = refId(task.workContentId);
  const columns = inputColumns(template);
  /* Mẫu chưa khai cột "Nội dung công việc" thì màn phải tự vẽ ô chọn, kẻo không
     có chỗ nào phân loại và cả bảng không gửi đi được. */
  const ownWorkContent = !workContentColumnOf(template);
  const missing = missingRequiredColumns(task, template);

  const options = useMemo(
    () => contents.filter((content) => content.axisId === axisId),
    [contents, axisId],
  );

  /* Danh mục của các ô chọn phải theo đúng trục và nội dung đang chọn, kẻo bày
     ra thứ server sẽ chặn ngay khi bấm. */
  const scopedCatalogs = useMemo(
    () => narrowCatalogs(catalogs, { axisId, workContentId: contentId }),
    [catalogs, axisId, contentId],
  );

  /** Việc kế tiếp phải làm - nói thẳng thay vì để người dùng tự dò. */
  const nextStep = !axisId
    ? "Chọn một trục để mở đúng biểu mẫu của nhiệm vụ này."
    : !template
      ? "Trục này chưa được gán mẫu bảng. Báo quản trị bổ sung mẫu."
      : !contentId
        ? "Chọn nội dung công việc mà nhiệm vụ này thuộc về."
        : missing.length
          ? `Còn ${missing.length} ô bắt buộc chưa điền: ${missing
            .map((column) => column.title)
            .join(", ")}.`
          : "Đã đủ. Nhiệm vụ này sẵn sàng đi trong báo cáo ngày.";

  return (
    <Card className="shadow-sm">
      <CardContent className="space-y-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <ClipboardList className="size-5" />
            </span>
            <div className="min-w-0 space-y-1">
              <h2 className="break-words font-display text-lg font-semibold">
                {task.name}
              </h2>
              <p className="text-xs text-muted-foreground tabular-nums">
                Khai ngày {formatYmd(task.createdDate)}
                {task.deadline ? ` · hạn ${formatYmd(task.deadline)}` : ""}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {/* Tự lưu nên phải nói rõ đã lưu chưa - không có nút Lưu nào cả. */}
            {saving ? (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" />
                Đang lưu
              </span>
            ) : savedAt ? (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Check className="size-3 text-emerald-600" />
                Đã lưu lúc {savedAt}
              </span>
            ) : null}
            <Badge
              variant="secondary"
              className={cn("font-normal", READINESS_CLASS[readiness])}
            >
              {READINESS_LABEL[readiness]}
            </Badge>
          </div>
        </div>

        <div className="flex items-start gap-2 rounded-md border bg-muted/40 px-3 py-2.5 text-sm">
          <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <span>
            {nextStep}{" "}
            <span className="text-muted-foreground">
              Mỗi ô tự lưu ngay khi chọn hoặc rời ô, không cần bấm Lưu.
            </span>
          </span>
        </div>

        {/* -------------------------------------------- 1. chọn trục */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-sm font-semibold">
              1. Chọn trục áp dụng
            </h3>
            <span className="text-xs font-medium text-destructive">
              Bắt buộc
            </span>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {axes.map((axis) => (
              <AxisCard
                key={axis._id}
                axis={axis}
                template={templates[axis._id] ?? null}
                active={axis._id === axisId}
                disabled={disabled}
                onPick={() =>
                  onPatch(task, { version: task.version, axisId: axis._id })
                }
              />
            ))}
          </div>
        </section>

        {/* ------------------------------- 2. nội dung theo biểu mẫu */}
        {axisId ? (
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-sm font-semibold">
                2. Nội dung nhiệm vụ
              </h3>
              {template ? (
                <span className="text-xs text-muted-foreground">
                  Mẫu: {template.name} (bản {template.version})
                </span>
              ) : (
                <Badge
                  variant="secondary"
                  className={cn(
                    "gap-1 font-normal",
                    READINESS_CLASS.UNCLASSIFIED,
                  )}
                >
                  <TriangleAlert className="size-3" />
                  Trục chưa có mẫu bảng
                </Badge>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {ownWorkContent ? (
                <Field label="Nội dung công việc" required>
                  <Select
                    value={contentId || "__none__"}
                    disabled={disabled}
                    onValueChange={(value) =>
                      onPatch(task, {
                        version: task.version,
                        workContentId: value === "__none__" ? null : value,
                      })
                    }
                  >
                    <SelectTrigger className="w-full bg-background">
                      <SelectValue placeholder="Chọn" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Chưa chọn</SelectItem>
                      {options.map((content) => (
                        <SelectItem key={content._id} value={content._id}>
                          {content.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              ) : null}

              {columns.map((column) => {
                const catalog = catalogOfColumn(column);
                const value = catalog
                  ? (finalCatalogValue(task, column.key)?.id ?? "")
                  : String(finalFieldValue(task, column.key) ?? "");

                return (
                  <Field
                    key={column.key}
                    label={column.title}
                    required={column.required}
                    /* Ô chữ dài và ô tệp chiếm cả hàng - ép vào nửa hàng thì
                       nội dung bị cắt ngắn ngay lúc đang gõ. */
                    wide={
                      column.dataType === "text" || column.dataType === "file"
                    }
                    hint={
                      isColumnReviewed(task, column.key)
                        ? "Cấp trên đã chấm lại ô này"
                        : undefined
                    }
                  >
                    <DynamicColumnCell
                      column={column}
                      value={value}
                      catalogs={scopedCatalogs}
                      disabled={disabled}
                      onCommit={(next) =>
                        onPatch(task, {
                          version: task.version,
                          ...(catalog
                            ? { catalogValues: { [column.key]: next } }
                            : { fieldValues: { [column.key]: next } }),
                        })
                      }
                    />
                  </Field>
                );
              })}
            </div>
          </section>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  required,
  wide,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  wide?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", wide && "sm:col-span-2")}>
      <label className="block text-sm font-medium">
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </label>
      {children}
      {hint ? (
        <p className="text-xs text-amber-700 dark:text-amber-400">{hint}</p>
      ) : null}
    </div>
  );
}

/**
 * Một trục để chọn, kèm những gì mẫu của nó thật sự khai.
 *
 * Chỉ nói điều đọc được từ cấu hình (điểm tối đa của trục, số cột, có chấm tỉ
 * lệ hay không) - đặt nhãn tự nghĩ ra thì đến lúc quản trị đổi mẫu là nhãn nói
 * một đằng, bảng bày một nẻo.
 */
function AxisCard({
  axis,
  template,
  active,
  disabled,
  onPick,
}: {
  axis: TeamReportAxis;
  template: TeamReportTemplate | null;
  active: boolean;
  disabled: boolean;
  onPick: () => void;
}) {
  const columns = inputColumns(template);
  const hints = [
    axis.maxScore > 0 ? `${axis.maxScore} điểm` : "",
    columns.some((column) => column.semanticKey === "quality_level")
      ? "chấm theo tỉ lệ"
      : "",
    columns.some((column) => column.dataType === "boolean")
      ? "đạt / không đạt"
      : "",
    template ? `${columns.length} ô nhập` : "chưa có mẫu",
  ].filter(Boolean);

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onPick}
      className={cn(
        "cursor-pointer rounded-md border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        active ? "border-primary bg-primary/5" : "hover:bg-muted/60",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="break-words text-sm font-medium">{axis.name}</span>
        {active ? (
          <CircleCheck className="mt-0.5 size-4 shrink-0 text-primary" />
        ) : null}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{hints.join(" · ")}</p>
    </button>
  );
}

// ========================================================= tổng quan ngày

function DaySummary({
  counts,
  byAxis,
  axes,
}: {
  counts: Record<TaskReadiness, number>;
  byAxis: Map<string, number>;
  axes: TeamReportAxis[];
}) {
  return (
    <Card className="shadow-sm xl:sticky xl:top-4 xl:self-start">
      <CardContent className="space-y-4 py-4">
        <h2 className="font-display text-sm font-semibold">
          Tổng quan hôm nay
        </h2>

        <div className="space-y-2.5">
          {(["UNCLASSIFIED", "IN_PROGRESS", "READY"] as const).map((key) => (
            <div key={key} className="flex items-baseline justify-between">
              <span className="text-sm text-muted-foreground">
                {READINESS_LABEL[key]}
              </span>
              <span className="font-display text-xl font-semibold tabular-nums">
                {counts[key]}
              </span>
            </div>
          ))}
        </div>

        <div className="space-y-1.5 border-t pt-3">
          <p className="text-xs font-medium text-muted-foreground">
            Đã xếp theo trục
          </p>
          {axes.map((axis) => (
            <div
              key={axis._id}
              className="flex items-center justify-between gap-2 text-sm"
            >
              <span className="min-w-0 truncate">{axis.name}</span>
              <span className="tabular-nums text-muted-foreground">
                {byAxis.get(axis._id) ?? 0}
              </span>
            </div>
          ))}
        </div>

        {/* Nhắc lại luật gửi ngay tại chỗ người dùng đang đứng - đây là chỗ hay
            bị hiểu nhầm nhất giữa hai bản nghiệp vụ. */}
        <p className="rounded-md border bg-muted/40 p-2.5 text-xs text-muted-foreground">
          Cả bảng ngày gửi trong một lượt. Phân loại xong hết thì nút{" "}
          <strong>Gửi báo cáo ngày</strong> mới bật.
        </p>
      </CardContent>
    </Card>
  );
}
