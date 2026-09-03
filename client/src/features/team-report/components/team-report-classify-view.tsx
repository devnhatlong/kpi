"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import {
  Ban,
  Check,
  CheckCheck,
  CircleCheck,
  ClipboardList,
  Info,
  Loader2,
  Lock,
  Search,
  Send,
  TriangleAlert,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
  closeTeamReportTask,
  fetchTeamReportClassify,
  reopenTeamReportTask,
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

/**
 * Bộ lọc hàng đợi.
 *
 * `CLOSED` không phải một mức "sẵn sàng" mà là trạng thái sống/chết của nhiệm
 * vụ, nhưng gộp chung vào một dải nút vì với người dùng đây cùng là một câu hỏi:
 * "còn cái nào phải đụng tới nữa không".
 */
type QueueFilter = "ALL" | TaskReadiness | "CLOSED";

/**
 * Khoá của một lỗi ô: nhiệm vụ nào, BẢN nào, cột nào.
 *
 * Có số bản trong khoá thì lỗi tự hết hạn, không cần chỗ nào đi dọn:
 * - lưu thành công -> bản tăng -> lỗi cũ không còn khớp;
 * - đổi trục -> bản tăng, cả bộ cột cũ biến mất luôn;
 * - người khác sửa dòng này -> bản tăng, ô dựng lại với giá trị mới, mà lỗi cũ
 *   nói về con số vừa bị thay thì cũng không còn đúng nữa.
 *
 * Lượt lưu bị từ chối KHÔNG tăng bản, nên lỗi vẫn bám đúng ô cho tới khi sửa.
 */
const cellErrorKey = (task: TeamReportTask, columnKey: string) =>
  `${task._id}:${task.version}:${columnKey}`;

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
  /* Ô nào vừa bị server từ chối - xem `cellErrorKey` để biết khoá gồm những gì. */
  const [cellErrors, setCellErrors] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [note, setNote] = useState("");
  /* Nhiệm vụ đang hỏi lý do dừng. Chỉ "dừng giữa chừng" mới cần hộp thoại;
     "đã xong" và "mở lại" bấm là chạy. */
  const [stopping, setStopping] = useState<TeamReportTask | null>(null);
  const [stopReason, setStopReason] = useState("");

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

  /*
    Việc đã đóng VẪN nằm trong các mức phân loại, không bị lọc riêng ra. Nếu ẩn
    đi thì một việc đóng sớm mà chưa phân loại sẽ chặn nút gửi trong khi không
    tab nào bày nó ra - người dùng chỉ thấy "còn 1 nhiệm vụ chưa phân loại" mà
    không tìm được nhiệm vụ nào.
  */
  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return rows.filter(
      (row) =>
        (filter === "ALL" ||
          (filter === "CLOSED"
            ? !row.task.isOpen
            : row.readiness === filter)) &&
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
    let closed = 0;
    for (const row of rows) {
      byReadiness[row.readiness] += 1;
      if (!row.task.isOpen) closed += 1;
      const axisId = refId(row.task.axisId);
      if (axisId) byAxis.set(axisId, (byAxis.get(axisId) ?? 0) + 1);
    }
    return { byReadiness, byAxis, closed };
  }, [rows]);

  /**
   * Một lần chạm vào server cho MỘT nhiệm vụ.
   *
   * Cả đội gõ chung một tài khoản nên 409 (người khác vừa sửa) là chuyện thường
   * ngày, không phải sự cố - mọi thao tác đều đi qua đây để nói cùng một câu và
   * cùng nạp lại bản mới.
   */
  const runOnTask = async (
    task: TeamReportTask,
    action: () => Promise<unknown>,
    fallbackError: string,
  ) => {
    setBusyId(task._id);
    try {
      await action();
      await mutate();
      return true;
    } catch (error) {
      const status = (error as { response?: { status?: number } })?.response
        ?.status;
      if (status === 409) {
        toast.error(
          "Nhiệm vụ này vừa được người khác sửa. Đã tải lại bản mới.",
        );
      } else {
        toast.error(getApiErrorMessage(error, fallbackError));
      }
      // Nạp lại để ô trên màn quay về đúng giá trị server đang giữ, không để
      // người dùng tưởng đã lưu xong.
      await mutate();
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const patch = async (
    task: TeamReportTask,
    input: TeamReportClassifyInput,
  ) => {
    /*
      Mỗi lượt lưu chỉ đụng vào MỘT ô (mỗi ô tự lưu khi rời), nên khoá đầu tiên
      trong `fieldValues`/`catalogValues` chính là ô người dùng vừa gõ - đủ để
      gắn câu từ chối của server vào đúng ô đó.
    */
    const touched =
      Object.keys(input.fieldValues ?? {})[0] ??
      Object.keys(input.catalogValues ?? {})[0] ??
      null;
    const errorKey = touched ? cellErrorKey(task, touched) : null;

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
        await mutate();
      } else if (errorKey) {
        /*
          Lỗi của một ô cụ thể thì bày NGAY TẠI ô đó, và KHÔNG nạp lại: nạp lại
          là đẩy giá trị server về, xoá mất con số người dùng vừa gõ - họ mất
          luôn thứ cần sửa. Cũng không bắn toast, đã có chữ đỏ ngay dưới ô.
        */
        setCellErrors((prev) => {
          /* Dọn lỗi của các BẢN CŨ cùng nhiệm vụ - ô của bản đó đã dựng lại nên
             lỗi treo lại vô nghĩa. Lỗi của bản hiện tại thì giữ: hai cột cùng
             sai một lúc là chuyện bình thường, cả hai đều phải đỏ. */
          const live = `${task._id}:${task.version}:`;
          const alive = Object.fromEntries(
            Object.entries(prev).filter(
              ([at]) => !at.startsWith(`${task._id}:`) || at.startsWith(live),
            ),
          );
          return {
            ...alive,
            [errorKey]: getApiErrorMessage(error, "Giá trị không hợp lệ."),
          };
        });
      } else {
        toast.error(getApiErrorMessage(error, "Không lưu được."));
        await mutate();
      }
    } finally {
      setBusyId(null);
    }
  };

  /*
    Đóng và mở lại có hiệu lực NGAY, ngay tại nhiệm vụ đang mở - không gom vào
    một danh sách tích lúc gửi. Một ngày vài chục nhiệm vụ thì danh sách đó dài
    hơn màn hình và không ai đối chiếu nổi tên nào là tên nào.

    An toàn vì bảng của một ngày vẫn giữ cả việc đóng trong chính ngày đó; đánh
    dấu sớm không làm nó rơi khỏi báo cáo đang soạn, chỉ vắng từ ngày mai.
  */
  const markDone = (task: TeamReportTask) =>
    void runOnTask(
      task,
      async () => {
        await closeTeamReportTask(task._id, {
          version: task.version,
          done: true,
        });
        toast.success(
          "Đã đánh dấu hoàn thành. Từ mai nhiệm vụ này không hiện lại.",
        );
      },
      "Không đóng được nhiệm vụ.",
    );

  const reopen = (task: TeamReportTask) =>
    void runOnTask(
      task,
      async () => {
        await reopenTeamReportTask(task._id, { version: task.version });
        toast.success("Đã mở lại nhiệm vụ.");
      },
      "Không mở lại được nhiệm vụ.",
    );

  const confirmStop = async () => {
    if (!stopping) return;
    const reason = stopReason.trim();
    if (!reason) {
      toast.error("Nêu lý do dừng để cấp trên biết vì sao việc này thôi làm.");
      return;
    }
    const ok = await runOnTask(
      stopping,
      async () => {
        await closeTeamReportTask(stopping._id, {
          version: stopping.version,
          reason,
        });
        toast.success("Đã dừng nhiệm vụ.");
      },
      "Không dừng được nhiệm vụ.",
    );
    if (ok) {
      setStopping(null);
      setStopReason("");
    }
  };

  const confirmSend = async () => {
    setSending(true);
    try {
      const result = await submitTeamReportDay({
        reportDate,
        note: note.trim() || undefined,
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
            closedCount={counts.closed}
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
              cellErrors={cellErrors}
              saving={busyId === selected.task._id}
              savedAt={savedAt}
              /*
                Nhiệm vụ đã chốt thì biểu mẫu khoá lại. Sửa một việc đã đóng là
                sửa thứ đội vừa tuyên bố là xong - muốn sửa thì mở lại trước, để
                còn có một hành động rõ ràng chịu trách nhiệm cho việc đó.
              */
              disabled={
                !editable ||
                busyId === selected.task._id ||
                !selected.task.isOpen
              }
              /* Riêng nút đóng/mở lại thì vẫn bấm được - không thì việc đã đóng
                 không còn đường nào mở ra. */
              lifecycleDisabled={!editable || busyId === selected.task._id}
              onPatch={patch}
              onMarkDone={markDone}
              onReopen={reopen}
              onStop={(task) => {
                setStopReason("");
                setStopping(task);
              }}
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
            closedCount={counts.closed}
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
            {/*
              Chỉ TỔNG KẾT, không cho quyết định gì thêm ở đây. Việc nào xong đã
              được đánh dấu ngay lúc làm nó; nhồi vào đây một danh sách tích thì
              ngày nhiều nhiệm vụ là phải dò cả trăm dòng ở đúng bước cuối cùng.
            */}
            <div className="space-y-1.5 rounded-md border bg-muted/40 px-3 py-2.5 text-sm">
              <p>
                Bản gửi gồm <strong>{tasks.length} nhiệm vụ</strong>.
              </p>
              <p className="text-muted-foreground">
                {counts.closed
                  ? `${counts.closed} việc đã đóng hôm nay - vẫn nằm trong bản gửi này, từ mai không hiện lại. ${tasks.length - counts.closed} việc còn chạy tiếp.`
                  : "Chưa đóng việc nào, tất cả sẽ hiện lại ở bảng ngày mai."}
              </p>
            </div>

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

      {/* Dừng giữa chừng thì phải nói vì sao - "đã xong" thì không hỏi gì. */}
      <Dialog
        open={!!stopping}
        onOpenChange={(open) => {
          if (!open) setStopping(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Dừng nhiệm vụ giữa chừng</DialogTitle>
            <DialogDescription className="break-words">
              {stopping?.name}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <p className="text-sm font-medium">
              Lý do dừng <span className="text-destructive">*</span>
            </p>
            <Textarea
              value={stopReason}
              onChange={(event) => setStopReason(event.target.value)}
              rows={3}
              placeholder="Vì sao việc này thôi không làm nữa"
            />
            <p className="text-xs text-muted-foreground">
              Cấp trên đọc được lý do này trong báo cáo ngày.
            </p>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setStopping(null)}>
              Huỷ
            </Button>
            <Button
              variant="destructive"
              disabled={!!stopping && busyId === stopping._id}
              onClick={() => void confirmStop()}
            >
              <Ban className="size-4" />
              Dừng nhiệm vụ
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
  closedCount: number;
  selectedId: string | null;
  filter: QueueFilter;
  query: string;
  counts: Record<TaskReadiness, number>;
  onFilter: (next: QueueFilter) => void;
  onQuery: (next: string) => void;
  onPick: (id: string) => void;
};

/** Mỗi lần bày thêm bấy nhiêu dòng. Xem mục `QueueList` để biết vì sao. */
const QUEUE_PAGE = 25;

/** Danh sách nhiệm vụ trong ngày, chọn một cái để mở biểu mẫu bên phải. */
function TaskQueue({
  rows,
  total,
  closedCount,
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
            {rows.length === total
              ? `${total} nhiệm vụ trong ngày`
              : `Đang xem ${rows.length}/${total} nhiệm vụ`}{" "}
            · chọn một nhiệm vụ để xử lý
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
            { value: "CLOSED" as const, label: `Đã đóng (${closedCount})` },
          ]}
          className="flex-wrap"
        />

        {/*
          Khoá theo bộ lọc để React DỰNG LẠI danh sách: số dòng đang bày là state
          cục bộ, đổi bộ lọc mà giữ nguyên state thì lần lọc mới mở ra giữa
          chừng. Dựng lại rẻ hơn và không cần effect đồng bộ.
        */}
        <QueueList
          key={`${filter}:${query.trim().toLowerCase()}`}
          rows={rows}
          selectedId={selectedId}
          onPick={onPick}
        />
      </CardContent>
    </Card>
  );
}

/**
 * Danh sách nhiệm vụ, bày dần từng mẻ.
 *
 * Một ngày của đội lớn có thể lên tới hàng trăm nhiệm vụ. Dựng hết một lượt thì
 * mỗi lần bảng tự nạp lại (vài giây một lần) là ngần ấy nút phải so lại - gõ
 * vào ô tìm kiếm bắt đầu giật. Bày `QUEUE_PAGE` dòng đầu là đủ cho thao tác
 * thường ngày; ai cần xem sâu hơn thì bấm tải thêm.
 */
function QueueList({
  rows,
  selectedId,
  onPick,
}: {
  rows: QueueRow[];
  selectedId: string | null;
  onPick: (id: string) => void;
}) {
  const [shown, setShown] = useState(QUEUE_PAGE);
  const rest = rows.length - shown;

  return (
    <div className="max-h-[32rem] space-y-1.5 overflow-y-auto">
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Không có nhiệm vụ nào khớp.
        </p>
      ) : null}

      {rows.slice(0, shown).map(({ task, readiness }) => (
        <button
          key={task._id}
          type="button"
          onClick={() => onPick(task._id)}
          className={cn(
            "w-full cursor-pointer rounded-md border p-2.5 text-left transition-colors",
            task._id === selectedId
              ? "border-primary bg-primary/5"
              : "hover:bg-muted/60",
            !task.isOpen && "opacity-60",
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
            {task.isOpen ? null : (
              <Badge variant="outline" className="gap-1 font-normal">
                <Check className="size-3" />
                {task.closedReason ? "Đã dừng" : "Đã xong"}
              </Badge>
            )}
            <Badge
              variant="secondary"
              className={cn("font-normal", READINESS_CLASS[readiness])}
            >
              {READINESS_LABEL[readiness]}
            </Badge>
          </div>
        </button>
      ))}

      {rest > 0 ? (
        <Button
          type="button"
          variant="ghost"
          className="w-full"
          onClick={() => setShown((current) => current + QUEUE_PAGE)}
        >
          Xem thêm {Math.min(rest, QUEUE_PAGE)} nhiệm vụ (còn {rest})
        </Button>
      ) : null}
    </div>
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
  /** Câu từ chối của server, khoá `<id nhiệm vụ>:<khoá cột>`. */
  cellErrors: Record<string, string>;
  /** Đang gửi một thay đổi lên server. */
  saving: boolean;
  /** Giờ lưu gần nhất trong phiên này; null = chưa lưu lần nào. */
  savedAt: string | null;
  /** Khoá các ô của biểu mẫu. */
  disabled: boolean;
  /** Khoá riêng nút đóng / mở lại - không đi cùng `disabled`. */
  lifecycleDisabled: boolean;
  onPatch: (task: TeamReportTask, input: TeamReportClassifyInput) => void;
  onMarkDone: (task: TeamReportTask) => void;
  onReopen: (task: TeamReportTask) => void;
  onStop: (task: TeamReportTask) => void;
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
  cellErrors,
  saving,
  savedAt,
  disabled,
  lifecycleDisabled,
  onPatch,
  onMarkDone,
  onReopen,
  onStop,
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
              {/* Sản phẩm khai ở GĐ1 - chỉ đọc ở đây, sửa thì quay về bảng
                  nhập. Vẫn phải bày ra vì nó là thứ nói rõ nhiệm vụ này phải
                  đẻ ra cái gì, người phân loại cần đọc để chọn đúng trục. */}
              {task.product ? (
                <p className="break-words text-sm">
                  <span className="text-muted-foreground">Sản phẩm: </span>
                  {task.product}
                </p>
              ) : null}
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

        <TaskLifecycleBar
          task={task}
          disabled={lifecycleDisabled}
          onMarkDone={onMarkDone}
          onReopen={onReopen}
          onStop={onStop}
        />

        {/* Việc đã chốt thì không nhắc "còn thiếu ô nào" nữa: nó đang khoá, đọc
            xong cũng không làm gì được, chỉ tổ mời người ta đi tìm ô để gõ. */}
        {task.isOpen ? (
          <div className="flex items-start gap-2 rounded-md border bg-muted/40 px-3 py-2.5 text-sm">
            <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <span>
              {nextStep}{" "}
              <span className="text-muted-foreground">
                Mỗi ô tự lưu ngay khi chọn hoặc rời ô, không cần bấm Lưu.
              </span>
            </span>
          </div>
        ) : null}

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
                const error = cellErrors[cellErrorKey(task, column.key)];

                return (
                  <Field
                    key={column.key}
                    label={column.title}
                    required={column.required}
                    error={error}
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
                      invalid={!!error}
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

/**
 * Đóng / mở lại một nhiệm vụ, ngay tại chỗ đang làm nhiệm vụ đó.
 *
 * Trước đây việc này nằm trong hộp thoại gửi, dưới dạng một danh sách tích tất
 * cả nhiệm vụ đang mở. Ngày nhiều việc thì danh sách ấy dài hơn màn hình, lại
 * chỉ có mỗi cái tên để đối chiếu - người bấm không còn nhớ từng việc đã tới
 * đâu. Đặt tại nhiệm vụ thì quyết định xảy ra đúng lúc người ta đang nhìn nó.
 *
 * Bấm là chạy ngay, nhưng không mất gì: việc đóng hôm nay vẫn đi trong báo cáo
 * hôm nay, chỉ vắng mặt từ ngày mai, và luôn mở lại được.
 */
function TaskLifecycleBar({
  task,
  disabled,
  onMarkDone,
  onReopen,
  onStop,
}: {
  task: TeamReportTask;
  disabled: boolean;
  onMarkDone: (task: TeamReportTask) => void;
  onReopen: (task: TeamReportTask) => void;
  onStop: (task: TeamReportTask) => void;
}) {
  if (!task.isOpen) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2.5 text-sm dark:border-emerald-900 dark:bg-emerald-950/40">
        <span className="flex min-w-0 items-start gap-2">
          <CheckCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" />
          <span className="min-w-0 break-words">
            {task.closedReason
              ? `Đã dừng giữa chừng: ${task.closedReason}`
              : "Đã đánh dấu hoàn thành."}{" "}
            <span className="text-muted-foreground">
              Vẫn đi trong báo cáo hôm nay, từ mai không hiện lại. Biểu mẫu bên
              dưới khoá lại - muốn sửa thì mở lại trước.
            </span>
          </span>
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => onReopen(task)}
        >
          <Undo2 className="size-4" />
          Mở lại
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-2.5 text-sm">
      <span className="text-muted-foreground">
        Nhiệm vụ đang chạy - mai vẫn hiện lại ở bảng ngày mới.
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          disabled={disabled}
          onClick={() => onStop(task)}
        >
          <Ban className="size-4" />
          Dừng giữa chừng
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => onMarkDone(task)}
        >
          <CheckCheck className="size-4" />
          Đánh dấu đã xong
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  wide,
  hint,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  wide?: boolean;
  hint?: string;
  /** Câu từ chối của server cho đúng ô này. */
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", wide && "sm:col-span-2")}>
      <label className="block text-sm font-medium">
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </label>
      {children}
      {/* Lỗi đứng trên gợi ý: đang có cái phải sửa thì đó là thứ cần đọc trước. */}
      {error ? (
        <p className="flex items-start gap-1.5 text-xs text-destructive">
          <TriangleAlert className="mt-0.5 size-3 shrink-0" />
          <span>{error}</span>
        </p>
      ) : null}
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
  closedCount,
  byAxis,
  axes,
}: {
  counts: Record<TaskReadiness, number>;
  closedCount: number;
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

          {/* Đã đóng nằm chồng lên ba mức trên chứ không tách rời - một việc đã
              xong vẫn có mức phân loại của nó, nên kẻ vạch cho khỏi cộng nhầm. */}
          <div className="flex items-baseline justify-between border-t pt-2.5">
            <span className="text-sm text-muted-foreground">
              Đã đóng hôm nay
            </span>
            <span className="font-display text-xl font-semibold tabular-nums">
              {closedCount}
            </span>
          </div>
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
