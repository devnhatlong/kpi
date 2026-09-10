"use client";

import { useMemo, useState } from "react";
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
    }
  }

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
        label: person.departmentName
          ? `${person.fullName} - ${person.departmentName}`
          : person.fullName,
      })),
    [recipients],
  );

  const toggle = (taskId: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });

  /*
    Chọn tất cả áp cho phần ĐANG HIỆN, không phải cả kho.

    Lọc ra "đã xong" rồi bấm chọn tất cả mà nó tích luôn cả việc đang làm thì bộ
    lọc thành vô nghĩa. Bỏ chọn cũng vậy: chỉ bỏ phần đang hiện, giữ nguyên
    những gì đã tích ở bộ lọc khác.
  */
  const visibleIds = candidates.map((row) => row.task._id);
  const allVisiblePicked =
    visibleIds.length > 0 && visibleIds.every((id) => picked.has(id));

  const toggleAll = () =>
    setPicked((prev) => {
      const next = new Set(prev);
      for (const id of visibleIds) {
        if (allVisiblePicked) next.delete(id);
        else next.add(id);
      }
      return next;
    });

  /*
    Lập rồi trình trong CÙNG một lần bấm. Tách hai nút thì bỏ dở giữa chừng để
    lại một bản nháp mà người dùng không hề định tạo.
  */
  const finish = async (send: boolean) => {
    if (!title.trim()) {
      toast.error("Đặt tên cho báo cáo trước đã.");
      return;
    }
    if (!picked.size) {
      toast.error("Chọn ít nhất một nhiệm vụ.");
      return;
    }
    if (send && !recipientId) {
      toast.error("Chọn cấp trên nhận báo cáo.");
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Khung rộng: mỗi dòng nhiệm vụ mang tên việc, nội dung công việc, sản
          phẩm và hạn - khung hẹp thì tên nào cũng gãy làm ba dòng và danh sách
          dài gấp đôi mà đọc chẳng nhanh hơn. */}
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Lập báo cáo tổng hợp</DialogTitle>
        </DialogHeader>

        {/* Ba bước, chỉ để biết đang đứng đâu - bấm chuyển bước bằng nút dưới. */}
        <div className="flex items-center gap-2">
          {STEPS.map((item, index) => {
            const active = item.key === step;
            const done = STEPS.findIndex((s) => s.key === step) > index;
            return (
              <div key={item.key} className="flex flex-1 items-center gap-2">
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
                  <item.icon className="size-4" />
                  {item.label}
                </span>
                {index < STEPS.length - 1 ? (
                  <span className="h-px flex-1 bg-border" />
                ) : null}
              </div>
            );
          })}
        </div>

        {/* ------------------------------------------------ bước 1 */}
        {step === "info" ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Kỳ báo cáo</p>
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
                <p className="text-sm font-medium">Từ ngày</p>
                <DatePickerInput
                  value={fromDate}
                  clearable={false}
                  onChange={(next) => {
                    setFromDate(next);
                    setPeriod("CUSTOM");
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <p className="text-sm font-medium">Đến ngày</p>
                <DatePickerInput
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
              <p className="flex items-center gap-1.5 text-sm text-destructive">
                <TriangleAlert className="size-4" />
                Từ ngày phải trước hoặc bằng đến ngày.
              </p>
            ) : null}

            <div className="space-y-1.5">
              <p className="text-sm font-medium">Tên báo cáo</p>
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Báo cáo tổng hợp..."
                className="bg-background"
              />
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
                  <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Tìm nhiệm vụ hoặc sản phẩm..."
                    className="bg-background pl-8"
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
                    <SelectTrigger className="w-52 bg-background">
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
                    <SelectTrigger className="w-44 bg-background">
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
                  className="bg-background"
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
                  <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                  <span>
                    {data.notReady} nhiệm vụ trong kỳ chưa đủ điều kiện nên
                    không hiện ở đây - thiếu trục, thiếu nội dung công việc,
                    hoặc còn ô bắt buộc bỏ trống. Hoàn thiện ở tab Phân loại rồi
                    quay lại.
                  </span>
                </p>
              ) : null}

              {data?.truncated ? (
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  Kỳ này quá nhiều việc nên danh sách bị cắt bớt. Thu hẹp khoảng
                  ngày để nhìn đủ.
                </p>
              ) : null}

              <div className="max-h-[26rem] space-y-1.5 overflow-y-auto rounded-md border p-2">
                {isLoading && !candidates.length ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Đang tải...
                  </p>
                ) : null}

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
                    className="flex cursor-pointer items-start gap-2.5 rounded-md p-2 hover:bg-muted/60"
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
                        {task.product ? ` · ${task.product}` : ""}
                        {task.deadline
                          ? ` · hạn ${formatYmd(task.deadline)}`
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
                            <Building2 className="size-3" />
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
                            <Check className="size-3" />
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
                    <Loader2 className="size-3 animate-spin opacity-70" />
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
                <p>
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
                          {axis.axisName} · {axis.taskCount} việc
                        </span>
                        <span className="shrink-0 tabular-nums">
                          <strong className={scoreTone(axis.axisScore).text}>
                            {axis.convertedScore === null
                              ? "-"
                              : formatScore(axis.convertedScore)}
                          </strong>
                          <span className="text-muted-foreground">
                            /{axis.maxScore}
                          </span>
                        </span>
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
              <p className="text-muted-foreground">
                {formatYmd(fromDate)} - {formatYmd(toDate)} ·{" "}
                <strong>{picked.size}</strong> nhiệm vụ
              </p>
            </div>

            <div className="space-y-1.5">
              <p className="text-sm font-medium">
                Trình lên <span className="text-destructive">*</span>
              </p>
              <SearchableSelect
                value={recipientId}
                onValueChange={setRecipientId}
                options={recipientOptions}
                placeholder={
                  recipientOptions.length
                    ? "Chọn cấp trên..."
                    : "Chưa tìm được cấp trên nào có quyền duyệt"
                }
              />
            </div>

            <div className="space-y-1.5">
              <p className="text-sm font-medium">Ghi chú gửi kèm</p>
              <Textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={3}
                placeholder="Không bắt buộc"
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
            className="bg-background"
            onClick={() => {
              if (step === "info") onOpenChange(false);
              else setStep(step === "send" ? "pick" : "info");
            }}
          >
            {step === "info" ? (
              <>
                <X className="size-4" />
                Huỷ
              </>
            ) : (
              <>
                <ArrowLeft className="size-4" />
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
                  className="bg-background"
                  disabled={busy}
                  onClick={() => void finish(false)}
                >
                  Lưu nháp
                </Button>
                <Button
                  type="button"
                  disabled={busy || !recipientId}
                  onClick={() => void finish(true)}
                >
                  <Send className="size-4" />
                  Trình cấp trên
                </Button>
              </>
            ) : (
              <Button
                type="button"
                disabled={
                  step === "info"
                    ? !rangeValid || !title.trim()
                    : picked.size === 0
                }
                onClick={() => setStep(step === "info" ? "pick" : "send")}
              >
                Tiếp tục
                <ArrowRight className="size-4" />
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
