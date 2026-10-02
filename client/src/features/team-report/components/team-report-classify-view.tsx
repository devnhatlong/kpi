"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import {
  ArrowRight,
  Ban,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  ClipboardList,
  Info,
  Loader2,
  Lock,
  PartyPopper,
  Rows3,
  Search,
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
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
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
import { SegmentedTabs } from "@/components/common/segmented-tabs";
import {
  classifyTeamReportTask,
  closeTeamReportTask,
  fetchTeamReportClassify,
  reopenTeamReportTask,
  teamReportKeys,
  type TeamReportClassifyInput,
} from "@/features/team-report/api";
import {
  CLOSED_DONE_CLASS,
  CLOSED_STOPPED_CLASS,
  READINESS_CLASS,
  scoreTone,
} from "@/features/team-report/status-styles";
import { DynamicColumnCell } from "@/features/team-report/components/dynamic-column-cell";
import { TeamReportDayPicker } from "@/features/team-report/components/team-report-day-picker";
import {
  READINESS_LABEL,
  TEAM_REPORT_STATUS_LABEL,
  catalogOfColumn,
  finalCatalogValue,
  finalFieldValue,
  formatScore,
  inputColumns,
  isColumnReviewed,
  missingRequiredColumns,
  narrowCatalogs,
  readinessOf,
  refId,
  workContentColumnOf,
  type TaskReadiness,
  type TeamReportAxis,
  type TeamReportAxisScore,
  type TeamReportCatalogs,
  type TeamReportColumn,
  type TeamReportTask,
  type TeamReportTemplate,
  type TeamReportWorkContent,
} from "@/features/team-report/types";
import { useServerTime } from "@/hooks/use-server-time";
import { getApiErrorMessage } from "@/lib/api-client";
import { formatServerHm, formatYmd, serverYmd } from "@/lib/server-time";
import { cn } from "@/lib/utils";

/* Phân loại ít khi hai người cùng đụng một dòng - 30 giây, cùng lý do giảm
   tải như bảng nhập (xem team-report-sheet-view). */
const REFRESH_MS = 30_000;

/**
 * Bộ lọc hàng đợi.
 *
 * `CLOSED` không phải một mức "sẵn sàng" mà là trạng thái sống/chết của nhiệm
 * vụ, nhưng gộp chung vào một dải nút vì với người dùng đây cùng là một câu hỏi:
 * "còn cái nào phải đụng tới nữa không".
 */
type QueueFilter = "ALL" | "TODO" | TaskReadiness | "CLOSED";

const QUEUE_FILTERS: QueueFilter[] = [
  "ALL",
  "TODO",
  "UNCLASSIFIED",
  "IN_PROGRESS",
  "READY",
  "CLOSED",
];

/**
 * Nhiệm vụ còn phải đụng tới: đang mở mà chưa "Sẵn sàng".
 *
 * Đây là câu người phân loại hỏi suốt buổi - "còn cái nào nữa" - nên có hẳn một
 * bộ lọc và là thứ nút "Tiếp" nhảy tới, thay vì bắt họ tự dò trong cả ngày.
 */
const needsWork = (row: { task: TeamReportTask; readiness: TaskReadiness }) =>
  row.task.isOpen && row.readiness !== "READY";

function filterLabel(
  value: QueueFilter,
  counts: Record<TaskReadiness, number>,
  total: number,
  todo: number,
  closed: number,
) {
  switch (value) {
    case "ALL":
      return `Tất cả (${total})`;
    case "TODO":
      return `Cần xử lý (${todo})`;
    case "CLOSED":
      return `Đã đóng (${closed})`;
    case "READY":
      return `Sẵn sàng (${counts.READY})`;
    default:
      return `${READINESS_LABEL[value]} (${counts[value]})`;
  }
}

/** Bỏ dấu, bỏ hoa thường - gõ "ra soat" vẫn ra "Rà soát". */
function fold(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase();
}

/**
 * Nhiệm vụ đã có dữ liệu phân loại chưa.
 *
 * Server xoá sạch nội dung công việc, mọi ô của mẫu lẫn điểm cấp trên chấm lại
 * khi đổi trục - nên đổi trục trên một dòng đã điền phải hỏi lại trước.
 */
function hasClassifyData(task: TeamReportTask) {
  return (
    !!refId(task.workContentId) ||
    Object.keys(task.fieldValues ?? {}).length > 0 ||
    Object.keys(task.catalogValues ?? {}).length > 0
  );
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Hai cách nhìn cùng một bảng ngày.
 *
 * `DETAIL` - mỗi lần một nhiệm vụ, thấy trọn biểu mẫu của trục. Hợp lúc khai
 * một việc còn trống nhiều ô.
 *
 * `TABLE` - cả ngày trên một bảng, sửa tại chỗ. Hợp lúc đã khai gần xong và chỉ
 * cần rà: gán trục cho mấy dòng còn thiếu, đối chiếu hạn giữa các dòng, xem còn
 * dòng nào chưa đủ. Ở dạng nhiệm vụ thì những việc đó phải bấm qua từng dòng.
 */
type ViewMode = "DETAIL" | "TABLE";

/**
 * Ba chế độ cột của dạng bảng.
 *
 * `ALL_COLUMNS` - gộp cột của mọi mẫu đang có mặt trong bảng, trùng khoá thì
 * nhập làm một. Ô nào không thuộc mẫu của chính dòng đó thì để gạch ngang. Nhờ
 * vậy điền được TẤT CẢ ngay trên bảng mà không phải lọc theo trục trước, và
 * trong thực tế nhiều trục dùng chung một mẫu nên bảng không rộng như tưởng.
 *
 * `COMPACT_COLUMNS` - chỉ trục và nội dung công việc, để rà nhanh xem còn dòng
 * nào chưa gán.
 *
 * Một id trục - lọc còn các dòng của trục đó và bày trọn mẫu của nó, không dòng
 * nào có ô gạch ngang.
 */
const ALL_COLUMNS = "ALL";
const COMPACT_COLUMNS = "COMPACT";

/**
 * Ghim cột đầu và cột cuối của dạng bảng.
 *
 * Bộ cột gộp có thể tới hai chục cột, cuộn sang phải một đoạn là không còn biết
 * đang sửa dòng nào, mà nút thao tác thì nằm tít cuối. Ghim tên nhiệm vụ bên
 * trái và cụm nút bên phải thì cuộn bao xa vẫn giữ được hai mốc đó.
 *
 * Nền phải ĐỤC hoàn toàn, không dùng `bg-muted/50` như các ô khác: ô trong suốt
 * thì phần bảng cuộn qua bên dưới hiện xuyên lên. Viền ở mép ghim là ranh giới
 * cố ý, cho thấy rõ chỗ nào đứng yên chỗ nào chạy.
 */
const STICKY_HEAD = "sticky z-20 bg-muted";
const STICKY_CELL = "sticky z-10 bg-card group-hover:bg-muted/50";

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

  /*
    Ngày, cách xem và nhiệm vụ đang mở nằm trên URL (?date=&view=&task=): F5
    không đá người phân loại về nhiệm vụ đầu, và gửi link cho người bên cạnh là
    mở đúng việc đang bàn. Ngày trên URL lớn hơn hôm nay thì bỏ qua.
  */
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlDate = searchParams.get("date");
  const [pickedDate, setPickedDate] = useState<string | null>(
    urlDate && YMD.test(urlDate) ? urlDate : null,
  );
  const reportDate = pickedDate && pickedDate <= today ? pickedDate : today;

  const [pickedTaskId, setPickedTaskId] = useState<string | null>(
    searchParams.get("task"),
  );
  const [mode, setMode] = useState<ViewMode>(
    searchParams.get("view") === "table" ? "TABLE" : "DETAIL",
  );
  const [columnSet, setColumnSet] = useState<string>(ALL_COLUMNS);
  const [filter, setFilter] = useState<QueueFilter>("ALL");
  const [query, setQuery] = useState("");

  const syncUrl = (next: {
    date?: string | null;
    view?: ViewMode;
    task?: string | null;
  }) => {
    const date = next.date === undefined ? pickedDate : next.date;
    const view = next.view ?? mode;
    const task = next.task === undefined ? pickedTaskId : next.task;
    const params = new URLSearchParams();
    if (date) params.set("date", date);
    if (view === "TABLE") params.set("view", "table");
    if (task) params.set("task", task);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const pickDate = (next: string) => {
    const date = next === today ? null : next;
    setPickedDate(date);
    // Sang ngày khác thì nhiệm vụ đang mở không còn nghĩa gì.
    setPickedTaskId(null);
    syncUrl({ date, task: null });
  };

  const changeMode = (next: ViewMode) => {
    setMode(next);
    syncUrl({ view: next });
  };

  const pickTask = (id: string) => {
    setPickedTaskId(id);
    syncUrl({ task: id });
  };
  const [busyId, setBusyId] = useState<string | null>(null);
  /*
    Màn này TỰ LƯU: đổi ô nào là gửi ngay ô đó. Nhưng tự lưu mà không báo gì thì
    người dùng không biết đã xong hay chưa, và dễ ngồi tìm nút "Lưu" không tồn
    tại. Giữ mốc lưu gần nhất để hiện ngay cạnh tiêu đề.
  */
  const [savedAt, setSavedAt] = useState<string | null>(null);
  /* Ô nào vừa bị server từ chối - xem `cellErrorKey` để biết khoá gồm những gì. */
  const [cellErrors, setCellErrors] = useState<Record<string, string>>({});
  /* Nhiệm vụ đang hỏi lý do dừng. Chỉ "dừng giữa chừng" mới cần hộp thoại;
     "đã xong" và "mở lại" bấm là chạy. */
  const [stopping, setStopping] = useState<TeamReportTask | null>(null);
  const [stopReason, setStopReason] = useState("");
  const [stopReasonError, setStopReasonError] = useState(false);
  /* Đổi trục đang chờ xác nhận - xem `hasClassifyData`. */
  const [axisChange, setAxisChange] = useState<{
    task: TeamReportTask;
    axisId: string | null;
  } | null>(null);

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
    const term = fold(query.trim());
    return rows.filter(
      (row) =>
        (filter === "ALL" ||
          (filter === "TODO"
            ? needsWork(row)
            : filter === "CLOSED"
              ? !row.task.isOpen
              : row.readiness === filter)) &&
        // Tìm cả sản phẩm: người phân loại hay nhớ "cái kế hoạch số 12" hơn tên việc.
        (!term ||
          fold(row.task.name).includes(term) ||
          fold(row.task.product ?? "").includes(term)),
    );
  }, [rows, filter, query]);

  /*
    Suy ra nhiệm vụ đang mở thay vì giữ trong state rồi đồng bộ bằng effect: bảng
    tự nạp lại mỗi vài giây, mà nhiệm vụ đang chọn có thể vừa bị người khác đóng.
    Suy ra thì luôn trỏ vào một dòng còn tồn tại.

    Chưa chọn gì thì mở sẵn nhiệm vụ ĐẦU TIÊN CÒN PHẢI LÀM, không phải dòng đầu
    bảng - dòng đầu thường là việc đã xong từ hôm qua.
  */
  const selected =
    rows.find((row) => row.task._id === pickedTaskId) ??
    visible.find(needsWork) ??
    visible[0] ??
    rows[0];

  const counts = useMemo(() => {
    const byReadiness: Record<TaskReadiness, number> = {
      UNCLASSIFIED: 0,
      IN_PROGRESS: 0,
      READY: 0,
    };
    const byAxis = new Map<string, number>();
    let closed = 0;
    let todo = 0;
    for (const row of rows) {
      byReadiness[row.readiness] += 1;
      if (!row.task.isOpen) closed += 1;
      if (needsWork(row)) todo += 1;
      const axisId = refId(row.task.axisId);
      if (axisId) byAxis.set(axisId, (byAxis.get(axisId) ?? 0) + 1);
    }
    return { byReadiness, byAxis, closed, todo };
  }, [rows]);

  /*
    Đi lần lượt qua các nhiệm vụ.

    "Trước / Sau" đi theo đúng danh sách đang lọc. "Việc cần xử lý kế tiếp" thì
    nhảy qua những dòng đã xong, tìm vòng từ sau dòng đang mở - đó là thứ người
    phân loại cần ngay khi một việc vừa đủ ô.
  */
  const selectedIndex = selected
    ? visible.findIndex((row) => row.task._id === selected.task._id)
    : -1;
  const prevRow = selectedIndex > 0 ? visible[selectedIndex - 1] : null;
  const nextRow =
    selectedIndex >= 0 && selectedIndex < visible.length - 1
      ? visible[selectedIndex + 1]
      : null;
  const nextTodo = useMemo(() => {
    const start = selectedIndex < 0 ? 0 : selectedIndex + 1;
    const ordered = [...visible.slice(start), ...visible.slice(0, start)];
    return (
      ordered.find(
        (row) => needsWork(row) && row.task._id !== selected?.task._id,
      ) ?? null
    );
  }, [visible, selectedIndex, selected?.task._id]);

  /*
    Phím tắt J / K (hoặc Alt + ↓ / ↑) để đi tiếp / lùi mà không rời bàn phím.
    Bỏ qua khi đang gõ trong ô nhập hay đang mở hộp thoại - J là một chữ cái,
    nuốt mất nó giữa câu là lỗi khó chịu nhất có thể.
  */
  const navRef = useRef({ prevRow, nextRow, pickTask });
  navRef.current = { prevRow, nextRow, pickTask };
  useEffect(() => {
    if (mode !== "DETAIL") return;
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey) return;
      if (document.querySelector("[role='dialog'], [role='listbox']")) return;
      const target = event.target as HTMLElement | null;
      const typing =
        !!target &&
        (target.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
      const down =
        (event.altKey && event.key === "ArrowDown") ||
        (!event.altKey && !typing && event.key.toLowerCase() === "j");
      const up =
        (event.altKey && event.key === "ArrowUp") ||
        (!event.altKey && !typing && event.key.toLowerCase() === "k");
      const { prevRow: prev, nextRow: next, pickTask: pick } = navRef.current;
      if (down && next) {
        event.preventDefault();
        pick(next.task._id);
      } else if (up && prev) {
        event.preventDefault();
        pick(prev.task._id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode]);

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
  /*
    Đánh dấu xong chạy ngay không hỏi (bấm cả chục lần một buổi, hỏi lại mỗi
    lần là phiền), nên đường lùi phải nằm ngay trong thông báo: nút "Hoàn tác"
    mở lại đúng việc vừa đóng, khỏi phải lọc Đã đóng để tìm.
  */
  const markDone = (task: TeamReportTask) =>
    void runOnTask(
      task,
      async () => {
        const closed = await closeTeamReportTask(task._id, {
          version: task.version,
          done: true,
        });
        toast.success("Đã đánh dấu hoàn thành.", {
          description:
            "Nhiệm vụ rời bảng nhập ngày, vẫn còn ở đây trong mục Đã đóng.",
          action: {
            label: "Hoàn tác",
            onClick: () =>
              void runOnTask(
                closed,
                async () => {
                  await reopenTeamReportTask(closed._id, {
                    version: closed.version,
                  });
                  toast.success("Đã mở lại nhiệm vụ.");
                },
                "Không mở lại được nhiệm vụ.",
              ),
          },
        });
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

  /**
   * Cửa vào của mọi lượt lưu từ màn hình.
   *
   * Đổi trục trên một dòng đã điền thì dừng lại hỏi: server xoá sạch nội dung
   * công việc và mọi ô của mẫu cũ, mà ô chọn trục thì nằm ngay đầu - lỡ tay là
   * mất cả buổi chấm.
   */
  const requestPatch = (task: TeamReportTask, input: TeamReportClassifyInput) => {
    const changesAxis =
      input.axisId !== undefined &&
      (input.axisId ?? null) !== (refId(task.axisId) || null);
    if (changesAxis && refId(task.axisId) && hasClassifyData(task)) {
      setAxisChange({ task, axisId: input.axisId ?? null });
      return;
    }
    void patch(task, input);
  };

  const confirmAxisChange = () => {
    if (!axisChange) return;
    const { task, axisId } = axisChange;
    setAxisChange(null);
    void patch(task, { version: task.version, axisId });
  };

  const openStop = (task: TeamReportTask) => {
    setStopReason("");
    setStopReasonError(false);
    setStopping(task);
  };

  const confirmStop = async (event: FormEvent) => {
    event.preventDefault();
    if (!stopping) return;
    const reason = stopReason.trim();
    if (!reason) {
      setStopReasonError(true);
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Báo cáo ngày của đội · {formatYmd(reportDate)}
          </p>
          <h1 className="text-balance font-display text-2xl font-semibold tracking-tight">
            Phân loại nhiệm vụ
          </h1>
          <p className="text-sm text-muted-foreground">
            Chọn trục cho từng nhiệm vụ, hoàn thiện đúng biểu mẫu của trục đó.
            Nhiệm vụ &ldquo;Sẵn sàng&rdquo; sẽ được gom vào Báo cáo tổng hợp để
            trình cấp trên.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <SegmentedTabs
            ariaLabel="Cách xem bảng ngày"
            value={mode}
            onChange={changeMode}
            items={[
              {
                value: "DETAIL" as const,
                label: (
                  <span className="flex items-center gap-1.5">
                    <ClipboardList className="size-4" aria-hidden="true" />
                    Dạng nhiệm vụ
                  </span>
                ),
                title: "Mỗi lần một nhiệm vụ, thấy trọn biểu mẫu",
              },
              {
                value: "TABLE" as const,
                label: (
                  <span className="flex items-center gap-1.5">
                    <Rows3 className="size-4" aria-hidden="true" />
                    Dạng bảng
                  </span>
                ),
                title: "Cả ngày trên một bảng, sửa tại chỗ",
              },
            ]}
          />
          <TeamReportDayPicker
            value={reportDate}
            onChange={pickDate}
            today={today}
          />
          {/*
            Không còn nút "Gửi báo cáo ngày": luồng thật là đội gom nhiệm vụ
            thành BÁO CÁO TỔNG HỢP rồi trình phòng. Gửi bảng ngày chỉ khoá bảng
            mà phía phòng không còn chỗ duyệt. Route server vẫn giữ.
          */}
        </div>
      </div>

      {locked && data?.day ? (
        <div
          role="status"
          className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2.5 text-sm"
        >
          <Lock className="size-4 text-muted-foreground" aria-hidden="true" />
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

      {ready && !locked && reportDate !== today ? (
        <div
          role="status"
          className="rounded-md border bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground"
        >
          Đang xem lại ngày {formatYmd(reportDate)}. Chỉ bảng của hôm nay mới
          phân loại được.
        </div>
      ) : null}

      {(!ready || isLoading) && !tasks.length ? (
        <div className="grid gap-4 xl:grid-cols-[19rem_minmax(0,1fr)_17rem]">
          {[0, 1, 2].map((index) => (
            <Card key={index} className="shadow-sm">
              <CardContent className="space-y-3 py-4">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      {/* Trống thì chỉ luôn chỗ để có dữ liệu, không để một câu cụt. */}
      {ready && !isLoading && !tasks.length ? (
        <div className="flex flex-col items-center gap-3 rounded-md border border-dashed p-10 text-center">
          <ClipboardList
            className="size-8 text-muted-foreground"
            aria-hidden="true"
          />
          <div className="space-y-1">
            <p className="text-sm font-medium">
              Chưa có nhiệm vụ nào của ngày này
            </p>
            <p className="text-sm text-muted-foreground">
              Nhiệm vụ do đội khai ở bảng nhập ngày sẽ hiện ra đây để phân loại.
            </p>
          </div>
          {reportDate === today ? (
            <Button asChild variant="outline" size="sm">
              <Link href="/team-report/sheet">
                Mở bảng nhập nhiệm vụ
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </Button>
          ) : null}
        </div>
      ) : null}

      {tasks.length && mode === "TABLE" ? (
        <TaskTableView
          rows={visible}
          total={rows.length}
          closedCount={counts.closed}
          todoCount={counts.todo}
          counts={counts.byReadiness}
          filter={filter}
          query={query}
          axes={axes}
          contents={contents}
          templates={templates}
          catalogs={catalogs}
          cellErrors={cellErrors}
          columnSet={columnSet}
          busyId={busyId}
          savedAt={savedAt}
          editable={editable}
          onColumnSet={setColumnSet}
          onFilter={setFilter}
          onQuery={setQuery}
          onPatch={requestPatch}
          onOpen={(id) => {
            setPickedTaskId(id);
            setMode("DETAIL");
            syncUrl({ task: id, view: "DETAIL" });
          }}
          onMarkDone={markDone}
          onReopen={reopen}
          onStop={openStop}
        />
      ) : null}

      {tasks.length && mode === "DETAIL" ? (
        <div className="grid gap-4 xl:grid-cols-[19rem_minmax(0,1fr)_17rem]">
          <TaskQueue
            rows={visible}
            total={rows.length}
            closedCount={counts.closed}
            todoCount={counts.todo}
            readyCount={counts.byReadiness.READY}
            selectedId={selected?.task._id ?? null}
            filter={filter}
            query={query}
            counts={counts.byReadiness}
            axes={axes}
            onFilter={setFilter}
            onQuery={setQuery}
            onPick={pickTask}
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
              position={
                selectedIndex >= 0
                  ? { index: selectedIndex + 1, total: visible.length }
                  : null
              }
              onPrev={prevRow ? () => pickTask(prevRow.task._id) : null}
              onNext={nextRow ? () => pickTask(nextRow.task._id) : null}
              nextTodo={nextTodo?.task ?? null}
              onGoTo={pickTask}
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
              onPatch={requestPatch}
              onMarkDone={markDone}
              onReopen={reopen}
              onStop={openStop}
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
            axisScores={data?.axisScores ?? []}
          />
        </div>
      ) : null}

      {/* Dừng giữa chừng thì phải nói vì sao - "đã xong" thì không hỏi gì. */}
      <Dialog
        open={!!stopping}
        onOpenChange={(open) => {
          if (!open) setStopping(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <form
            onSubmit={(event) => void confirmStop(event)}
            className="space-y-4"
          >
            <DialogHeader>
              <DialogTitle>Dừng nhiệm vụ giữa chừng</DialogTitle>
              <DialogDescription className="break-words">
                {stopping?.name}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-1.5">
              <Label htmlFor="stop-reason">
                Lý do dừng <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="stop-reason"
                autoFocus
                value={stopReason}
                aria-invalid={stopReasonError || undefined}
                aria-describedby="stop-reason-hint"
                onChange={(event) => {
                  setStopReason(event.target.value);
                  if (stopReasonError) setStopReasonError(false);
                }}
                rows={3}
                placeholder="Vì sao việc này thôi không làm nữa…"
                className="aria-[invalid]:border-destructive"
              />
              <p
                id="stop-reason-hint"
                className={cn(
                  "text-xs",
                  stopReasonError ? "text-destructive" : "text-muted-foreground",
                )}
              >
                {stopReasonError
                  ? "Nêu lý do dừng để cấp trên biết vì sao việc này thôi làm."
                  : "Cấp trên đọc được lý do này trong báo cáo ngày."}
              </p>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setStopping(null)}
              >
                Huỷ
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={!!stopping && busyId === stopping._id}
              >
                {stopping && busyId === stopping._id ? (
                  <Loader2
                    className="size-4 motion-safe:animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <Ban className="size-4" aria-hidden="true" />
                )}
                Dừng nhiệm vụ
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Đổi trục trên dòng đã điền: nói rõ cái gì sẽ mất trước khi làm. */}
      <Dialog
        open={!!axisChange}
        onOpenChange={(open) => {
          if (!open) setAxisChange(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Đổi trục cho nhiệm vụ này?</DialogTitle>
            <DialogDescription className="break-words">
              &ldquo;{axisChange?.task.name}&rdquo; đang ở trục{" "}
              <strong className="text-foreground">
                {axes.find(
                  (item) => item._id === refId(axisChange?.task.axisId ?? null),
                )?.name ?? "hiện tại"}
              </strong>
              . Chuyển sang{" "}
              <strong className="text-foreground">
                {axisChange?.axisId
                  ? (axes.find((item) => item._id === axisChange.axisId)
                      ?.name ?? "trục mới")
                  : "Chưa gán"}
              </strong>{" "}
              sẽ xoá nội dung công việc và mọi ô đã điền theo mẫu cũ, kể cả điểm
              cấp trên đã chấm lại. Không hoàn tác được.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setAxisChange(null)}
            >
              Giữ trục cũ
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={confirmAxisChange}
            >
              Đổi trục và xoá dữ liệu
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
  todoCount: number;
  readyCount: number;
  selectedId: string | null;
  filter: QueueFilter;
  query: string;
  counts: Record<TaskReadiness, number>;
  axes: TeamReportAxis[];
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
  todoCount,
  readyCount,
  selectedId,
  filter,
  query,
  counts,
  axes,
  onFilter,
  onQuery,
  onPick,
}: TaskQueueProps) {
  const percent = total ? Math.round((readyCount / total) * 100) : 0;

  return (
    <Card className="shadow-sm xl:sticky xl:top-4 xl:self-start">
      <CardContent className="space-y-3 py-4">
        {/*
          Tiến độ đứng đầu hàng đợi: câu người phân loại hỏi liên tục là "còn
          bao nhiêu nữa", trả lời bằng một thanh là đọc được trong một liếc.
        */}
        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="font-display text-sm font-semibold">
              Hàng đợi nhiệm vụ
            </h2>
            <span className="text-xs text-muted-foreground tabular-nums">
              {readyCount}/{total} sẵn sàng
            </span>
          </div>
          <div
            role="progressbar"
            aria-label="Tiến độ phân loại"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={readyCount}
            className="h-1.5 overflow-hidden rounded-full bg-muted"
          >
            <div
              className="h-full rounded-full bg-emerald-500 transition-[width] motion-reduce:transition-none"
              style={{ width: `${percent}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {todoCount
              ? `Còn ${todoCount} nhiệm vụ cần xử lý`
              : "Không còn nhiệm vụ nào cần xử lý"}
            {rows.length !== total
              ? ` · đang xem ${rows.length}/${total}`
              : ""}
          </p>
        </div>

        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            name="q"
            aria-label="Tìm nhiệm vụ"
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder="Tìm theo tên hoặc sản phẩm…"
            className="pl-8"
          />
        </div>

        {/* Cột hẹp: năm sáu nút lọc xếp chồng ba hàng thì rối hơn một ô chọn. */}
        <Select
          value={filter}
          onValueChange={(value) => onFilter(value as QueueFilter)}
        >
          <SelectTrigger aria-label="Lọc theo trạng thái" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {QUEUE_FILTERS.map((value) => (
              <SelectItem key={value} value={value}>
                {filterLabel(value, counts, total, todoCount, closedCount)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/*
          Khoá theo bộ lọc để React DỰNG LẠI danh sách: số dòng đang bày là state
          cục bộ, đổi bộ lọc mà giữ nguyên state thì lần lọc mới mở ra giữa
          chừng. Dựng lại rẻ hơn và không cần effect đồng bộ.
        */}
        <QueueList
          key={`${filter}:${query.trim().toLowerCase()}`}
          rows={rows}
          axes={axes}
          selectedId={selectedId}
          onPick={onPick}
        />

        <p className="hidden text-xs text-muted-foreground xl:block">
          <kbd className="rounded border bg-background px-1 font-sans">J</kbd>{" "}
          /{" "}
          <kbd className="rounded border bg-background px-1 font-sans">K</kbd>{" "}
          để sang nhiệm vụ sau / trước
        </p>
      </CardContent>
    </Card>
  );
}

/**
 * Danh sách nhiệm vụ, bày dần từng mẻ.
 *
 * Một ngày của đội lớn có thể lên tới hàng trăm nhiệm vụ. Dựng hết một lượt thì
 * mỗi lần bảng tự nạp lại là ngần ấy nút phải so lại - gõ vào ô tìm kiếm bắt
 * đầu giật. Bày `QUEUE_PAGE` dòng đầu là đủ cho thao tác thường ngày; ai cần
 * xem sâu hơn thì bấm tải thêm.
 */
function QueueList({
  rows,
  axes,
  selectedId,
  onPick,
}: {
  rows: QueueRow[];
  axes: TeamReportAxis[];
  selectedId: string | null;
  onPick: (id: string) => void;
}) {
  const [more, setMore] = useState(QUEUE_PAGE);
  /* Nhảy bằng Tiếp / J tới một dòng nằm ngoài mẻ đang bày thì mở rộng mẻ cho
     tới dòng đó - không thì dòng đang mở lại không thấy đâu trong hàng đợi. */
  const selectedIndex = rows.findIndex((row) => row.task._id === selectedId);
  const shown = Math.max(more, selectedIndex + 1);
  const rest = rows.length - shown;
  const listRef = useRef<HTMLDivElement>(null);
  const axisName = useMemo(
    () => new Map(axes.map((axis) => [axis._id, axis.name] as const)),
    [axes],
  );

  // Giữ dòng đang mở trong tầm nhìn của hàng đợi khi đi bằng Tiếp / Trước.
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>("[aria-current='true']")
      ?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  return (
    <div
      ref={listRef}
      className="max-h-[32rem] space-y-1.5 overflow-y-auto overscroll-contain"
    >
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Không có nhiệm vụ nào khớp.
        </p>
      ) : null}

      {rows.slice(0, shown).map(({ task, readiness }) => {
        const active = task._id === selectedId;
        const axis = axisName.get(refId(task.axisId) ?? "");
        return (
          <button
            key={task._id}
            type="button"
            aria-current={active ? "true" : undefined}
            onClick={() => onPick(task._id)}
            className={cn(
              /* Góc VUÔNG, mục đang chọn có cạnh trái xanh dày 3px - vạch thẳng
                 đứng trên góc vuông, không cong theo bo góc. */
              "w-full cursor-pointer rounded-none border p-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              active
                ? "border-l-[3px] border-l-primary bg-primary/5"
                : "hover:bg-muted/50",
            )}
          >
            <div
              className={cn(
                "line-clamp-2 break-words text-sm font-medium",
                !task.isOpen && "text-muted-foreground",
              )}
            >
              {task.name}
            </div>
            {/* Trục đã gán hiện ngay trên hàng đợi: rà cả ngày xem có dòng
                nào gán nhầm trục mà không phải mở từng cái. */}
            <div className="mt-0.5 truncate text-xs text-muted-foreground">
              {axis ?? "Chưa gán trục"}
              {task.deadline ? ` · hạn ${formatYmd(task.deadline)}` : ""}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Badge
                variant="secondary"
                className={cn(
                  "whitespace-nowrap font-normal",
                  READINESS_CLASS[readiness],
                )}
              >
                {READINESS_LABEL[readiness]}
              </Badge>
              {task.isOpen ? null : (
                <Badge
                  variant="secondary"
                  className={cn(
                    "gap-1 whitespace-nowrap font-normal",
                    task.closedReason
                      ? CLOSED_STOPPED_CLASS
                      : CLOSED_DONE_CLASS,
                  )}
                >
                  {task.closedReason ? (
                    <Ban className="size-3" aria-hidden="true" />
                  ) : (
                    <Check className="size-3" aria-hidden="true" />
                  )}
                  {task.closedReason ? "Đã dừng" : "Đã xong"}
                </Badge>
              )}
            </div>
          </button>
        );
      })}

      {rest > 0 ? (
        <Button
          type="button"
          variant="ghost"
          className="w-full"
          onClick={() => setMore(shown + QUEUE_PAGE)}
        >
          Xem thêm {Math.min(rest, QUEUE_PAGE)} nhiệm vụ (còn {rest})
        </Button>
      ) : null}
    </div>
  );
}

// ============================================================ dạng bảng

type TaskTableProps = {
  rows: QueueRow[];
  total: number;
  closedCount: number;
  todoCount: number;
  counts: Record<TaskReadiness, number>;
  filter: QueueFilter;
  query: string;
  axes: TeamReportAxis[];
  contents: TeamReportWorkContent[];
  templates: Record<string, TeamReportTemplate | null>;
  catalogs: TeamReportCatalogs;
  cellErrors: Record<string, string>;
  columnSet: string;
  busyId: string | null;
  savedAt: string | null;
  editable: boolean;
  onColumnSet: (next: string) => void;
  onFilter: (next: QueueFilter) => void;
  onQuery: (next: string) => void;
  onPatch: (task: TeamReportTask, input: TeamReportClassifyInput) => void;
  onOpen: (taskId: string) => void;
  onMarkDone: (task: TeamReportTask) => void;
  onReopen: (task: TeamReportTask) => void;
  onStop: (task: TeamReportTask) => void;
};

/**
 * Cả ngày trên một bảng, sửa ngay tại ô.
 *
 * Vẫn TỰ LƯU từng ô như dạng nhiệm vụ, không có nút "Lưu thay đổi": gom lại một
 * nút lưu chung nghĩa là phải giữ bản nháp của mấy chục dòng trong màn hình, mà
 * cả đội gõ chung một bảng nên bản nháp đó lỗi thời ngay khi người bên cạnh sửa
 * một dòng - lưu một lượt là đè mất phần của họ.
 *
 * Gửi vẫn theo NGÀY, một lượt cho cả bảng: dạng bảng chỉ đổi cách nhìn, không
 * đổi luật gửi.
 */
function TaskTableView({
  rows,
  total,
  closedCount,
  todoCount,
  counts,
  filter,
  query,
  axes,
  contents,
  templates,
  catalogs,
  cellErrors,
  columnSet,
  busyId,
  savedAt,
  editable,
  onColumnSet,
  onFilter,
  onQuery,
  onPatch,
  onOpen,
  onMarkDone,
  onReopen,
  onStop,
}: TaskTableProps) {
  const axis = axes.find((item) => item._id === columnSet) ?? null;

  /* Chọn một trục thì bảng chỉ còn các dòng của trục đó - bày cột chuyên biệt
     của trục này lên những dòng thuộc trục khác là bày một hàng ô vô nghĩa. */
  const shown = useMemo(
    () =>
      axis ? rows.filter((row) => refId(row.task.axisId) === axis._id) : rows,
    [rows, axis],
  );

  /**
   * Bộ cột của thân bảng.
   *
   * Chế độ "mọi cột" GỘP cột của các mẫu đang có mặt trong bảng, trùng khoá thì
   * nhập làm một. Nhờ vậy điền được tất cả ngay trên bảng mà không phải lọc theo
   * trục trước - và vì nhiều trục dùng chung một mẫu nên bảng không rộng như
   * tưởng. Ô nào không thuộc mẫu của chính dòng đó thì để gạch ngang.
   *
   * Gộp theo mẫu ĐANG CÓ MẶT chứ không gộp hết mọi mẫu trên hệ thống: gộp hết
   * thì lọc còn vài dòng mà bảng vẫn rộng bằng cả bốn trục cộng lại.
   *
   * Bỏ cột "Nội dung công việc" của mẫu vì bảng đã có một cột cứng cho nó - cùng
   * một thứ hiện hai lần trên một hàng là không biết điền ô nào.
   */
  const extraColumns = useMemo(() => {
    if (columnSet === COMPACT_COLUMNS) return [];

    const sources = axis
      ? [templates[axis._id] ?? null]
      : axes
          .filter((item) =>
            shown.some((row) => refId(row.task.axisId) === item._id),
          )
          .map((item) => templates[item._id] ?? null);

    const seen = new Set<string>();
    const merged: TeamReportColumn[] = [];
    for (const source of sources) {
      for (const column of inputColumns(source)) {
        if (column.semanticKey === "work_content") continue;
        if (seen.has(column.key)) continue;
        seen.add(column.key);
        merged.push(column);
      }
    }
    return merged;
  }, [columnSet, axis, axes, templates, shown]);

  return (
    <Card className="shadow-sm">
      <CardContent className="space-y-4 py-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1">
            <h2 className="font-display text-sm font-semibold">
              Bảng nhiệm vụ theo hàng
            </h2>
            <p className="text-xs text-muted-foreground">
              {axis
                ? `${shown.length} nhiệm vụ thuộc ${axis.name} · đang bày trọn mẫu của trục này`
                : columnSet === COMPACT_COLUMNS
                  ? "Chỉ trục và nội dung công việc · để rà nhanh dòng nào chưa gán"
                  : `Gộp cột của mọi mẫu đang có trong bảng. Ô ghi “Không áp dụng” là cột không thuộc mẫu của dòng đó.`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span
              aria-live="polite"
              className="flex items-center gap-1.5 text-xs text-muted-foreground"
            >
              {busyId ? (
                <>
                  <Loader2
                    className="size-3 motion-safe:animate-spin"
                    aria-hidden="true"
                  />
                  Đang lưu…
                </>
              ) : savedAt ? (
                <>
                  <Check
                    className="size-3 text-emerald-600 dark:text-emerald-400"
                    aria-hidden="true"
                  />
                  Đã lưu lúc {savedAt}
                </>
              ) : null}
            </span>
            <div className="space-y-1">
              <p
                id="column-set-label"
                className="text-xs text-muted-foreground"
              >
                Bộ cột đang hiện
              </p>
              <Select value={columnSet} onValueChange={onColumnSet}>
                <SelectTrigger
                  aria-labelledby="column-set-label"
                  className="w-56"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_COLUMNS}>Tất cả · mọi cột</SelectItem>
                  <SelectItem value={COMPACT_COLUMNS}>
                    Tất cả · rút gọn
                  </SelectItem>
                  {axes.map((item) => (
                    <SelectItem key={item._id} value={item._id}>
                      {item.name}
                      {templates[item._id] ? "" : " (chưa có mẫu)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              name="q"
              aria-label="Tìm nhiệm vụ"
              autoComplete="off"
              spellCheck={false}
              value={query}
              onChange={(event) => onQuery(event.target.value)}
              placeholder="Tìm theo tên hoặc sản phẩm…"
              className="pl-8"
            />
          </div>
          <SegmentedTabs
            ariaLabel="Lọc theo trạng thái"
            value={filter}
            onChange={onFilter}
            items={QUEUE_FILTERS.map((value) => ({
              value,
              label: filterLabel(value, counts, total, todoCount, closedCount),
            }))}
            className="flex-wrap"
          />
        </div>

        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                {/*
                  Cột để RỘNG và cho cuộn ngang, không bóp cho vừa màn hình:
                  bóp lại thì nhãn trạng thái gãy làm ba dòng và mỗi hàng cao gấp
                  đôi, cả bảng đọc còn mệt hơn là kéo ngang.
                */}
                <TableHead
                  className={cn(
                    "min-w-[280px]",
                    STICKY_HEAD,
                    "left-0 border-r",
                  )}
                >
                  Nhiệm vụ
                </TableHead>
                <TableHead className="min-w-[180px]">Trục</TableHead>
                <TableHead className="min-w-[240px]">
                  Nội dung công việc
                </TableHead>
                {extraColumns.map((column) => (
                  <TableHead
                    key={column.key}
                    className="whitespace-nowrap"
                    style={{ minWidth: Math.max(190, column.width) }}
                  >
                    {column.title}
                  </TableHead>
                ))}
                <TableHead className="min-w-[150px] whitespace-nowrap">
                  Trạng thái
                </TableHead>
                <TableHead
                  className={cn(
                    "min-w-[190px] whitespace-nowrap text-right",
                    STICKY_HEAD,
                    "right-0 border-l",
                  )}
                >
                  Thao tác
                </TableHead>
              </TableRow>
            </TableHeader>
            {/* Khoá theo bộ lọc để dựng lại thân bảng: số hàng đang bày là
                state cục bộ, đổi bộ lọc mà giữ nguyên thì lần lọc mới mở ra
                giữa chừng. */}
            <TaskTableBody
              key={`${columnSet}:${filter}:${query.trim().toLowerCase()}`}
              rows={shown}
              columns={extraColumns}
              axes={axes}
              contents={contents}
              catalogs={catalogs}
              cellErrors={cellErrors}
              busyId={busyId}
              editable={editable}
              onPatch={onPatch}
              onOpen={onOpen}
              onMarkDone={onMarkDone}
              onReopen={onReopen}
              onStop={onStop}
            />
          </Table>
        </div>

        <p className="flex items-start gap-2 rounded-md border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          <span>
            Mỗi ô tự lưu ngay khi chọn hoặc rời ô - không có nút lưu chung.
            {axis || columnSet === ALL_COLUMNS
              ? " Bấm Mở để xem trọn biểu mẫu của một nhiệm vụ."
              : " Chọn “Tất cả · mọi cột” hoặc một trục ở ô Bộ cột để chấm ngay trên bảng."}
          </span>
        </p>
      </CardContent>
    </Card>
  );
}

/**
 * Thân bảng, bày dần từng mẻ.
 *
 * Mỗi hàng mang vài ô chọn của Radix - dựng hết một lượt cho một ngày vài trăm
 * nhiệm vụ thì mỗi lần bảng tự nạp lại là ngần ấy ô phải so lại, gõ vào ô tìm
 * kiếm bắt đầu giật. Nặng hơn hàng đợi bên dạng nhiệm vụ nhiều, nên phải bày
 * dần y như vậy.
 */
function TaskTableBody({
  rows,
  columns,
  axes,
  contents,
  catalogs,
  cellErrors,
  busyId,
  editable,
  onPatch,
  onOpen,
  onMarkDone,
  onReopen,
  onStop,
}: {
  rows: QueueRow[];
  columns: TeamReportColumn[];
  axes: TeamReportAxis[];
  contents: TeamReportWorkContent[];
  catalogs: TeamReportCatalogs;
  cellErrors: Record<string, string>;
  busyId: string | null;
  editable: boolean;
  onPatch: (task: TeamReportTask, input: TeamReportClassifyInput) => void;
  onOpen: (taskId: string) => void;
  onMarkDone: (task: TeamReportTask) => void;
  onReopen: (task: TeamReportTask) => void;
  onStop: (task: TeamReportTask) => void;
}) {
  const [shown, setShown] = useState(QUEUE_PAGE);
  const rest = rows.length - shown;
  const span = 5 + columns.length;

  return (
    <TableBody>
      {rows.length === 0 ? (
        <TableRow>
          <TableCell
            colSpan={span}
            className="h-28 text-center text-muted-foreground"
          >
            Không có nhiệm vụ nào khớp.
          </TableCell>
        </TableRow>
      ) : null}

      {rows.slice(0, shown).map((row) => (
        <TaskTableRow
          key={`${row.task._id}:${row.task.version}`}
          row={row}
          axes={axes}
          contents={contents}
          catalogs={catalogs}
          cellErrors={cellErrors}
          columns={columns}
          busy={busyId === row.task._id}
          editable={editable}
          onPatch={onPatch}
          onOpen={onOpen}
          onMarkDone={onMarkDone}
          onReopen={onReopen}
          onStop={onStop}
        />
      ))}

      {rest > 0 ? (
        <TableRow>
          <TableCell colSpan={span} className="p-0">
            <Button
              type="button"
              variant="ghost"
              className="w-full rounded-none"
              onClick={() => setShown((current) => current + QUEUE_PAGE)}
            >
              Xem thêm {Math.min(rest, QUEUE_PAGE)} nhiệm vụ (còn {rest})
            </Button>
          </TableCell>
        </TableRow>
      ) : null}
    </TableBody>
  );
}

/**
 * Một hàng của dạng bảng.
 *
 * Ghép `version` vào khoá ở chỗ gọi để React dựng lại hàng khi dữ liệu thật sự
 * đổi - ô nhập giữ bản nháp cục bộ nên không tự nhận giá trị mới theo props.
 */
function TaskTableRow({
  row,
  axes,
  contents,
  catalogs,
  cellErrors,
  columns,
  busy,
  editable,
  onPatch,
  onOpen,
  onMarkDone,
  onReopen,
  onStop,
}: {
  row: QueueRow;
  axes: TeamReportAxis[];
  contents: TeamReportWorkContent[];
  catalogs: TeamReportCatalogs;
  cellErrors: Record<string, string>;
  columns: TeamReportColumn[];
  busy: boolean;
  editable: boolean;
  onPatch: (task: TeamReportTask, input: TeamReportClassifyInput) => void;
  onOpen: (taskId: string) => void;
  onMarkDone: (task: TeamReportTask) => void;
  onReopen: (task: TeamReportTask) => void;
  onStop: (task: TeamReportTask) => void;
}) {
  const { task, readiness } = row;
  const axisId = refId(task.axisId);
  const contentId = refId(task.workContentId);
  /* Việc đã chốt thì khoá y như bên dạng nhiệm vụ - một luật, hai chỗ nhìn. */
  const disabled = !editable || busy || !task.isOpen;
  /* Riêng nút đóng/mở lại KHÔNG theo `isOpen`, không thì việc đã đóng không còn
     đường nào mở ra. */
  const lifecycleDisabled = !editable || busy;

  /* Cột của CHÍNH mẫu dòng này, tra theo khoá. Đầu bảng là bộ cột đã gộp của
     nhiều mẫu nên khoá nào không có ở đây thì dòng này để trống. */
  const ownColumns = useMemo(
    () =>
      new Map(inputColumns(row.template).map((column) => [column.key, column])),
    [row.template],
  );

  const contentOptions = contents.filter(
    (content) => content.axisId === axisId,
  );
  const scopedCatalogs = narrowCatalogs(catalogs, {
    axisId,
    workContentId: contentId,
  });

  return (
    <TableRow className="group">
      <TableCell
        className={cn(
          "max-w-[360px] whitespace-normal break-words align-middle",
          STICKY_CELL,
          "left-0 border-r",
        )}
      >
        {/* Việc đã đóng chỉ mờ chữ, không mờ cả hàng: `opacity` kéo luôn
            nhãn trạng thái xuống, nền tối đọc không ra. */}
        <div
          className={cn("font-medium", !task.isOpen && "text-muted-foreground")}
        >
          {task.name}
        </div>
        <div className="text-xs text-muted-foreground tabular-nums">
          {task.deadline ? `Hạn ${formatYmd(task.deadline)}` : "Không đặt hạn"}
          {task.product ? ` · ${task.product}` : ""}
        </div>
      </TableCell>

      <TableCell className="align-middle">
        <Select
          value={axisId || "__none__"}
          disabled={disabled}
          onValueChange={(value) =>
            onPatch(task, {
              version: task.version,
              axisId: value === "__none__" ? null : value,
            })
          }
        >
          <SelectTrigger
            aria-label={`Trục của nhiệm vụ ${task.name}`}
            className="w-full"
          >
            <SelectValue placeholder="Chưa gán" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">Chưa gán</SelectItem>
            {axes.map((item) => (
              <SelectItem key={item._id} value={item._id}>
                {item.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>

      <TableCell className="align-middle">
        <Select
          value={contentId || "__none__"}
          disabled={disabled || !axisId}
          onValueChange={(value) =>
            onPatch(task, {
              version: task.version,
              workContentId: value === "__none__" ? null : value,
            })
          }
        >
          <SelectTrigger
            aria-label={`Nội dung công việc của nhiệm vụ ${task.name}`}
            className="w-full"
          >
            <SelectValue placeholder={axisId ? "Chọn" : "Chọn trục trước"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">Chưa chọn</SelectItem>
            {contentOptions.map((content) => (
              <SelectItem key={content._id} value={content._id}>
                {content.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>

      {columns.map((merged) => {
        /*
          Cột trên đầu bảng là bộ ĐÃ GỘP của nhiều mẫu, nên phải tra lại theo mẫu
          của chính dòng này: cùng một khoá ở mẫu khác có thể khác kiểu dữ liệu
          hay khác danh mục, dựng ô theo định nghĩa của mẫu khác là ô sai kiểu và
          server chặn ngay khi lưu.
        */
        const column = ownColumns.get(merged.key);
        if (!column) {
          return (
            <TableCell
              key={merged.key}
              className="bg-muted/30 align-middle text-xs italic text-muted-foreground"
            >
              {/* Nói rõ vì sao trống NGAY TRONG Ô, không giấu vào `title`: một
                  dấu gạch không phân biệt được "chưa điền" với "không có cột". */}
              {axisId ? "Không áp dụng" : "Chọn trục trước"}
            </TableCell>
          );
        }

        const catalog = catalogOfColumn(column);
        const value = catalog
          ? (finalCatalogValue(task, column.key)?.id ?? "")
          : String(finalFieldValue(task, column.key) ?? "");
        const error = cellErrors[cellErrorKey(task, column.key)];

        return (
          <TableCell key={merged.key} className="align-middle">
            <DynamicColumnCell
              column={column}
              value={value}
              catalogs={scopedCatalogs}
              invalid={!!error}
              disabled={disabled}
              evidence={task.evidence}
              onEvidenceChange={(items) =>
                onPatch(task, { version: task.version, evidence: items })
              }
              onCommit={(next) =>
                onPatch(task, {
                  version: task.version,
                  ...(catalog
                    ? { catalogValues: { [column.key]: next } }
                    : { fieldValues: { [column.key]: next } }),
                })
              }
            />
            {/* Bảng ngang chật, nên chỉ một dòng ngắn dưới ô - viền đỏ đã chỉ
                đúng chỗ rồi, chi tiết đọc ở dạng nhiệm vụ. */}
            {error ? (
              <p className="mt-1 text-xs text-destructive">{error}</p>
            ) : null}
          </TableCell>
        );
      })}

      <TableCell className="align-middle">
        <div className="flex flex-col items-start gap-1">
          {/* `whitespace-nowrap`: nhãn dài như "Chưa phân loại" mà cho xuống
              dòng thì gãy làm ba và hàng cao gấp đôi. */}
          <Badge
            variant="secondary"
            className={cn(
              "whitespace-nowrap font-normal",
              READINESS_CLASS[readiness],
            )}
          >
            {READINESS_LABEL[readiness]}
          </Badge>
          {task.isOpen ? null : (
            <Badge
              variant="secondary"
              className={cn(
                "gap-1 whitespace-nowrap font-normal",
                task.closedReason ? CLOSED_STOPPED_CLASS : CLOSED_DONE_CLASS,
              )}
            >
              {task.closedReason ? (
                <Ban className="size-3" aria-hidden="true" />
              ) : (
                <Check className="size-3" aria-hidden="true" />
              )}
              {task.closedReason ? "Đã dừng" : "Đã xong"}
            </Badge>
          )}
        </div>
      </TableCell>

      <TableCell
        className={cn(
          "text-right align-middle",
          STICKY_CELL,
          "right-0 border-l",
        )}
      >
        {/*
          Đóng / mở lại cũng phải làm được ngay trên bảng - dạng bảng là để rà
          cả ngày, mà cứ phải bấm Mở vào từng dòng chỉ để đánh dấu xong thì đúng
          cái việc dạng bảng sinh ra để tránh.

          Dùng nút biểu tượng kèm `title` như bảng nhập ngày: ba nút có chữ đầy
          đủ thì riêng cột thao tác đã rộng hơn cả cột nhiệm vụ.
        */}
        <div className="inline-flex items-center gap-1">
          {task.isOpen ? (
            <>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label="Dừng giữa chừng"
                title="Dừng giữa chừng - phải nêu lý do"
                className="text-destructive hover:text-destructive"
                disabled={lifecycleDisabled}
                onClick={() => onStop(task)}
              >
                <Ban className="size-4" aria-hidden="true" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label="Đánh dấu đã xong"
                title="Đánh dấu đã xong - từ mai không hiện lại"
                disabled={lifecycleDisabled}
                onClick={() => onMarkDone(task)}
              >
                <CheckCheck className="size-4" aria-hidden="true" />
              </Button>
            </>
          ) : (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="Mở lại nhiệm vụ"
              title="Mở lại để sửa tiếp"
              disabled={lifecycleDisabled}
              onClick={() => onReopen(task)}
            >
              <Undo2 className="size-4" aria-hidden="true" />
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            aria-label={`Mở biểu mẫu của nhiệm vụ ${task.name}`}
            onClick={() => onOpen(task._id)}
          >
            Mở
            <ChevronRight className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
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
  /** Vị trí trong danh sách đang lọc; null = nhiệm vụ đang mở nằm ngoài bộ lọc. */
  position: { index: number; total: number } | null;
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
  /** Nhiệm vụ còn phải làm kế tiếp - null khi đã hết việc. */
  nextTodo: TeamReportTask | null;
  onGoTo: (taskId: string) => void;
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
  position,
  onPrev,
  onNext,
  nextTodo,
  onGoTo,
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

  const done = task.isOpen && readiness === "READY";

  return (
    <Card className="shadow-sm">
      <CardContent className="space-y-5 py-4">
        {/*
          Thanh đi lần lượt: người phân loại làm hết việc này sang việc khác,
          quay sang hàng đợi bên trái mỗi lần là phải rời mắt khỏi biểu mẫu.
        */}
        <div className="flex items-center justify-between gap-2 border-b pb-3">
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={!onPrev}
              onClick={onPrev ?? undefined}
              aria-keyshortcuts="K"
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
              Trước
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={!onNext}
              onClick={onNext ?? undefined}
              aria-keyshortcuts="J"
            >
              Sau
              <ChevronRight className="size-4" aria-hidden="true" />
            </Button>
            {position ? (
              <span className="ml-1 text-xs text-muted-foreground tabular-nums">
                {position.index}/{position.total}
              </span>
            ) : null}
          </div>

          {/* Tự lưu nên phải nói rõ đã lưu chưa - không có nút Lưu nào cả. */}
          <span
            aria-live="polite"
            className="flex items-center gap-1.5 text-xs text-muted-foreground"
          >
            {saving ? (
              <>
                <Loader2
                  className="size-3 motion-safe:animate-spin"
                  aria-hidden="true"
                />
                Đang lưu…
              </>
            ) : savedAt ? (
              <>
                <Check
                  className="size-3 text-emerald-600 dark:text-emerald-400"
                  aria-hidden="true"
                />
                Đã lưu lúc {savedAt}
              </>
            ) : null}
          </span>
        </div>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <ClipboardList className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 space-y-1">
              <h2 className="text-pretty break-words font-display text-lg font-semibold">
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
        {done ? (
          <NextTodoBanner nextTodo={nextTodo} onGoTo={onGoTo} />
        ) : task.isOpen ? (
          <div className="flex items-start gap-2 rounded-md border bg-muted/40 px-3 py-2.5 text-sm">
            <Info
              className="mt-0.5 size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
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
            <h3
              id={`axis-heading-${task._id}`}
              className="font-display text-sm font-semibold"
            >
              1. Chọn trục áp dụng
            </h3>
            <span className="text-xs font-medium text-destructive">
              Bắt buộc
            </span>
          </div>

          <div
            role="radiogroup"
            aria-labelledby={`axis-heading-${task._id}`}
            className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3"
          >
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
                  <TriangleAlert className="size-3" aria-hidden="true" />
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
                    <SelectTrigger
                      aria-label="Nội dung công việc"
                      className="w-full"
                    >
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
                      evidence={task.evidence}
                      onEvidenceChange={(items) =>
                        onPatch(task, {
                          version: task.version,
                          evidence: items,
                        })
                      }
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

        {/* Nhắc lại ở CUỐI biểu mẫu: ô cuối vừa điền xong là mắt người ta đang
            ở dưới này, banner trên đầu đã trôi khỏi màn hình. */}
        {done ? (
          <NextTodoBanner nextTodo={nextTodo} onGoTo={onGoTo} compact />
        ) : null}
      </CardContent>
    </Card>
  );
}

/**
 * Nhiệm vụ vừa đủ ô - chỉ luôn sang việc kế tiếp.
 *
 * Không tự nhảy: ô tự lưu khi rời ô, tự chuyển ngay sau lượt lưu cuối là kéo
 * mất biểu mẫu khỏi tay người đang định sửa lại một con số.
 */
function NextTodoBanner({
  nextTodo,
  onGoTo,
  compact,
}: {
  nextTodo: TeamReportTask | null;
  onGoTo: (taskId: string) => void;
  compact?: boolean;
}) {
  return (
    <div
      role="status"
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100",
        compact && "py-2",
      )}
    >
      <span className="flex min-w-0 items-center gap-2">
        {nextTodo ? (
          <CircleCheck
            className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
            aria-hidden="true"
          />
        ) : (
          <PartyPopper
            className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
            aria-hidden="true"
          />
        )}
        <span className="min-w-0">
          {nextTodo
            ? "Đã đủ - nhiệm vụ này sẵn sàng đi trong báo cáo."
            : "Đã đủ. Không còn nhiệm vụ nào cần xử lý trong ngày."}
        </span>
      </span>
      {nextTodo ? (
        <Button
          type="button"
          size="sm"
          onClick={() => onGoTo(nextTodo._id)}
          className="max-w-full active:scale-[0.98] motion-reduce:active:scale-100 sm:max-w-xs"
        >
          <span className="min-w-0 truncate">Tiếp: {nextTodo.name}</span>
          <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
        </Button>
      ) : null}
    </div>
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
    /* Dừng giữa chừng KHÔNG mang màu xanh của "đã xong" - cùng luật với
       `CLOSED_STOPPED_CLASS`: tô xanh việc bỏ dở là đọc lướt tưởng đã làm. */
    const stopped = !!task.closedReason;
    return (
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-2.5 text-sm",
          stopped
            ? "border-rose-300 bg-rose-50 dark:border-rose-900 dark:bg-rose-950/40"
            : "border-emerald-300 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40",
        )}
      >
        <span className="flex min-w-0 items-start gap-2">
          {stopped ? (
            <Ban
              className="mt-0.5 size-4 shrink-0 text-rose-600 dark:text-rose-400"
              aria-hidden="true"
            />
          ) : (
            <CheckCheck
              className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
              aria-hidden="true"
            />
          )}
          <span className="min-w-0 break-words">
            {task.closedReason
              ? `Đã dừng giữa chừng: ${task.closedReason}`
              : "Đã đánh dấu hoàn thành."}{" "}
            <span className="text-muted-foreground">
              Đã rời bảng nhập ngày, vẫn đi trong báo cáo hôm nay. Biểu mẫu bên
              dưới khoá lại - bấm Mở lại nếu cần sửa hoặc cho nó hiện lại ở bảng
              nhập.
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
          <Undo2 className="size-4" aria-hidden="true" />
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
          <Ban className="size-4" aria-hidden="true" />
          Dừng giữa chừng…
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => onMarkDone(task)}
        >
          <CheckCheck className="size-4" aria-hidden="true" />
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
  /*
    Ô bên trong có thể là ô chữ, ô chọn của Radix hay cả khối đính kèm tệp -
    không có một `id` chung để `<label htmlFor>` trỏ vào. Gom thành một nhóm
    có tên thì trình đọc màn hình vẫn đọc được ô này là ô gì.
  */
  const labelId = useId();
  return (
    <div
      role="group"
      aria-labelledby={labelId}
      className={cn("space-y-1.5", wide && "sm:col-span-2")}
    >
      <p id={labelId} className="block text-sm font-medium">
        {label}
        {required ? (
          <span className="text-destructive" aria-label="bắt buộc">
            {" "}
            *
          </span>
        ) : null}
      </p>
      {children}
      {/* Lỗi đứng trên gợi ý: đang có cái phải sửa thì đó là thứ cần đọc trước. */}
      {error ? (
        <p role="alert" className="flex items-start gap-1.5 text-xs text-destructive">
          <TriangleAlert className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
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
      role="radio"
      aria-checked={active}
      disabled={disabled}
      // Bấm lại trục đang chọn thì thôi - khỏi một lượt lưu vô ích.
      onClick={active ? undefined : onPick}
      className={cn(
        "cursor-pointer rounded-md border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed",
        active
          ? "border-primary bg-primary/5"
          : "hover:bg-muted/60 disabled:opacity-60 disabled:hover:bg-transparent",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="break-words text-sm font-medium">{axis.name}</span>
        {active ? (
          <CircleCheck
            className="mt-0.5 size-4 shrink-0 text-primary"
            aria-hidden="true"
          />
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
  axisScores,
}: {
  counts: Record<TaskReadiness, number>;
  closedCount: number;
  byAxis: Map<string, number>;
  axes: TeamReportAxis[];
  axisScores: TeamReportAxisScore[];
}) {
  const scoreByAxis = new Map(
    axisScores.map((item) => [item.axisId, item] as const),
  );
  const totalScore = axisScores.reduce(
    (sum, item) => sum + (item.convertedScore ?? 0),
    0,
  );
  const totalMax = axisScores.reduce((sum, item) => sum + item.maxScore, 0);

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

        {/* Điểm theo trục ngay tại đây: đội phải thấy mình đang được bao nhiêu
            TRƯỚC khi gửi, không phải chờ cấp trên mở ra mới biết. */}
        <div className="space-y-2 border-t pt-3">
          {/* Tổng để nổi hẳn, tô theo mức đạt: đây là con số cả đội nhìn vào. */}
          {totalMax > 0 ? (
            <div
              className={cn(
                "flex items-center justify-between gap-2 rounded-md border px-2.5 py-2",
                scoreTone(totalScore / totalMax).badge,
              )}
            >
              <span className="text-xs font-medium">Tổng điểm hôm nay</span>
              <span className="tabular-nums">
                <strong className="font-display text-lg">
                  {formatScore(totalScore)}
                </strong>
                <span className="text-xs opacity-70">
                  {" "}
                  / {formatScore(totalMax)}
                </span>
              </span>
            </div>
          ) : null}

          {axes.map((axis) => {
            const count = byAxis.get(axis._id) ?? 0;
            const score = scoreByAxis.get(axis._id);
            const tone = scoreTone(score?.axisScore ?? null);
            const percent = Math.min(
              100,
              Math.max(0, (score?.axisScore ?? 0) * 100),
            );
            return (
              <div key={axis._id} className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate">
                    {axis.name}
                    <span className="text-muted-foreground"> · {count}</span>
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {score?.convertedScore === null ||
                    score?.convertedScore === undefined ? (
                      <span className="text-xs italic text-muted-foreground">
                        Chưa chấm
                      </span>
                    ) : (
                      <>
                        <strong className={tone.text}>
                          {formatScore(score.convertedScore)}
                        </strong>
                        <span className="text-muted-foreground">
                          /{axis.maxScore}
                        </span>
                      </>
                    )}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn("h-full rounded-full", tone.bar)}
                    style={{ width: `${percent}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Nhắc lại luật gửi ngay tại chỗ người dùng đang đứng - đây là chỗ hay
            bị hiểu nhầm nhất giữa hai bản nghiệp vụ. Không còn nút "Gửi báo
            cáo ngày" (xem ghi chú ở đầu trang), nên đừng nhắc tới nó. */}
        <p className="rounded-md border bg-muted/40 p-2.5 text-xs text-muted-foreground">
          Nhiệm vụ <strong className="text-foreground">Sẵn sàng</strong> được
          gom vào <strong className="text-foreground">Báo cáo tổng hợp</strong>{" "}
          để trình cấp trên. Ở đây chỉ cần phân loại và điền đủ ô.
        </p>
      </CardContent>
    </Card>
  );
}
