"use client";

import { Fragment, useMemo, useState } from "react";
import {
  CircleCheck,
  ClipboardCheck,
  FileText,
  Loader2,
  Send,
  SquarePen,
} from "lucide-react";
import useSWR from "swr";
import { toast } from "sonner";

import { SearchableSelect } from "@/components/common/searchable-select";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/features/auth/auth-provider";
import {
  createSummaryReport,
  sendSummaryReport,
} from "@/features/kpi-summary-report/api";
import {
  ManualDraftList,
  toManualItemInput,
  type SummaryManualDraft,
} from "@/features/kpi-summary-report/components/manual-draft-list";
import { SummaryCandidatePicker } from "@/features/kpi-summary-report/components/summary-candidate-picker";
import { periodLabel } from "@/features/kpi-summary-report/types";
import { fetchPersonalKpiRecipients } from "@/features/personal-kpi/api";
import { fetchDepartments } from "@/features/organization/api";
import { kpiTone } from "@/features/personal-kpi/status-styles";
import { getApiErrorMessage } from "@/lib/api-client";
import { currentWeekRange, serverYmd } from "@/lib/server-time";
import { cn } from "@/lib/utils";

const STEPS = [
  { key: "info", label: "Thông tin", icon: FileText },
  { key: "pick", label: "Nội dung báo cáo", icon: ClipboardCheck },
  { key: "send", label: "Trình cấp trên", icon: Send },
] as const;

type StepKey = (typeof STEPS)[number]["key"];

/** Hai lối đưa việc vào báo cáo - dùng được cả hai trong cùng một báo cáo. */
type SourceKey = "completed" | "manual";

const NO_SCOPE = "__none__";
const DEFAULT_SEND_NOTE = "Kính gửi";

/** "Báo cáo tổng hợp ngày 22/08/2026" - ngày lấy theo giờ server. */
function defaultTitle(ymd: string): string {
  const [y, m, d] = ymd.split("-");
  return `Báo cáo tổng hợp ngày ${d}/${m}/${y}`;
}

type CreateReportWizardProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Gọi sau khi tạo xong, kèm id để mở đúng báo cáo vừa lập. */
  onCreated: (reportId: string) => void | Promise<void>;
};

/**
 * Trình tạo báo cáo tổng hợp: khai thông tin → dựng nội dung → trình cấp trên.
 *
 * Nội dung đến từ hai lối, dùng được cả hai trong cùng một báo cáo: chọn việc
 * cấp dưới đã hoàn thành, và tự khai việc theo trục. Lối thứ hai không phải cho
 * đủ bộ - việc của chính đơn vị, việc phối hợp, việc đột xuất không đi qua KPI
 * cá nhân nên không có gì để mà chọn, mà báo cáo thì vẫn phải nói tới chúng.
 *
 * Báo cáo chỉ được ghi xuống ở bước cuối, trong một lần gọi kèm cả hai danh
 * sách - bỏ dở giữa chừng thì không để lại báo cáo rỗng nào cho người dùng dọn.
 * Bước cuối vẫn cho phép lưu lại để soạn tiếp, vì không phải lúc nào lập xong
 * cũng trình đi ngay.
 */
export function CreateReportWizard({
  open,
  onOpenChange,
  onCreated,
}: CreateReportWizardProps) {
  const { user } = useAuth();
  const [step, setStep] = useState<StepKey>("info");
  const [source, setSource] = useState<SourceKey>("completed");
  const [title, setTitle] = useState("");
  const [scopeId, setScopeId] = useState(NO_SCOPE);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drafts, setDrafts] = useState<SummaryManualDraft[]>([]);
  const [recipientId, setRecipientId] = useState("");
  const [sendNote, setSendNote] = useState(DEFAULT_SEND_NOTE);
  const [busy, setBusy] = useState(false);

  const { data: departments = [] } = useSWR(
    ["departments", "all", "kpi-summary"],
    fetchDepartments,
  );
  const { data: recipients } = useSWR(
    open ? ["personal-kpi", "recipients", "kpi-summary"] : null,
    () => fetchPersonalKpiRecipients(),
  );

  /*
    Mỗi lần mở là một bản nháp mới: đặt lại ngay trong render chứ không dùng
    effect, để bước 1 không chớp qua dữ liệu của lần lập trước.
  */
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      const week = currentWeekRange();
      setStep("info");
      setSource("completed");
      setTitle(defaultTitle(serverYmd()));
      setScopeId(user?.departmentId || NO_SCOPE);
      setFromDate(week.from);
      setToDate(week.to);
      setSelected(new Set());
      setDrafts([]);
      setRecipientId("");
      setSendNote(DEFAULT_SEND_NOTE);
    }
  }

  /** Chỉ đơn vị của tôi và cấp dưới - server cũng chặn đúng nhánh này. */
  const scopeOptions = useMemo(() => {
    const mine = user?.departmentId ?? "";
    const branch = mine
      ? departments.filter(
          (department) =>
            department._id === mine || department.ancestors?.includes(mine),
        )
      : departments;
    return [
      { value: NO_SCOPE, label: "Không đặt phạm vi" },
      ...branch.map((department) => ({
        value: department._id,
        label: department.name,
      })),
    ];
  }, [departments, user?.departmentId]);

  const recipientOptions = useMemo(
    () =>
      (recipients?.people ?? []).map((person) => ({
        value: person.id,
        label: person.departmentName
          ? `${person.fullName} · ${person.departmentName}`
          : person.fullName,
      })),
    [recipients],
  );

  const canContinue = title.trim().length > 0;
  const totalItems = selected.size + drafts.length;

  /** Ghi báo cáo xuống; `andSend` thì trình luôn cho cấp trên đã chọn. */
  const submit = async (andSend: boolean) => {
    if (!canContinue) {
      toast.error("Tên báo cáo là bắt buộc.");
      return;
    }
    if (andSend && !recipientId) {
      toast.error("Chọn cấp trên nhận báo cáo.");
      return;
    }

    setBusy(true);
    try {
      const report = await createSummaryReport({
        title: title.trim(),
        fromDate,
        toDate,
        scopeDepartmentId: scopeId === NO_SCOPE ? undefined : scopeId,
        itemIds: [...selected],
        manualItems: drafts.map(toManualItemInput),
      });

      if (andSend) {
        await sendSummaryReport(report._id, {
          recipientId,
          note: sendNote.trim() || undefined,
        });
        toast.success("Đã tạo và trình báo cáo lên cấp trên.");
      } else {
        toast.success("Đã tạo báo cáo tổng hợp.");
      }

      await onCreated(report._id);
      onOpenChange(false);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không tạo được báo cáo."));
    } finally {
      setBusy(false);
    }
  };

  const stepIndex = STEPS.findIndex((item) => item.key === step);

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      {/*
        Rộng và cao hẳn: bước "Nội dung báo cáo" vừa có form khai vừa có danh
        sách bên dưới, khung hẹp thì hai thứ chen nhau, mỗi thứ còn một mẩu.
        Cao tối đa 90vh và cho phần thân tự cuộn - thanh bước ở trên và hai nút
        ở dưới đứng yên, không bị đẩy khuất khi mở form khai.
      */}
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Tạo báo cáo tổng hợp</DialogTitle>
        </DialogHeader>

        {/*
          Thanh bước - nói rõ đang ở đâu và còn gì phía trước.

          Nhãn và vạch nối là anh em cùng một hàng, chỉ vạch nối mới co giãn:
          bọc mỗi bước vào một khối rộng bằng nhau thì vạch nối chỉ còn phần
          thừa sau nhãn, nhãn dài ngắn khác nhau là vạch cũng dài ngắn khác
          nhau.
        */}
        <div className="flex items-center gap-3">
          {STEPS.map((item, index) => {
            const Icon = item.icon;
            const active = index === stepIndex;
            const done = index < stepIndex;
            return (
              <Fragment key={item.key}>
                <span
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 whitespace-nowrap text-sm",
                    active
                      ? "font-medium text-foreground"
                      : done
                        ? kpiTone.success.text
                        : "text-muted-foreground",
                  )}
                >
                  <Icon className="size-4" />
                  {item.label}
                </span>
                {index < STEPS.length - 1 ? (
                  <span
                    className={cn(
                      "h-px min-w-6 flex-1",
                      done ? "bg-emerald-500/60" : "bg-border",
                    )}
                  />
                ) : null}
              </Fragment>
            );
          })}
        </div>

        {/* Thân bước là vùng cuộn duy nhất; -mr-2 pr-2 để thanh cuộn nằm gọn
            trong lề sẵn có của hộp thoại, không đè lên nội dung. */}
        <div className="-mr-2 min-h-0 flex-1 overflow-y-auto pr-2">
          {step === "info" ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="wizard-title">
                  Tên báo cáo <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="wizard-title"
                  value={title}
                  maxLength={300}
                  onChange={(event) => setTitle(event.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Phạm vi tổng hợp</Label>
                <SearchableSelect
                  value={scopeId}
                  onValueChange={setScopeId}
                  options={scopeOptions}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="wizard-from">Từ ngày</Label>
                  <Input
                    id="wizard-from"
                    type="date"
                    value={fromDate}
                    onChange={(event) => setFromDate(event.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="wizard-to">Đến ngày</Label>
                  <Input
                    id="wizard-to"
                    type="date"
                    value={toDate}
                    onChange={(event) => setToDate(event.target.value)}
                  />
                </div>
              </div>

              <p
                className={cn(
                  "rounded-lg border p-3 text-xs",
                  kpiTone.info.soft,
                )}
              >
                Bước sau chọn nội dung báo cáo: lấy việc cấp dưới đã được chỉ
                huy xác nhận hoàn thành, hoặc tự khai việc của đơn vị theo trục
                - dùng được cả hai.
              </p>
            </div>
          ) : null}

          {/*
          Hai lối đưa việc vào báo cáo nằm cạnh nhau chứ không phải chọn một rồi
          thôi: đếm số việc ngay trên nhãn tab để đang đứng ở lối này vẫn thấy
          lối kia đã có gì.
        */}
          {step === "pick" ? (
            <Tabs
              value={source}
              onValueChange={(next) => setSource(next as SourceKey)}
            >
              <TabsList>
                <TabsTrigger value="completed">
                  <CircleCheck className="mr-1.5 size-4" />
                  Việc cấp dưới hoàn thành
                  {selected.size ? (
                    <span className="ml-1.5 text-muted-foreground">
                      · {selected.size}
                    </span>
                  ) : null}
                </TabsTrigger>
                <TabsTrigger value="manual">
                  <SquarePen className="mr-1.5 size-4" />
                  Tự khai theo trục
                  {drafts.length ? (
                    <span className="ml-1.5 text-muted-foreground">
                      · {drafts.length}
                    </span>
                  ) : null}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="completed">
                {/* Cao theo màn hình chứ không chốt px: màn lớn thì thấy được
                  nhiều dòng hơn, màn nhỏ vẫn còn chỗ cho thanh bước và nút. */}
                <SummaryCandidatePicker
                  selected={selected}
                  onChange={setSelected}
                  listClassName="max-h-[46vh]"
                />
              </TabsContent>

              <TabsContent value="manual">
                <ManualDraftList drafts={drafts} onChange={setDrafts} />
              </TabsContent>
            </Tabs>
          ) : null}

          {step === "send" ? (
            <div className="space-y-3">
              <div className="rounded-lg border p-3 text-sm">
                <p className="font-medium">{title.trim() || "Chưa đặt tên"}</p>
                <p className="text-xs text-muted-foreground">
                  {scopeOptions.find((option) => option.value === scopeId)
                    ?.label ?? "Không đặt phạm vi"}{" "}
                  · {periodLabel(fromDate, toDate)} · {totalItems} nhiệm vụ
                  {drafts.length
                    ? ` (${selected.size} từ cấp dưới, ${drafts.length} tự khai)`
                    : ""}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label>Cấp trên nhận báo cáo</Label>
                <SearchableSelect
                  value={recipientId}
                  onValueChange={setRecipientId}
                  options={recipientOptions}
                  placeholder={
                    recipientOptions.length
                      ? "Chọn cấp trên..."
                      : "Không có cấp trên nào trong phạm vi của bạn"
                  }
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="wizard-send-note">Lời trình gửi kèm</Label>
                <Textarea
                  id="wizard-send-note"
                  rows={3}
                  value={sendNote}
                  maxLength={1000}
                  onChange={(event) => setSendNote(event.target.value)}
                />
              </div>

              <p className="text-xs text-muted-foreground">
                Chưa muốn trình ngay thì bấm &quot;Lưu để soạn tiếp&quot; - báo
                cáo nằm ở mục Đang soạn, thêm bớt nhiệm vụ thoải mái rồi trình
                sau.
              </p>
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            disabled={busy || stepIndex === 0}
            onClick={() => setStep(STEPS[Math.max(0, stepIndex - 1)]!.key)}
          >
            Quay lại
          </Button>

          <div className="flex gap-2">
            {step === "send" ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  className="bg-background"
                  disabled={busy}
                  onClick={() => void submit(false)}
                >
                  {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                  Lưu để soạn tiếp
                </Button>
                <Button
                  type="button"
                  disabled={busy || !recipientId}
                  onClick={() => void submit(true)}
                >
                  <Send className="size-4" />
                  {busy ? "Đang gửi..." : "Tạo và trình cấp trên"}
                </Button>
              </>
            ) : (
              <Button
                type="button"
                disabled={busy || !canContinue}
                onClick={() =>
                  setStep(STEPS[Math.min(STEPS.length - 1, stepIndex + 1)]!.key)
                }
              >
                Tiếp tục
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
