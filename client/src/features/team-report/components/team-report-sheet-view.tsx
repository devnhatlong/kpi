"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import {
  AlertTriangle,
  Loader2,
  Lock,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Square,
  Trash2,
  Undo2,
  X,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  closeTeamReportTask,
  createTeamReportTask,
  deleteTeamReportTask,
  fetchTeamReportSheet,
  reopenTeamReportTask,
  teamReportKeys,
  updateTeamReportTask,
} from "@/features/team-report/api";
import { DatePickerInput } from "@/components/common/date-picker-input";
import {
  CLOSED_DONE_CLASS,
  CLOSED_STOPPED_CLASS,
  READINESS_CLASS,
} from "@/features/team-report/status-styles";
import { TeamReportDayPicker } from "@/features/team-report/components/team-report-day-picker";
import {
  TEAM_REPORT_STATUS_LABEL,
  refName,
  type TeamReportTask,
} from "@/features/team-report/types";
import { getApiErrorMessage } from "@/lib/api-client";
import { useServerTime } from "@/hooks/use-server-time";
import { formatYmd, serverYmd } from "@/lib/server-time";
import { cn } from "@/lib/utils";

/**
 * Nhịp tự nạp lại bảng.
 *
 * Cả đội gõ chung một bảng nên phải thấy dòng người khác vừa thêm mà không cần
 * bấm gì. Nhưng mỗi tài khoản đội có tới ~30 người cùng mở tab, toàn tỉnh hàng
 * trăm đội - poll dày là hàng nghìn lượt / giây giờ cao điểm. 30 giây đủ
 * "sống": thao tác của CHÍNH MÌNH cập nhật ngay sau khi lưu, chỉ dòng người
 * khác mới chờ tối đa 30 giây. SWR tự dừng poll khi tab bị ẩn.
 */
const REFRESH_MS = 30_000;

/** Dòng mới (của người khác hay của mình) được tô nổi bấy lâu rồi thôi. */
const FRESH_MS = 10_000;

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** Bản nháp đang gõ của một dòng. */
/*
  Bản nháp CHỈ có ba trường: giai đoạn 1 là khai việc, không chấm điểm.

  Điểm nằm trọn trong bộ cột của mẫu ở tab Phân loại (nhóm điểm, điểm, tỉ lệ
  hoàn thành) và do chỉ huy chấm. Để thêm một ô điểm ở đây là tạo ra con số thứ
  hai không ai dùng, lại lệch với điểm thật.
*/
type Draft = {
  name: string;
  deadline: string;
  product: string;
  /** Số bản lúc mở ra sửa - gửi kèm để server biết mình đang cầm bản nào. */
  version: number;
};

const emptyDraft = (): Draft => ({
  name: "",
  deadline: "",
  product: "",
  version: 0,
});

function draftOf(task: TeamReportTask): Draft {
  return {
    name: task.name,
    deadline: task.deadline,
    product: task.product ?? "",
    version: task.version,
  };
}

/**
 * Một dòng vừa bấm thêm mà server chưa trả lời.
 *
 * Hiện ngay lên đầu bảng thay vì bắt người nhập chờ: cả đội thêm việc liên
 * tục, mỗi dòng phải đứng đợi mạng là mất nhịp gõ. Lỗi thì dòng ở lại, đỏ lên
 * và giữ nguyên chữ đã gõ để thử lại - không bao giờ nuốt mất phần người ta
 * vừa nhập.
 */
type PendingRow = {
  tempId: string;
  draft: Draft;
  error: string | null;
};

/**
 * Chuẩn hoá tên để dò trùng: bỏ dấu, bỏ hoa thường, gộp khoảng trắng.
 *
 * Tài khoản chung nghĩa là hai người ngồi hai máy rất dễ cùng khai một việc -
 * một người gõ "Rà soát hồ sơ", người kia "rà soát  hồ sơ". So chuỗi thô thì
 * không bắt được.
 */
function normalizeName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Tìm một dòng có vẻ trùng với tên đang gõ. Chỉ cảnh báo, không chặn. */
function findSimilar(name: string, candidates: string[]) {
  const needle = normalizeName(name);
  if (needle.length < 4) return null;
  for (const candidate of candidates) {
    const other = normalizeName(candidate);
    if (other === needle) return candidate;
    /* Chứa nhau chỉ tính khi đủ dài: "Họp" nằm trong nửa số việc của đội,
       báo trùng kiểu đó là báo động giả liên tục. */
    if (
      needle.length >= 8 &&
      other.length >= 8 &&
      (other.includes(needle) || needle.includes(other))
    ) {
      return candidate;
    }
  }
  return null;
}

/**
 * Giai đoạn 1 - bảng nhập chung của đội.
 *
 * Cả đội đăng nhập cùng một tài khoản và cùng gõ vào bảng này, nên server không
 * phân biệt được ai với ai. Chống đè bằng số bản trên từng dòng: mở ra sửa là
 * cầm số bản lúc đó, lưu mà server đã có bản mới hơn thì bị từ chối và chỉ dòng
 * đó phải tải lại - phần đang gõ ở dòng khác không việc gì.
 */
export function TeamReportSheetView() {
  /*
    Mọi thứ dính tới ngày đều chờ ĐỒNG BỘ GIỜ SERVER xong.

    `serverYmd()` trả về giờ MÁY khi chưa đồng bộ, nên khởi tạo state bằng nó ở
    lần render đầu là chốt cứng một ngày có thể sai - máy lệch múi giờ hoặc lệch
    đồng hồ sẽ mở nhầm bảng của hôm khác, mà cả đội dùng chung một tài khoản nên
    hai người ngồi cạnh nhau lại thấy hai ngày.

    Vì vậy giữ "ngày người dùng đã chọn" (null = chưa chọn) rồi suy ra ngày đang
    xem từ hôm nay, và không gọi API trước khi `ready`.
  */
  const { ready } = useServerTime();
  const today = serverYmd();

  /*
    Ngày và từ khoá nằm trên URL (?date=&q=): F5 hay gửi link cho người bên
    cạnh vẫn mở đúng chỗ đang xem. Ngày trên URL lớn hơn hôm nay (link cũ, gõ
    tay) thì coi như không có - bảng tương lai chưa tồn tại.
  */
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initialDate = searchParams.get("date");
  const initialQuery = searchParams.get("q") ?? "";

  const [pickedDate, setPickedDate] = useState<string | null>(
    initialDate && YMD.test(initialDate) ? initialDate : null,
  );
  const reportDate =
    pickedDate && pickedDate <= today ? pickedDate : today;

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [newDraft, setNewDraft] = useState<Draft>(emptyDraft);
  const [newNameError, setNewNameError] = useState(false);
  const [pending, setPending] = useState<PendingRow[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [closing, setClosing] = useState<TaskRef | null>(null);
  const [closeReason, setCloseReason] = useState("");
  const [closeReasonError, setCloseReasonError] = useState(false);
  const [deleting, setDeleting] = useState<TeamReportTask | null>(null);
  const newNameRef = useRef<HTMLInputElement>(null);
  const [editNameError, setEditNameError] = useState(false);
  const editNameRef = useRef<HTMLInputElement>(null);

  /*
    Tìm kiếm chạy Ở SERVER (`q` soi cả tên nhiệm vụ lẫn sản phẩm), nên giữ hai
    state: `query` là thứ đang gõ, `search` là thứ đã chốt để gọi API. Gọi theo
    từng phím gõ thì mỗi ký tự một lượt mạng, mà bảng lại tự nạp lại định kỳ -
    hai thứ chồng lên nhau là bảng nhấp nháy liên tục.
  */
  const [query, setQuery] = useState(initialQuery);
  const [search, setSearch] = useState(initialQuery.trim());
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const syncUrl = useCallback(
    (date: string | null, q: string) => {
      const params = new URLSearchParams();
      if (date) params.set("date", date);
      if (q) params.set("q", q);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router],
  );

  const pickDate = (next: string) => {
    // Chọn về hôm nay thì bỏ khỏi URL: link không ngày luôn là "hôm nay".
    const date = next === today ? null : next;
    setPickedDate(date);
    syncUrl(date, search);
  };

  const changeQuery = (next: string) => {
    setQuery(next);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      const trimmed = next.trim();
      setSearch(trimmed);
      syncUrl(pickedDate, trimmed);
    }, 300);
  };

  const clearQuery = () => {
    if (debounce.current) clearTimeout(debounce.current);
    setQuery("");
    setSearch("");
    syncUrl(pickedDate, "");
  };

  /*
    Dòng mới hiện lên sau mỗi lần nạp lại được tô nổi một lúc.

    Không biết ai thêm (chung tài khoản), nhưng biết được dòng nào TRƯỚC ĐÓ
    CHƯA CÓ: so tập id của lần nạp này với lần trước. Chỉ so khi cùng ngày và
    cùng từ khoá - đổi ngày thì cả bảng đều "mới", tô hết lên là vô nghĩa.
    Khoá so sánh lấy từ chính dữ liệu trả về chứ không từ state, vì
    `keepPreviousData` giữ bảng cũ trong lúc chờ bảng mới.
  */
  const seenRef = useRef<{ key: string; ids: Set<string> } | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(() => new Set());
  const [freshFromOthers, setFreshFromOthers] = useState(0);

  const markFresh = useCallback((ids: string[], fromOthers: boolean) => {
    if (!ids.length) return;
    setFresh((prev) => new Set([...prev, ...ids]));
    if (fromOthers) setFreshFromOthers((count) => count + ids.length);
    setTimeout(() => {
      setFresh((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
      if (fromOthers) {
        setFreshFromOthers((count) => Math.max(0, count - ids.length));
      }
    }, FRESH_MS);
  }, []);

  /* Id của dòng chính mình vừa thêm - để khỏi đếm nó vào "dòng mới của người
     khác" khi lần nạp lại mang nó về. */
  const ownIdsRef = useRef<Set<string>>(new Set());

  const { data, isLoading, mutate, isValidating } = useSWR(
    ready ? teamReportKeys.sheet(reportDate, search) : null,
    async () => ({
      ...(await fetchTeamReportSheet({ reportDate, q: search })),
      q: search,
    }),
    {
      // Tự nạp lại để thấy dòng người khác vừa thêm.
      refreshInterval: REFRESH_MS,
      // Không nạp lại khi quay về tab: đang gõ dở mà bảng nhảy là mất phần gõ.
      revalidateOnFocus: false,
      keepPreviousData: true,
      onSuccess: (next) => {
        const key = `${next.reportDate}|${next.q}`;
        const ids = new Set(next.tasks.map((task) => task._id));
        const prev = seenRef.current;
        seenRef.current = { key, ids };
        if (!prev || prev.key !== key) return;
        const added = [...ids].filter(
          (id) => !prev.ids.has(id) && !ownIdsRef.current.has(id),
        );
        markFresh(added, true);
      },
    },
  );

  const tasks = useMemo(() => data?.tasks ?? [], [data]);
  const locked = data?.locked ?? false;
  const day = data?.day ?? null;
  /* Chỉ sửa được bảng của HÔM NAY: bảng hôm qua là bản đã chốt, sửa lùi thì
     báo cáo đã gửi và bảng đang xem nói hai chuyện khác nhau. */
  const editable = ready && !locked && reportDate === today;

  const similar = useMemo(
    () =>
      newDraft.name.trim()
        ? findSimilar(newDraft.name, [
            ...tasks.map((task) => task.name),
            ...pending.map((row) => row.draft.name),
          ])
        : null,
    [newDraft.name, tasks, pending],
  );

  const stopEditing = useCallback(() => {
    setEditingId(null);
    setDraft(emptyDraft());
    setEditNameError(false);
  }, []);

  /*
    Hỏi lại trước khi rời trang khi còn thứ chưa lưu: chữ đang gõ ở ô nhập
    nhanh, dòng đang sửa, hay dòng đang chờ server trả lời. Máy dùng chung, người
    sau hay đóng tab của người trước mà không nhìn.
  */
  const editingTask = tasks.find((task) => task._id === editingId);
  const hasUnsaved =
    !!newDraft.name.trim() ||
    !!newDraft.product.trim() ||
    pending.length > 0 ||
    (!!editingTask &&
      (draft.name !== editingTask.name ||
        draft.product !== (editingTask.product ?? "") ||
        draft.deadline !== editingTask.deadline));
  useEffect(() => {
    if (!hasUnsaved) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasUnsaved]);

  const handleError = useCallback(
    async (error: unknown, fallback: string) => {
      const status = (error as { response?: { status?: number } })?.response
        ?.status;
      if (status === 409) {
        // Người khác vừa sửa đúng dòng này - nạp lại rồi để họ gõ tiếp.
        toast.error("Dòng này vừa được người khác sửa. Đã tải lại bản mới.");
        stopEditing();
        await mutate();
        return;
      }
      toast.error(getApiErrorMessage(error, fallback));
    },
    [mutate, stopEditing],
  );

  /** Gửi một dòng chờ lên server. Dùng cho cả lần đầu lẫn "Thử lại". */
  const pushPending = async (row: PendingRow) => {
    try {
      const created = await createTeamReportTask({
        name: row.draft.name.trim(),
        deadline: row.draft.deadline || undefined,
        product: row.draft.product.trim() || undefined,
      });
      ownIdsRef.current.add(created._id);
      await mutate();
      setPending((prev) => prev.filter((item) => item.tempId !== row.tempId));
      markFresh([created._id], false);
    } catch (error) {
      setPending((prev) =>
        prev.map((item) =>
          item.tempId === row.tempId
            ? {
                ...item,
                error: getApiErrorMessage(error, "Không thêm được nhiệm vụ."),
              }
            : item,
        ),
      );
    }
  };

  const submitNew = (event: FormEvent) => {
    event.preventDefault();
    if (!newDraft.name.trim()) {
      setNewNameError(true);
      newNameRef.current?.focus();
      return;
    }
    const row: PendingRow = {
      tempId: `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      draft: newDraft,
      error: null,
    };
    setPending((prev) => [row, ...prev]);
    setNewDraft(emptyDraft());
    setNewNameError(false);
    /* Bỏ bộ lọc: dòng vừa thêm rất có thể không khớp từ đang tìm, giữ nguyên
       thì thêm xong lại không thấy đâu và tưởng là hỏng. */
    if (search || query) clearQuery();
    // Ô tên giữ focus để gõ luôn việc tiếp theo, không phải cầm chuột.
    newNameRef.current?.focus();
    void pushPending(row);
  };

  const retryPending = (row: PendingRow) => {
    const next = { ...row, error: null };
    setPending((prev) =>
      prev.map((item) => (item.tempId === row.tempId ? next : item)),
    );
    void pushPending(next);
  };

  const dropPending = (tempId: string) => {
    setPending((prev) => prev.filter((item) => item.tempId !== tempId));
  };

  const startEdit = (task: TeamReportTask) => {
    setEditingId(task._id);
    setDraft(draftOf(task));
  };

  const saveEdit = async (task: TeamReportTask) => {
    const name = draft.name.trim();
    if (!name) {
      // Báo ngay dưới ô và đưa con trỏ về đó, không bắn toast ở góc màn hình.
      setEditNameError(true);
      editNameRef.current?.focus();
      return;
    }
    setBusyId(task._id);
    try {
      await updateTeamReportTask(task._id, {
        name,
        deadline: draft.deadline || undefined,
        product: draft.product.trim() || undefined,
        version: draft.version,
      });
      stopEditing();
      await mutate();
      toast.success("Đã lưu.");
    } catch (error) {
      await handleError(error, "Không lưu được.");
    } finally {
      setBusyId(null);
    }
  };

  const openClose = (task: TeamReportTask) => {
    setClosing({ _id: task._id, name: task.name, version: task.version });
    setCloseReason("");
    setCloseReasonError(false);
  };

  const confirmClose = async (event: FormEvent) => {
    event.preventDefault();
    if (!closing) return;
    const reason = closeReason.trim();
    if (!reason) {
      setCloseReasonError(true);
      return;
    }
    setBusyId(closing._id);
    try {
      await closeTeamReportTask(closing._id, {
        version: closing.version,
        reason,
      });
      setClosing(null);
      setCloseReason("");
      await mutate();
      /* Dòng biến mất ngay sau khi dừng - nói rõ nó đi đâu, không thì người
         dùng tưởng vừa xoá nhầm. */
      toast.success(
        "Đã dừng nhiệm vụ. Dòng này rời bảng hôm nay; mở lại ở tab Phân loại.",
      );
    } catch (error) {
      await handleError(error, "Không dừng được nhiệm vụ.");
    } finally {
      setBusyId(null);
    }
  };

  /** Đường lùi cho lần bấm nhầm - không hỏi lại, vì mở lại chẳng mất gì. */
  const reopen = async (task: TeamReportTask) => {
    setBusyId(task._id);
    try {
      await reopenTeamReportTask(task._id, { version: task.version });
      await mutate();
      toast.success("Đã mở lại nhiệm vụ.");
    } catch (error) {
      await handleError(error, "Không mở lại được nhiệm vụ.");
    } finally {
      setBusyId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setBusyId(deleting._id);
    try {
      await deleteTeamReportTask(deleting._id);
      setDeleting(null);
      await mutate();
      toast.success("Đã xoá nhiệm vụ.");
    } catch (error) {
      await handleError(error, "Không xoá được nhiệm vụ.");
    } finally {
      setBusyId(null);
    }
  };

  const scrollToFresh = () => {
    const row = document.querySelector<HTMLElement>("[data-fresh='other']");
    row?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const showSkeleton = (!ready || isLoading) && !tasks.length;
  const showEmpty =
    !showSkeleton && !tasks.length && !pending.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-balance font-display text-2xl font-semibold tracking-tight">
            Nhập nhiệm vụ ngày
          </h1>
          <p className="text-sm text-muted-foreground">
            Cả đội cùng nhập vào bảng này - dòng người khác vừa thêm sẽ tự hiện
            ra.
          </p>
        </div>

        {/* Icon quay ngay trong nút thay cho một dòng chữ hiện / ẩn: chữ bật
            tắt mỗi lần poll làm cả cụm nút giật sang ngang. */}
        <Button
          type="button"
          variant="outline"
          onClick={() => void mutate()}
        >
          <RefreshCw
            className={cn(
              "size-4",
              isValidating && "motion-safe:animate-spin",
            )}
            aria-hidden="true"
          />
          Làm mới
        </Button>
        <span className="sr-only" aria-live="polite">
          {isValidating ? "Đang đồng bộ bảng" : ""}
        </span>
      </div>

      <Card className="shadow-sm">
        <CardContent className="space-y-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-1 flex-wrap items-center gap-2">
              <TeamReportDayPicker
                value={reportDate}
                onChange={pickDate}
                today={today}
              />

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
                  onChange={(event) => changeQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape" && query) {
                      event.preventDefault();
                      clearQuery();
                    }
                  }}
                  placeholder="Tìm theo nhiệm vụ hoặc sản phẩm…"
                  className="pl-8 pr-8 [&::-webkit-search-cancel-button]:hidden"
                />
                {query ? (
                  <button
                    type="button"
                    aria-label="Xoá tìm kiếm"
                    onClick={clearQuery}
                    className="absolute right-1 top-1/2 flex size-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <X className="size-4" aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {freshFromOthers > 0 ? (
                <button
                  type="button"
                  onClick={scrollToFresh}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <span
                    className="size-1.5 rounded-full bg-primary"
                    aria-hidden="true"
                  />
                  {freshFromOthers} dòng mới
                </button>
              ) : null}
              {/* Đang tìm thì con số là số dòng KHỚP, không phải cả ngày - nói
                  rõ ra, kẻo đọc nhầm là cả ngày chỉ có bấy nhiêu việc. */}
              <Badge variant="secondary" className="font-normal tabular-nums">
                {search
                  ? `Khớp ${tasks.length} nhiệm vụ`
                  : `${tasks.length} nhiệm vụ`}
              </Badge>
              {data?.unclassified ? (
                <Badge
                  variant="secondary"
                  className={cn(
                    "font-normal tabular-nums",
                    READINESS_CLASS.UNCLASSIFIED,
                  )}
                >
                  {data.unclassified} chưa phân loại
                </Badge>
              ) : null}
            </div>
          </div>

          {/* Đã gửi thì nói rõ vì sao không gõ được, đừng để nút xám không lý do. */}
          {locked && day ? (
            <div
              role="status"
              className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2.5 text-sm"
            >
              <Lock
                className="size-4 text-muted-foreground"
                aria-hidden="true"
              />
              <span>
                Báo cáo ngày {formatYmd(reportDate)} đã gửi lên cấp trên
                {day.sentByName ? ` (${day.sentByName})` : ""} -{" "}
                {TEAM_REPORT_STATUS_LABEL[day.status]}.
              </span>
              {day.returnReason ? (
                <span className="text-destructive">
                  Lý do trả lại: {day.returnReason}
                </span>
              ) : null}
            </div>
          ) : null}

          {ready && !locked && reportDate !== today ? (
            <div
              role="status"
              className="rounded-md border bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground"
            >
              Đang xem lại ngày {formatYmd(reportDate)}. Chỉ bảng của hôm nay
              mới nhập và sửa được.
            </div>
          ) : null}

          {/*
            Ô nhập nhanh LUÔN MỞ ở đầu bảng.

            Đội thêm việc liên tục cả buổi, nên không bắt bấm "Thêm" để mở một
            dòng rồi lưu xong lại đóng: gõ tên, Enter, ô tự trống và giữ focus
            cho việc kế tiếp. Nằm trên đầu chứ không ở cuối bảng - bảng dài
            thì dòng cuối phải cuộn mới thấy.
          */}
          {editable ? (
            <form
              onSubmit={submitNew}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setNewDraft(emptyDraft());
                  setNewNameError(false);
                }
              }}
              className="space-y-2 rounded-md border border-dashed bg-muted/30 p-3"
              aria-label="Thêm nhiệm vụ"
            >
              {/* Nhãn HIỆN RÕ trên từng ô, không dựa vào placeholder: tài khoản
                  chung nghĩa là ngày nào cũng có người mới ngồi vào gõ, gõ một
                  chữ là placeholder biến mất và họ không còn biết ô nào là ô gì. */}
              <div className="grid items-end gap-x-2 gap-y-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_auto_auto]">
                <div className="space-y-1.5">
                  <Label htmlFor="new-task-name" className="text-xs">
                    Tên nhiệm vụ <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="new-task-name"
                    ref={newNameRef}
                    name="name"
                    autoComplete="off"
                    placeholder="Ví dụ: Rà soát hồ sơ tháng 9…"
                    value={newDraft.name}
                    aria-invalid={newNameError || undefined}
                    aria-describedby={
                      newNameError
                        ? "new-task-name-error"
                        : similar
                          ? "new-task-similar"
                          : undefined
                    }
                    onChange={(e) => {
                      setNewDraft({ ...newDraft, name: e.target.value });
                      if (newNameError) setNewNameError(false);
                    }}
                    className="bg-card aria-[invalid]:border-destructive"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new-task-product" className="text-xs">
                    Sản phẩm phải ra
                  </Label>
                  <Input
                    id="new-task-product"
                    name="product"
                    autoComplete="off"
                    placeholder="Ví dụ: Biên bản kiểm tra…"
                    value={newDraft.product}
                    onChange={(e) =>
                      setNewDraft({ ...newDraft, product: e.target.value })
                    }
                    className="bg-card"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new-task-deadline" className="text-xs">
                    Hạn hoàn thành
                  </Label>
                  <DatePickerInput
                    id="new-task-deadline"
                    value={newDraft.deadline}
                    onChange={(next) =>
                      setNewDraft({ ...newDraft, deadline: next })
                    }
                    placeholder="Không đặt hạn"
                    className="sm:w-[190px]"
                  />
                </div>
                <Button
                  type="submit"
                  className="active:scale-[0.98] motion-reduce:active:scale-100"
                >
                  <Plus className="size-4" aria-hidden="true" />
                  Thêm
                </Button>
              </div>

              <div className="flex min-h-5 flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs">
                <div aria-live="polite">
                  {newNameError ? (
                    <span
                      id="new-task-name-error"
                      className="text-destructive"
                    >
                      Nhập tên nhiệm vụ trước đã.
                    </span>
                  ) : similar ? (
                    <span
                      id="new-task-similar"
                      className="inline-flex items-center gap-1.5 text-amber-700 dark:text-amber-400"
                    >
                      <AlertTriangle
                        className="size-3.5 shrink-0"
                        aria-hidden="true"
                      />
                      Đã có &ldquo;{similar}&rdquo; - kiểm tra xem có trùng
                      không.
                    </span>
                  ) : null}
                </div>
                <span className="hidden text-muted-foreground sm:inline">
                  <kbd className="rounded border bg-background px-1 font-sans">
                    Enter
                  </kbd>{" "}
                  để thêm ·{" "}
                  <kbd className="rounded border bg-background px-1 font-sans">
                    Esc
                  </kbd>{" "}
                  để xoá ô
                </span>
              </div>
            </form>
          ) : null}

          {/* Form của dòng đang sửa đặt ngoài bảng (form không bọc được <tr>),
              các ô trong dòng trỏ về nó bằng thuộc tính `form`. */}
          <form
            id="edit-task-form"
            onSubmit={(event) => {
              event.preventDefault();
              const task = tasks.find((item) => item._id === editingId);
              if (task) void saveEdit(task);
            }}
          />

          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[280px]">Nhiệm vụ</TableHead>
                  <TableHead className="min-w-[200px]">Sản phẩm</TableHead>
                  <TableHead className="w-[150px]">Hạn hoàn thành</TableHead>
                  <TableHead className="w-[180px]">Phân loại</TableHead>
                  <TableHead className="w-[110px]">Tình trạng</TableHead>
                  <TableHead className="w-[56px]">
                    <span className="sr-only">Thao tác</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {showSkeleton
                  ? Array.from({ length: 4 }, (_, index) => (
                      <TableRow key={`skeleton-${index}`}>
                        {[0, 1, 2, 3, 4, 5].map((cell) => (
                          <TableCell key={cell}>
                            <Skeleton
                              className={cn(
                                "h-4",
                                cell === 0 ? "w-4/5" : "w-2/3",
                              )}
                            />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  : null}

                {showEmpty ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="h-28 text-center text-muted-foreground"
                    >
                      {search ? (
                        <>
                          Không có nhiệm vụ nào khớp &ldquo;{search}&rdquo;.{" "}
                          <button
                            type="button"
                            onClick={clearQuery}
                            className="cursor-pointer font-medium text-primary underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none"
                          >
                            Xoá tìm kiếm
                          </button>
                        </>
                      ) : editable ? (
                        "Chưa có nhiệm vụ nào hôm nay. Gõ tên vào ô phía trên rồi Enter."
                      ) : (
                        "Chưa có nhiệm vụ nào của ngày này."
                      )}
                    </TableCell>
                  </TableRow>
                ) : null}

                {pending.map((row) => (
                  <TableRow
                    key={row.tempId}
                    className={cn(
                      row.error
                        ? "bg-destructive/5 shadow-[inset_3px_0_0_var(--destructive)]"
                        : "bg-primary/5 shadow-[inset_3px_0_0_var(--primary)]",
                    )}
                  >
                    <TableCell className="max-w-[420px] whitespace-normal break-words font-medium">
                      {row.draft.name}
                      {row.error ? (
                        <div className="text-xs font-normal text-destructive">
                          {row.error}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="max-w-[280px] whitespace-normal break-words text-sm">
                      {row.draft.product || <EmptyValue>Chưa ghi</EmptyValue>}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {row.draft.deadline ? (
                        formatYmd(row.draft.deadline)
                      ) : (
                        <EmptyValue>Không đặt hạn</EmptyValue>
                      )}
                    </TableCell>
                    <TableCell colSpan={2} className="text-sm">
                      {row.error ? (
                        <div className="inline-flex gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => retryPending(row)}
                          >
                            Thử lại
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => dropPending(row.tempId)}
                          >
                            Bỏ
                          </Button>
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                          <Loader2
                            className="size-3.5 motion-safe:animate-spin"
                            aria-hidden="true"
                          />
                          Đang lưu…
                        </span>
                      )}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                ))}

                {tasks.map((task) => {
                  const busy = busyId === task._id;
                  const isEditing = editingId === task._id;
                  const canEdit = editable && task.isOpen && !busy;

                  if (isEditing) {
                    return (
                      <TableRow
                        key={task._id}
                        className="bg-muted/40"
                        onKeyDown={(event: KeyboardEvent) => {
                          if (event.key === "Escape") {
                            event.preventDefault();
                            stopEditing();
                          }
                        }}
                      >
                        <TableCell>
                          <Input
                            ref={editNameRef}
                            form="edit-task-form"
                            name="name"
                            autoFocus
                            aria-label="Tên nhiệm vụ"
                            autoComplete="off"
                            value={draft.name}
                            aria-invalid={editNameError || undefined}
                            aria-describedby={
                              editNameError ? "edit-name-error" : undefined
                            }
                            onChange={(e) => {
                              setDraft({ ...draft, name: e.target.value });
                              if (editNameError) setEditNameError(false);
                            }}
                            className="aria-[invalid]:border-destructive"
                          />
                          {editNameError ? (
                            <p
                              id="edit-name-error"
                              role="alert"
                              className="mt-1 text-xs text-destructive"
                            >
                              Tên nhiệm vụ không được để trống.
                            </p>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <Input
                            form="edit-task-form"
                            name="product"
                            aria-label="Sản phẩm phải ra"
                            autoComplete="off"
                            value={draft.product}
                            onChange={(e) =>
                              setDraft({ ...draft, product: e.target.value })
                            }
                            placeholder="Sản phẩm phải ra…"
                          />
                        </TableCell>
                        <TableCell>
                          <DatePickerInput
                            value={draft.deadline}
                            onChange={(next) =>
                              setDraft({ ...draft, deadline: next })
                            }
                            placeholder="Không đặt hạn"
                          />
                        </TableCell>
                        <TableCell
                          colSpan={2}
                          className="text-xs text-muted-foreground"
                        >
                          Enter để lưu · Esc để huỷ
                        </TableCell>
                        <TableCell>
                          <div className="inline-flex gap-1">
                            <Button
                              type="submit"
                              form="edit-task-form"
                              size="sm"
                              disabled={busy}
                            >
                              {busy ? (
                                <Loader2
                                  className="size-4 motion-safe:animate-spin"
                                  aria-hidden="true"
                                />
                              ) : null}
                              Lưu
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              aria-label="Huỷ sửa"
                              disabled={busy}
                              onClick={stopEditing}
                            >
                              <X className="size-4" aria-hidden="true" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  }

                  const isFresh = fresh.has(task._id);
                  const status = task.isOpen
                    ? "Đang làm"
                    : task.closedReason
                      ? "Đã dừng"
                      : "Đã xong";

                  return (
                    <TableRow
                      key={task._id}
                      data-fresh={
                        isFresh
                          ? ownIdsRef.current.has(task._id)
                            ? "own"
                            : "other"
                          : undefined
                      }
                      className={cn(
                        "transition-colors duration-700 motion-reduce:transition-none",
                        isFresh &&
                          "bg-primary/5 shadow-[inset_3px_0_0_var(--primary)]",
                      )}
                    >
                      <TableCell
                        className={cn(
                          "max-w-[420px] whitespace-normal break-words align-middle font-medium",
                          !task.isOpen && "text-muted-foreground",
                        )}
                      >
                        {/* Bấm thẳng vào tên là sửa - không bắt tìm nút
                            "Sửa" ở cuối dòng. */}
                        {canEdit ? (
                          <button
                            type="button"
                            onClick={() => startEdit(task)}
                            className="-mx-1 cursor-text rounded-sm px-1 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            aria-label={`Sửa nhiệm vụ ${task.name}`}
                          >
                            {task.name}
                          </button>
                        ) : (
                          task.name
                        )}
                        {isFresh ? (
                          <Badge
                            variant="secondary"
                            className="ml-2 border-primary/30 bg-primary/10 px-1.5 py-0 text-[10px] font-medium uppercase text-primary"
                          >
                            Mới
                          </Badge>
                        ) : null}
                        {task.closedReason ? (
                          <div className="text-xs font-normal text-muted-foreground">
                            Dừng: {task.closedReason}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "max-w-[280px] whitespace-normal break-words align-middle text-sm",
                          !task.isOpen && "text-muted-foreground",
                        )}
                      >
                        {task.product || <EmptyValue>Chưa ghi</EmptyValue>}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "align-middle tabular-nums",
                          !task.isOpen && "text-muted-foreground",
                        )}
                      >
                        {task.deadline ? (
                          formatYmd(task.deadline)
                        ) : (
                          <EmptyValue>Không đặt hạn</EmptyValue>
                        )}
                      </TableCell>
                      <TableCell className="align-middle text-sm">
                        {refName(task.workContentId) || (
                          <span className="text-muted-foreground">
                            Chưa phân loại
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="align-middle">
                        {/* Cùng bảng màu với tab Phân loại - một nhãn hai màu ở
                            hai màn thì người dùng tưởng hai trạng thái khác. */}
                        <Badge
                          variant="secondary"
                          className={cn(
                            "whitespace-nowrap font-normal",
                            task.isOpen
                              ? ""
                              : task.closedReason
                                ? CLOSED_STOPPED_CLASS
                                : CLOSED_DONE_CLASS,
                          )}
                        >
                          {status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right align-middle">
                        {/* Gom thao tác vào một menu: ba nút cạnh nhau trên mỗi
                            dòng chiếm chỗ của cột tên, và phần lớn thời gian
                            chúng nằm xám vì không dùng được. */}
                        <DropdownMenu modal={false}>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              disabled={busy}
                              aria-label={`Thao tác với nhiệm vụ ${task.name}`}
                            >
                              {busy ? (
                                <Loader2
                                  className="size-4 motion-safe:animate-spin"
                                  aria-hidden="true"
                                />
                              ) : (
                                <MoreHorizontal
                                  className="size-4"
                                  aria-hidden="true"
                                />
                              )}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            {canEdit ? (
                              <DropdownMenuItem
                                onSelect={() => startEdit(task)}
                              >
                                <Pencil className="size-4" aria-hidden="true" />
                                Sửa
                              </DropdownMenuItem>
                            ) : null}
                            {/* Đóng có hiệu lực ngay, nên bấm nhầm phải lùi
                                được ngay tại đây - không bắt khai lại một dòng
                                mới. */}
                            {task.isOpen ? (
                              <DropdownMenuItem
                                onSelect={() => openClose(task)}
                              >
                                <Square className="size-4" aria-hidden="true" />
                                Dừng giữa chừng…
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                onSelect={() => void reopen(task)}
                              >
                                <Undo2 className="size-4" aria-hidden="true" />
                                Mở lại
                              </DropdownMenuItem>
                            )}
                            {editable ? (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onSelect={() => setDeleting(task)}
                                  className="text-destructive focus:text-destructive"
                                >
                                  <Trash2
                                    className="size-4"
                                    aria-hidden="true"
                                  />
                                  Xoá…
                                </DropdownMenuItem>
                              </>
                            ) : null}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <p className="text-xs text-muted-foreground">
            Việc đánh dấu xong sẽ rời bảng. Cần hiện lại thì vào tab{" "}
            <strong className="font-medium text-foreground">
              Phân loại nhiệm vụ
            </strong>
            , mục <strong className="font-medium text-foreground">Đã đóng</strong>
            , bấm Mở lại.
          </p>
        </CardContent>
      </Card>

      <Dialog
        open={!!closing}
        onOpenChange={(open) => {
          if (!open) setClosing(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <form onSubmit={(event) => void confirmClose(event)} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Dừng nhiệm vụ</DialogTitle>
              <DialogDescription>
                &ldquo;{closing?.name}&rdquo; sẽ không hiện lại ở bảng của những
                ngày sau. Nêu rõ lý do để cấp trên đọc được vì sao dừng giữa
                chừng.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="close-reason">Lý do dừng</Label>
              <Textarea
                id="close-reason"
                autoFocus
                value={closeReason}
                aria-invalid={closeReasonError || undefined}
                aria-describedby={
                  closeReasonError ? "close-reason-error" : undefined
                }
                onChange={(e) => {
                  setCloseReason(e.target.value);
                  if (closeReasonError) setCloseReasonError(false);
                }}
                placeholder="Ví dụ: chuyển sang đơn vị khác thực hiện…"
                rows={3}
                className="aria-[invalid]:border-destructive"
              />
              {closeReasonError ? (
                <p
                  id="close-reason-error"
                  className="text-xs text-destructive"
                >
                  Nêu lý do dừng nhiệm vụ.
                </p>
              ) : null}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setClosing(null)}
              >
                Huỷ
              </Button>
              <Button type="submit" disabled={busyId === closing?._id}>
                {busyId === closing?._id ? (
                  <Loader2
                    className="size-4 motion-safe:animate-spin"
                    aria-hidden="true"
                  />
                ) : null}
                Dừng nhiệm vụ
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Xoá nhiệm vụ</DialogTitle>
            <DialogDescription>
              Xoá hẳn &ldquo;{deleting?.name}&rdquo; khỏi bảng. Nhiệm vụ đã nằm
              trong báo cáo đã gửi thì không xoá được - dùng Dừng giữa chừng.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDeleting(null)}
            >
              Huỷ
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busyId === deleting?._id}
              onClick={() => void confirmDelete()}
            >
              {busyId === deleting?._id ? (
                <Loader2
                  className="size-4 motion-safe:animate-spin"
                  aria-hidden="true"
                />
              ) : null}
              Xoá
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Ô không có giá trị: ghi thẳng ra là chưa có gì, chữ nhỏ và nhạt.
 *
 * Không dùng một dấu gạch trơ trọi: người đọc không phân biệt được "để trống" với
 * "chưa tải xong" hay "không áp dụng", và trình đọc màn hình đọc nó thành "gạch".
 */
function EmptyValue({ children }: { children: ReactNode }) {
  return (
    <span className="text-xs italic text-muted-foreground">{children}</span>
  );
}

/** Đủ để dừng một dòng - giữ riêng để dialog không phụ thuộc bảng đang nạp lại. */
type TaskRef = Pick<TeamReportTask, "_id" | "name" | "version">;
