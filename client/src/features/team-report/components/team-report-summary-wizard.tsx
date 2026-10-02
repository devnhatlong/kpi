"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  ClipboardCheck,
  FileText,
  Loader2,
  Search,
  Send,
  TriangleAlert,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DatePickerInput } from "@/components/common/date-picker-input";
import { SearchableSelect } from "@/components/common/searchable-select";
import { SegmentedTabs } from "@/components/common/segmented-tabs";
import {
  createTeamReportSummary,
  fetchTeamReportRecipients,
  fetchTeamReportSummaryCandidates,
  previewTeamReportSummaryScore,
  sendTeamReportSummary,
  teamReportKeys,
  type TeamReportSummaryLevel,
} from "@/features/team-report/api";
import {
  CLOSED_DONE_CLASS,
  CLOSED_STOPPED_CLASS,
  scoreTone,
} from "@/features/team-report/status-styles";
import {
  recipientLabel,
  formatScore,
  refId,
  refName,
  type TeamReportPeriod,
} from "@/features/team-report/types";
import { useServerTime } from "@/hooks/use-server-time";
import { getApiErrorMessage } from "@/lib/api-client";
import {
  currentMonthRange,
  currentQuarterRange,
  currentWeekRange,
  currentYearRange,
  formatYmd,
  serverYmd,
} from "@/lib/server-time";
import { cn } from "@/lib/utils";

const STEPS = [
  { key: "info", label: "Thông tin", icon: FileText },
  { key: "pick", label: "Chọn nhiệm vụ", icon: ClipboardCheck },
  { key: "send", label: "Trình cấp trên", icon: Send },
] as const;

type StepKey = (typeof STEPS)[number]["key"];

/** Nút chọn kỳ nhanh - vẫn sửa tay được hai đầu ngày sau khi bấm. */
const PERIOD_PRESETS: Array<{ value: TeamReportPeriod; label: string }> = [
  { value: "DAY", label: "Ngày" },
  { value: "WEEK", label: "Tuần" },
  { value: "MONTH", label: "Tháng" },
  { value: "QUARTER", label: "Quý" },
  { value: "YEAR", label: "Năm" },
  { value: "CUSTOM", label: "Tự chọn" },
];

/**
 * Lọc kho nhiệm vụ ở bước chọn.
 *
 * Trộn hai chiều vào một dải nút (đã trình hay chưa / còn làm hay đã xong) vì
 * với người lập đây cùng là một câu hỏi: "còn cái nào đáng đưa vào bản này".
 * Tách hai dải nút cho hai chiều thì phải bấm hai lần mới ra được tập cần tìm.
 */
type PickFilter = "ALL" | "NOT_SENT" | "SENT" | "DONE" | "OPEN";

const PICK_FILTERS: Array<{ value: PickFilter; label: string }> = [
  { value: "ALL", label: "Tất cả" },
  { value: "NOT_SENT", label: "Chưa trình" },
  { value: "SENT", label: "Đã trình" },
  { value: "DONE", label: "Đã xong" },
  { value: "OPEN", label: "Đang làm" },
];

function defaultTitle(from: string, to: string): string {
  return from === to
    ? `Báo cáo tổng hợp ngày ${formatYmd(from)}`
    : `Báo cáo tổng hợp ${formatYmd(from)} - ${formatYmd(to)}`;
}

type WizardProps = {
  open: boolean;
  /** `UNIT` = phòng gom việc của các đội; khi đó có thêm bộ lọc theo đội. */
  level?: TeamReportSummaryLevel;
  onOpenChange: (open: boolean) => void;
  /**
   * Gọi sau khi trình xong hoặc lưu nháp, kèm id bản vừa lập để màn ngoài mở
   * đúng bản đó thay vì bắt người dùng tự đi tìm trong danh sách.
   */
  onDone: (summaryId: string) => void | Promise<void>;
};

/**
 * Lập báo cáo tổng hợp: khai thông tin → tích nhiệm vụ → trình cấp trên.
 *
 * Kho nhiệm vụ chỉ bày việc ĐÃ SẴN SÀNG (đủ trục, đủ nội dung công việc, đủ ô
 * bắt buộc của mẫu). Bày cả việc dở dang thì người lập phải tự đoán dòng nào đủ
 * điều kiện, mà đoán sai là báo cáo trình lên thiếu số.
 *
 * Báo cáo chỉ được ghi xuống ở bước cuối: bỏ dở giữa chừng thì không để lại bản
 * nháp rỗng nào cho người dùng dọn.
 */
export function TeamReportSummaryWizard({
  open,
  level = "TEAM",
  onOpenChange,
  onDone,
}: WizardProps) {
  const { ready } = useServerTime();
  const [step, setStep] = useState<StepKey>("info");
  const [period, setPeriod] = useState<TeamReportPeriod>("WEEK");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [title, setTitle] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<PickFilter>("ALL");
  /** "ALL" hoặc id một trục - lọc kho theo trục trước khi lọc theo trạng thái. */
  const [axisFilter, setAxisFilter] = useState("ALL");
  /*
    "ALL" hoặc id một đội. Chỉ bản của PHÒNG mới dùng tới - kho của phòng gồm
    việc của tất cả các đội, không lọc được thì nhìn một danh sách vài trăm dòng
    trộn lẫn tám đội.

    Lọc ở SERVER chứ không lọc tại chỗ như trục: trần kho là 300 dòng, lọc tại
    chỗ thì đội đứng cuối bảng chữ cái có thể đã bị cắt trước khi tới tay client.
  */
  const [deptFilter, setDeptFilter] = useState("ALL");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [recipientId, setRecipientId] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  /* Lỗi hiện NGAY TẠI Ô, chỉ bật lên sau khi người dùng bấm đi tiếp - chưa
     làm gì đã đỏ lòm thì như bị mắng trước. */
  const [titleError, setTitleError] = useState(false);
  const [pickError, setPickError] = useState(false);
  const [recipientError, setRecipientError] = useState(false);
  /* Hỏi lại trước khi đóng khi đã tích việc: bấm nhầm ra ngoài hộp hay nhấn
     Esc ở bước 2 là mất cả chục lựa chọn. */
  const [confirmClose, setConfirmClose] = useState(false);

  const requestClose = (next: boolean) => {
    if (next) {
      onOpenChange(true);
      return;
    }
    if (picked.size > 0 && !busy) {
      setConfirmClose(true);
      return;
    }
    onOpenChange(false);
  };

  /*
    Mỗi lần mở là một bản nháp mới. Đặt lại ngay trong render chứ không dùng
    effect, để bước 1 không chớp qua dữ liệu của lần lập trước.
  */
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open && ready) {
      const week = currentWeekRange();
      setStep("info");
      setPeriod("WEEK");
      setFromDate(week.from);
      setToDate(week.to);
      setTitle(defaultTitle(week.from, week.to));
      setQuery("");
      setFilter("ALL");
      setAxisFilter("ALL");
      setDeptFilter("ALL");
      setPicked(new Set());
      setRecipientId("");
      setNote("");
      setTitleError(false);
      setPickError(false);
      setRecipientError(false);
      setConfirmClose(false);
    }
  }

  /** Nút "Tiếp tục": kiểm tra bước đang đứng, lỗi thì báo tại ô và dừng lại. */
  const goNext = () => {
    if (step === "info") {
      if (!title.trim()) {
        setTitleError(true);
        document.getElementById("summary-title")?.focus();
        return;
      }
      if (!rangeValid) return;
      setStep("pick");
      return;
    }
    if (!picked.size) {
      setPickError(true);
      return;
    }
    setStep("send");
  };

  /** Bấm nút kỳ thì nhảy cả hai đầu ngày, và đặt lại tên nếu chưa ai sửa tên. */
  const applyPeriod = (next: TeamReportPeriod) => {
    setPeriod(next);
    if (next === "CUSTOM") return;
    const range =
      next === "DAY"
        ? { from: serverYmd(), to: serverYmd() }
        : next === "WEEK"
          ? currentWeekRange()
          : next === "MONTH"
            ? currentMonthRange()
            : next === "QUARTER"
              ? currentQuarterRange()
              : currentYearRange();
    setFromDate(range.from);
    setToDate(range.to);
    if (title === defaultTitle(fromDate, toDate) || !title.trim()) {
      setTitle(defaultTitle(range.from, range.to));
    }
  };

  const rangeValid = !!fromDate && !!toDate && fromDate <= toDate;

  const deptParam = deptFilter === "ALL" ? "" : deptFilter;
  const { data, isLoading } = useSWR(
    open && step === "pick" && rangeValid
      ? teamReportKeys.summaryCandidates(
          fromDate,
          toDate,
          query.trim(),
          "PERIOD",
          level,
          deptParam,
        )
      : null,
    () =>
      fetchTeamReportSummaryCandidates({
        fromDate,
        toDate,
        q: query.trim(),
        level,
        ...(deptParam ? { departmentIds: [deptParam] } : {}),
      }),
    { revalidateOnFocus: false, keepPreviousData: true },
  );

  const { data: recipients = [] } = useSWR(
    open && step === "send" ? teamReportKeys.recipients(level) : null,
    () => fetchTeamReportRecipients(undefined, level),
  );

  /*
    Điểm tạm tính của tập đang tích.

    Khoá SWR là chính danh sách id đã sắp xếp, nên tích đi tích lại về đúng tập
    cũ là lấy luôn từ cache, không gọi lại. `keepPreviousData` giữ con số cũ
    trong lúc tính lại - để nó nháy về 0 rồi nhảy lại thì nhìn như vừa mất điểm.
  */
  const pickedIds = useMemo(() => [...picked].sort(), [picked]);
  const { data: preview = [], isValidating: previewing } = useSWR(
    open && step === "pick" && pickedIds.length
      ? (["team-report", "summary-preview", pickedIds.join(",")] as const)
      : null,
    () => previewTeamReportSummaryScore(pickedIds, level),
    { revalidateOnFocus: false, keepPreviousData: true },
  );

  const previewScore = preview.reduce(
    (sum, axis) => sum + (axis.convertedScore ?? 0),
    0,
  );
  const previewMax = preview.reduce((sum, axis) => sum + axis.maxScore, 0);
  const previewRatio = previewMax > 0 ? previewScore / previewMax : null;

  const all = useMemo(() => data?.tasks ?? [], [data]);

  /* Danh sách trục dựng TỪ CHÍNH KHO, không lấy cả danh mục trục: bày ra một
     trục mà kỳ này không có việc nào thì lọc vào chỉ ra bảng trống. */
  /*
    Các đội để lọc - lấy từ server, KHÔNG dựng từ kho đang hiện.

    Dựng từ kho thì đang lọc đội A xong danh sách chỉ còn mỗi đội A, không quay
    về đội khác được. Rỗng với bản của đội (không có đơn vị con) nên ô lọc tự ẩn.
  */
  const deptOptions = useMemo(() => data?.departments ?? [], [data]);

  const axisOptions = useMemo(() => {
    const seen = new Map<string, { id: string; name: string; count: number }>();
    for (const row of all) {
      const id = refId(row.task.axisId);
      if (!id) continue;
      const found = seen.get(id);
      if (found) found.count += 1;
      else
        seen.set(id, {
          id,
          name: refName(row.task.axisId) || "Chưa rõ trục",
          count: 1,
        });
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [all]);

  /* Đếm cho dải nút trạng thái tính SAU khi đã lọc trục: đang xem Trục 2 mà
     con số vẫn của cả kho thì bấm vào ra ít hơn hẳn, nhìn như mất dòng. */
  const byAxis = useMemo(
    () =>
      axisFilter === "ALL"
        ? all
        : all.filter((row) => refId(row.task.axisId) === axisFilter),
    [all, axisFilter],
  );

  const counts = useMemo(
    () => ({
      ALL: byAxis.length,
      NOT_SENT: byAxis.filter((row) => !row.alreadySent).length,
      SENT: byAxis.filter((row) => row.alreadySent).length,
      DONE: byAxis.filter((row) => !row.task.isOpen).length,
      OPEN: byAxis.filter((row) => row.task.isOpen).length,
    }),
    [byAxis],
  );

  const candidates = useMemo(
    () =>
      byAxis.filter((row) => {
        if (filter === "NOT_SENT") return !row.alreadySent;
        if (filter === "SENT") return row.alreadySent;
        if (filter === "DONE") return !row.task.isOpen;
        if (filter === "OPEN") return row.task.isOpen;
        return true;
      }),
    [byAxis, filter],
  );

  const recipientOptions = useMemo(
    () =>
      recipients.map((person) => ({
        value: person.id,
        label: recipientLabel(person),
      })),
    [recipients],
  );

  const toggle = (taskId: string) => {
    if (pickError) setPickError(false);
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  /*
    Chọn tất cả áp cho phần ĐANG HIỆN, không phải cả kho.

    Lọc ra "đã xong" rồi bấm chọn tất cả mà nó tích luôn cả việc đang làm thì bộ
    lọc thành vô nghĩa. Bỏ chọn cũng vậy: chỉ bỏ phần đang hiện, giữ nguyên
    những gì đã tích ở bộ lọc khác.
  */
  const visibleIds = candidates.map((row) => row.task._id);
  const allVisiblePicked =
    visibleIds.length > 0 && visibleIds.every((id) => picked.has(id));

  const toggleAll = () => {
    if (pickError) setPickError(false);
    setPicked((prev) => {
      const next = new Set(prev);
      for (const id of visibleIds) {
        if (allVisiblePicked) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  };

  /*
    Lập rồi trình trong CÙNG một lần bấm. Tách hai nút thì bỏ dở giữa chừng để
    lại một bản nháp mà người dùng không hề định tạo.
  */
  const finish = async (send: boolean) => {
    /* Hai kiểm tra đầu chỉ là lưới an toàn - bước 1 và 2 đã chặn rồi, nên đưa
       người dùng quay về đúng bước có lỗi thay vì báo chung chung. */
    if (!title.trim()) {
      setTitleError(true);
      setStep("info");
      return;
    }
    if (!picked.size) {
      setPickError(true);
      setStep("pick");
      return;
    }
    if (send && !recipientId) {
      setRecipientError(true);
      return;
    }

    setBusy(true);
    try {
      const summary = await createTeamReportSummary({
        title: title.trim(),
        period,
        fromDate,
        toDate,
        taskIds: [...picked],
        note: note.trim() || undefined,
        level,
      });
      if (send) {
        await sendTeamReportSummary(
          summary._id,
          { recipientId, note: note.trim() || undefined },
          level,
        );
        toast.success("Đã trình báo cáo lên cấp trên.");
      } else {
        toast.success("Đã lưu bản nháp.");
      }
      onOpenChange(false);
      await onDone(summary._id);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không lập được báo cáo."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={requestClose}>
        {/* Khung rộng: mỗi dòng nhiệm vụ mang tên việc, nội dung công việc, sản
            phẩm và hạn - khung hẹp thì tên nào cũng gãy làm ba dòng và danh sách
            dài gấp đôi mà đọc chẳng nhanh hơn. */}
        <DialogContent className="max-h-[92vh] overflow-y-auto overscroll-contain sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>Lập báo cáo tổng hợp</DialogTitle>
            <DialogDescription className="sr-only">
              Ba bước: chọn kỳ và đặt tên, tích nhiệm vụ, rồi trình cấp trên.
            </DialogDescription>
          </DialogHeader>

          {/* Ba bước, chỉ để biết đang đứng đâu - bấm chuyển bước bằng nút dưới. */}
          <ol aria-label="Các bước lập báo cáo" className="flex items-center gap-2">
            {STEPS.map((item, index) => {
              const active = item.key === step;
              const done = STEPS.findIndex((s) => s.key === step) > index;
              return (
                <li
                  key={item.key}
                  aria-current={active ? "step" : undefined}
                  className="flex flex-1 items-center gap-2"
                >
                  <span
                    className={cn(
                      "flex items-center gap-1.5 whitespace-nowrap text-sm",
                      active
                        ? "font-medium text-primary"
                        : done
                          ? "text-foreground"
                          : "text-muted-foreground",
                    )}
                  >
                    {done ? (
                      <Check
                        className="size-4 text-emerald-600 dark:text-emerald-400"
                        aria-hidden="true"
                      />
                    ) : (
                      <item.icon className="size-4" aria-hidden="true" />
                    )}
                    {item.label}
                  </span>
                  {index < STEPS.length - 1 ? (
                    <span className="h-px flex-1 bg-border" aria-hidden="true" />
                  ) : null}
                </li>
              );
            })}
          </ol>

          {/* ------------------------------------------------ bước 1 */}
          {step === "info" ? (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <p id="summary-period-label" className="text-sm font-medium">
                  Kỳ báo cáo
                </p>
                <SegmentedTabs
                  ariaLabel="Kỳ báo cáo"
                  value={period}
                  onChange={applyPeriod}
                  items={PERIOD_PRESETS.map((item) => ({
                    value: item.value,
                    label: item.label,
                  }))}
                  className="flex-wrap"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="summary-from">Từ ngày</Label>
                  <DatePickerInput
                    id="summary-from"
                    value={fromDate}
                    clearable={false}
                    onChange={(next) => {
                      setFromDate(next);
                      setPeriod("CUSTOM");
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="summary-to">Đến ngày</Label>
                  <DatePickerInput
                    id="summary-to"
                    value={toDate}
                    clearable={false}
                    min={fromDate}
                    onChange={(next) => {
                      setToDate(next);
                      setPeriod("CUSTOM");
                    }}
                  />
                </div>
              </div>

              {!rangeValid ? (
                <p
                  role="alert"
                  className="flex items-center gap-1.5 text-sm text-destructive"
                >
                  <TriangleAlert className="size-4" aria-hidden="true" />
                  Ngày bắt đầu phải trước hoặc trùng ngày kết thúc.
                </p>
              ) : null}

              <div className="space-y-1.5">
                <Label htmlFor="summary-title">
                  Tên báo cáo <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="summary-title"
                  name="title"
                  autoComplete="off"
                  value={title}
                  aria-invalid={titleError || undefined}
                  aria-describedby={
                    titleError ? "summary-title-error" : undefined
                  }
                  onChange={(event) => {
                    setTitle(event.target.value);
                    if (titleError) setTitleError(false);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      goNext();
                    }
                  }}
                  placeholder="Ví dụ: Báo cáo tổng hợp tuần 39…"
                  className="aria-[invalid]:border-destructive"
                />
                {titleError ? (
                  <p
                    id="summary-title-error"
                    role="alert"
                    className="text-xs text-destructive"
                  >
                    Đặt tên cho báo cáo để cấp trên nhận ra bản nào.
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* ------------------------------------------------ bước 2 */}
          {step === "pick" ? (
            /* Hai cột: kho bên trái, điểm bên phải và DÍNH khi cuộn - tích một
               dòng ở cuối danh sách mà bảng điểm nằm dưới cùng thì phải cuộn đi
               cuộn lại mới biết vừa được thêm bao nhiêu. */
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_17rem]">
              <div className="min-w-0 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative min-w-[200px] flex-1">
                    <Search
                      className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <Input
                      type="search"
                      name="q"
                      aria-label="Tìm nhiệm vụ trong kho"
                      autoComplete="off"
                      spellCheck={false}
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Tìm nhiệm vụ hoặc sản phẩm…"
                      className="pl-8"
                    />
                  </div>
                  {/* Lọc đội đứng TRƯỚC lọc trục: với bản của phòng, câu hỏi đầu
                      tiên luôn là "việc của đội nào", trục là chuyện sau đó. */}
                  {deptOptions.length ? (
                    <Select
                      value={deptFilter}
                      onValueChange={(next) => {
                        setDeptFilter(next);
                        setAxisFilter("ALL");
                      }}
                    >
                      <SelectTrigger aria-label="Lọc theo đội" className="w-52">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">Tất cả các đội</SelectItem>
                        {deptOptions.map((department) => (
                          <SelectItem key={department.id} value={department.id}>
                            {department.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : null}
                  {axisOptions.length > 1 ? (
                    <Select value={axisFilter} onValueChange={setAxisFilter}>
                      <SelectTrigger aria-label="Lọc theo trục" className="w-44">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">
                          Tất cả trục ({all.length})
                        </SelectItem>
                        {axisOptions.map((axis) => (
                          <SelectItem key={axis.id} value={axis.id}>
                            {axis.name} ({axis.count})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!candidates.length}
                    onClick={toggleAll}
                  >
                    {allVisiblePicked
                      ? `Bỏ chọn (${candidates.length})`
                      : `Chọn tất cả (${candidates.length})`}
                  </Button>
                </div>

                <SegmentedTabs
                  ariaLabel="Lọc kho nhiệm vụ"
                  value={filter}
                  onChange={setFilter}
                  items={PICK_FILTERS.map((item) => ({
                    value: item.value,
                    label: `${item.label} (${counts[item.value]})`,
                  }))}
                  className="flex-wrap"
                />

                {/* Nói rõ đã lọc mất bao nhiêu, kẻo tưởng mất việc. */}
                {data?.notReady ? (
                  <p className="flex items-start gap-1.5 rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                    <TriangleAlert
                      className="mt-0.5 size-3.5 shrink-0"
                      aria-hidden="true"
                    />
                    <span>
                      <strong className="tabular-nums">{data.notReady}</strong>{" "}
                      nhiệm vụ trong kỳ chưa đủ điều kiện nên không hiện ở đây
                      (thiếu trục, thiếu nội dung công việc, hoặc còn ô bắt buộc
                      bỏ trống). Hoàn thiện ở tab{" "}
                      <Link
                        href={`/team-report/classify?view=table`}
                        className="font-medium text-foreground underline underline-offset-4"
                      >
                        Phân loại nhiệm vụ
                      </Link>{" "}
                      rồi quay lại.
                    </span>
                  </p>
                ) : null}

                {data?.truncated ? (
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    Kỳ này quá nhiều việc nên danh sách bị cắt bớt. Thu hẹp khoảng
                    ngày để nhìn đủ.
                  </p>
                ) : null}

                {pickError ? (
                  <p role="alert" className="text-sm text-destructive">
                    Tích ít nhất một nhiệm vụ để đưa vào báo cáo.
                  </p>
                ) : null}

                <div
                  className={cn(
                    "max-h-[26rem] space-y-1.5 overflow-y-auto overscroll-contain rounded-md border p-2",
                    pickError && "border-destructive",
                  )}
                  aria-busy={isLoading}
                >
                  {isLoading && !candidates.length
                    ? Array.from({ length: 5 }, (_, index) => (
                        <div key={index} className="flex gap-2.5 p-2">
                          <Skeleton className="size-4 shrink-0" />
                          <div className="flex-1 space-y-1.5">
                            <Skeleton className="h-4 w-3/4" />
                            <Skeleton className="h-3 w-1/2" />
                          </div>
                        </div>
                      ))
                    : null}

                  {!isLoading && !candidates.length ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      {all.length
                        ? "Không có nhiệm vụ nào khớp bộ lọc này."
                        : "Không có nhiệm vụ nào sẵn sàng trong kỳ này."}
                    </p>
                  ) : null}

                  {candidates.map(({ task, alreadySent, departmentName }) => (
                    <label
                      key={task._id}
                      /* Kho có thể tới 300 dòng: `content-visibility` để trình
                         duyệt bỏ qua vẽ những dòng đang khuất, khỏi phải kéo
                         thêm thư viện virtualize. */
                      className="flex cursor-pointer items-start gap-2.5 rounded-md p-2 [contain-intrinsic-size:auto_76px] [content-visibility:auto] hover:bg-muted/60 has-[:focus-visible]:ring-1 has-[:focus-visible]:ring-ring"
                    >
                      <Checkbox
                        checked={picked.has(task._id)}
                        onCheckedChange={() => toggle(task._id)}
                        className="mt-0.5"
                      />
                      <span className="min-w-0 flex-1 space-y-1">
                        <span className="block break-words text-sm font-medium">
                          {task.name}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {refName(task.workContentId) || "Chưa rõ nội dung"}
                          {task.product ? `, ${task.product}` : ""}
                          {task.deadline
                            ? `, hạn ${formatYmd(task.deadline)}`
                            : ""}
                        </span>
                        <span className="flex flex-wrap items-center gap-1.5">
                          {/* Tên đội chỉ có nghĩa khi kho trộn nhiều đội - bản của
                              đội thì dòng nào cũng của chính họ. */}
                          {deptOptions.length && departmentName ? (
                            <Badge
                              variant="secondary"
                              className="gap-1 whitespace-nowrap font-normal"
                            >
                              <Building2 className="size-3" aria-hidden="true" />
                              {departmentName}
                            </Badge>
                          ) : null}
                          {refName(task.axisId) ? (
                            <Badge variant="secondary" className="font-normal">
                              {refName(task.axisId)}
                            </Badge>
                          ) : null}
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
                              <Check className="size-3" aria-hidden="true" />
                              {task.closedReason ? "Đã dừng" : "Đã xong"}
                            </Badge>
                          )}
                          {/* Không chặn chọn lại: một việc kéo dài nằm trong cả bản
                            tuần lẫn bản tháng là chuyện bình thường. */}
                          {alreadySent ? (
                            <Badge
                              variant="secondary"
                              className="border-amber-300 bg-amber-100 font-normal text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
                            >
                              Đã trình ở bản khác
                            </Badge>
                          ) : null}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/*
                Cột phải: bao nhiêu việc, mấy trục, được mấy điểm.

                Điểm do SERVER tính bằng đúng công thức của bản đã lập, nên con số
                ở đây chính là con số sẽ ra - nhờ vậy chọn được tập việc cho vừa
                mục tiêu ngay tại chỗ, thay vì lập bản, xem điểm, xoá đi, lập lại.
              */}
              <div className="space-y-3 lg:sticky lg:top-0 lg:self-start">
                <div
                  aria-live="polite"
                  className={cn(
                    "rounded-md border px-3 py-2.5",
                    picked.size
                      ? scoreTone(previewRatio).badge || "bg-muted/40"
                      : "bg-muted/40",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium">Điểm tạm tính</span>
                    {previewing ? (
                      <Loader2
                        className="size-3 opacity-70 motion-safe:animate-spin"
                        aria-hidden="true"
                      />
                    ) : null}
                  </div>
                  {picked.size ? (
                    <p className="tabular-nums">
                      <strong className="font-display text-2xl">
                        {formatScore(previewScore)}
                      </strong>
                      <span className="text-sm opacity-70">
                        {" "}
                        / {formatScore(previewMax)} điểm
                      </span>
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Tích nhiệm vụ để xem điểm
                    </p>
                  )}
                </div>

                {/*
                  Đếm việc trên CẢ KHO chứ không trên phần đang lọc: tích ở bộ lọc
                  này rồi đổi sang bộ lọc khác mà con số tụt xuống thì nhìn như vừa
                  mất mấy dòng đã tích.
                */}
                <div className="space-y-1.5 rounded-md border px-3 py-2.5 text-sm">
                  <p className="tabular-nums">
                    Đã chọn <strong>{picked.size}</strong> / {all.length} nhiệm vụ
                  </p>
                  {axisFilter === "ALL" && filter === "ALL" ? null : (
                    <p className="text-xs text-muted-foreground">
                      Đang xem {candidates.length} dòng theo bộ lọc
                    </p>
                  )}

                  {/* Từng trục một dòng: chọn thêm việc ở trục nào thì thấy ngay
                      trục đó nhích lên bao nhiêu. */}
                  {preview.length ? (
                    <div className="space-y-1 border-t pt-2">
                      {preview.map((axis) => (
                        <div
                          key={axis.axisId}
                          className="flex items-center justify-between gap-2 text-xs"
                        >
                          <span className="min-w-0 truncate text-muted-foreground">
                            {axis.axisName} ({axis.taskCount} việc)
                          </span>
                          {axis.convertedScore === null ? (
                            <span className="shrink-0 italic text-muted-foreground">
                              Chưa chấm
                            </span>
                          ) : (
                            <span className="shrink-0 tabular-nums">
                              <strong className={scoreTone(axis.axisScore).text}>
                                {formatScore(axis.convertedScore)}
                              </strong>
                              <span className="text-muted-foreground">
                                /{axis.maxScore}
                              </span>
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          {/* ------------------------------------------------ bước 3 */}
          {step === "send" ? (
            <div className="space-y-4">
              <div className="space-y-1 rounded-md border bg-muted/40 px-3 py-2.5 text-sm">
                <p className="font-medium">{title}</p>
                <p className="text-muted-foreground tabular-nums">
                  Kỳ {formatYmd(fromDate)} - {formatYmd(toDate)}
                </p>
                <p className="text-muted-foreground tabular-nums">
                  <strong className="text-foreground">{picked.size}</strong>{" "}
                  nhiệm vụ
                  {previewMax > 0
                    ? `, tạm tính ${formatScore(previewScore)} / ${formatScore(previewMax)} điểm`
                    : ""}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="wizard-recipient">
                  Trình lên <span className="text-destructive">*</span>
                </Label>
                <SearchableSelect
                  id="wizard-recipient"
                  value={recipientId}
                  onValueChange={(next) => {
                    setRecipientId(next);
                    if (recipientError) setRecipientError(false);
                  }}
                  aria-invalid={recipientError}
                  aria-describedby={
                    recipientError ? "wizard-recipient-error" : undefined
                  }
                  options={recipientOptions}
                  placeholder={
                    recipientOptions.length
                      ? "Chọn cấp trên…"
                      : "Chưa tìm được cấp trên nào có quyền duyệt"
                  }
                />
                {recipientError ? (
                  <p
                    id="wizard-recipient-error"
                    role="alert"
                    className="text-xs text-destructive"
                  >
                    Chọn người cấp trên nhận báo cáo, hoặc bấm Lưu nháp để trình
                    sau.
                  </p>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="wizard-note">
                  Ghi chú gửi kèm{" "}
                  <span className="font-normal text-muted-foreground">
                    (không bắt buộc)
                  </span>
                </Label>
                <Textarea
                  id="wizard-note"
                  name="note"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  rows={3}
                  placeholder="Ví dụ: Tuần này có 2 việc chuyển sang kỳ sau…"
                />
              </div>
            </div>
          ) : null}

          {/* ------------------------------------------------ điều hướng */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* Có nền và có mũi tên: nút chữ trơn nằm cạnh nút "Tiếp tục" đặc màu
                thì nhìn như chữ chú thích chứ không ra nút bấm. Mũi tên chỉ gắn
                cho "Quay lại" - "Huỷ" là đóng hẳn chứ không lùi bước nào. */}
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (step === "info") requestClose(false);
                else setStep(step === "send" ? "pick" : "info");
              }}
            >
              {step === "info" ? (
                <>
                  <X className="size-4" aria-hidden="true" />
                  Huỷ
                </>
              ) : (
                <>
                  <ArrowLeft className="size-4" aria-hidden="true" />
                  Quay lại
                </>
              )}
            </Button>

            <div className="flex flex-wrap items-center gap-2">
              {step === "send" ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void finish(false)}
                  >
                    Lưu nháp
                  </Button>
                  <Button
                    type="button"
                    disabled={busy}
                    className="active:scale-[0.98] motion-reduce:active:scale-100"
                    onClick={() => void finish(true)}
                  >
                    {busy ? (
                      <Loader2
                        className="size-4 motion-safe:animate-spin"
                        aria-hidden="true"
                      />
                    ) : (
                      <Send className="size-4" aria-hidden="true" />
                    )}
                    Trình cấp trên
                  </Button>
                </>
              ) : (
                /* Nút luôn bấm được (trừ khi khoảng ngày sai - lỗi đó đã hiện sẵn
                   ở trên): bấm mà thiếu gì thì báo ngay tại chỗ thiếu, thay vì một
                   nút xám không nói vì sao. */
                <Button
                  type="button"
                  disabled={step === "info" && !rangeValid}
                  onClick={goNext}
                >
                  {step === "pick" && picked.size
                    ? `Tiếp tục với ${picked.size} nhiệm vụ`
                    : "Tiếp tục"}
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Đóng giữa chừng khi đã tích việc: hỏi lại, vì chưa có gì được lưu. */}
      <Dialog open={confirmClose} onOpenChange={setConfirmClose}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Bỏ báo cáo đang lập?</DialogTitle>
            <DialogDescription>
              Đã tích {picked.size} nhiệm vụ nhưng chưa lưu. Đóng lại là mất hết
              lựa chọn này.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              autoFocus
              onClick={() => setConfirmClose(false)}
            >
              Tiếp tục lập
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                setConfirmClose(false);
                onOpenChange(false);
              }}
            >
              Bỏ báo cáo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
