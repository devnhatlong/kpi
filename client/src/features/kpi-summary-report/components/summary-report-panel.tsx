"use client";

import { useMemo, useState } from "react";
import {
  Building2,
  CircleCheck,
  Download,
  FileText,
  Loader2,
  Plus,
  Send,
  Trash2,
  TriangleAlert,
  Trophy,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";

import { SegmentedTabs } from "@/components/common/segmented-tabs";
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
import { useQualityLevelMap } from "@/features/kpi-form-config/use-quality-levels";
import { useScoreGroupMap } from "@/features/kpi-form-config/use-score-groups";
import {
  deleteSummaryReport,
  recallSummaryReport,
  removeSummaryManualItem,
  removeSummaryReportItems,
  sendSummaryReport,
} from "@/features/kpi-summary-report/api";
import { ManualEntryDialog } from "@/features/kpi-summary-report/components/manual-entry-dialog";
import { PickCompletedDialog } from "@/features/kpi-summary-report/components/pick-completed-dialog";
import { SummaryEntriesTable } from "@/features/kpi-summary-report/components/summary-entries-table";
import { exportSummaryReportToExcel } from "@/features/kpi-summary-report/excel";
import {
  buildReportContent,
  groupByAxis,
  groupByDepartment,
  type ReportEntry,
} from "@/features/kpi-summary-report/report-entries";
import {
  canEditSummaryReport,
  periodLabel,
  SUMMARY_REPORT_STATUS_LABEL,
  summaryReportStatusBadgeClass,
  type SummaryReportDetail,
} from "@/features/kpi-summary-report/types";
import { formatScoreNumber } from "@/features/personal-kpi/board-cell";
import { SendRecipientDialog } from "@/features/personal-kpi/components/send-recipient-dialog";
import { kpiTone } from "@/features/personal-kpi/status-styles";
import { getApiErrorMessage } from "@/lib/api-client";
import { formatServerHm, formatYmd, serverYmd } from "@/lib/server-time";
import { cn } from "@/lib/utils";

type ViewMode = "axis" | "department" | "flat";

const VIEW_TABS: Array<{ value: ViewMode; label: string }> = [
  { value: "axis", label: "Theo trục" },
  { value: "department", label: "Theo đơn vị" },
  { value: "flat", label: "Danh sách" },
];

/** Ô số ở đầu báo cáo. */
function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = kpiTone.info,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: typeof FileText;
  tone?: (typeof kpiTone)[keyof typeof kpiTone];
}) {
  return (
    <Card className="border-border/80 shadow-sm">
      <CardContent className="flex items-center gap-3 p-4">
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-lg",
            tone.icon,
          )}
        >
          <Icon className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-semibold tracking-tight tabular-nums">
            {value}
          </p>
          {hint ? (
            <p className="text-xs text-muted-foreground">{hint}</p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

/** Một mốc trong nhật ký báo cáo. */
function LogRow({
  at,
  message,
  byName,
  tone,
}: {
  at: string;
  message: string;
  byName: string;
  tone: string;
}) {
  return (
    <li className="relative pl-6">
      <span
        className={cn(
          "absolute top-1.5 left-0 size-2.5 rounded-full border-2 bg-background",
          tone,
        )}
      />
      <p className="text-xs text-muted-foreground">
        {formatYmd(serverYmd(at))} · {formatServerHm(at)}
        {byName ? ` · ${byName}` : ""}
      </p>
      <p className="text-sm">{message}</p>
    </li>
  );
}

type SummaryReportPanelProps = {
  detail: SummaryReportDetail;
  loading: boolean;
  /** Nạp lại chi tiết + danh sách sau mỗi thay đổi. */
  onChanged: () => void | Promise<void>;
  /** Báo cáo vừa bị xoá - cột trái phải bỏ chọn nó đi. */
  onDeleted: () => void | Promise<void>;
};

/**
 * Cột phải: toàn bộ một báo cáo tổng hợp.
 *
 * Nhiệm vụ trong báo cáo xem được theo trục, theo đơn vị hoặc dạng danh sách -
 * cùng một bộ dòng, chỉ khác cách gom. Điểm ở tiêu đề nhóm trục là điểm quy đổi
 * của trục (tính trên tổng cột), không phải tổng mấy ô "Điểm" bên dưới.
 */
export function SummaryReportPanel({
  detail,
  loading,
  onChanged,
  onDeleted,
}: SummaryReportPanelProps) {
  const [view, setView] = useState<ViewMode>("axis");
  const [pickOpen, setPickOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);

  const report = detail.report;
  const editable = canEditSummaryReport(report.status);

  const scoreGroupById = useScoreGroupMap();
  const qualityLevelById = useQualityLevelMap();

  const content = useMemo(
    () =>
      buildReportContent(detail.axes, report.manualItems ?? [], {
        scoreGroups: scoreGroupById,
        qualityLevels: qualityLevelById,
      }),
    [detail.axes, report.manualItems, scoreGroupById, qualityLevelById],
  );

  const groups = useMemo(() => {
    if (view === "department") return groupByDepartment(content.entries);
    if (view === "flat") {
      return [
        {
          key: "flat",
          label: "",
          score: null,
          maxScore: null,
          entries: content.entries,
        },
      ];
    }
    return groupByAxis(content.entries, content.axisScores);
  }, [view, content]);

  const removeEntry = async (entry: ReportEntry) => {
    setBusy(true);
    try {
      if (entry.kind === "MANUAL" && entry.manualId) {
        await removeSummaryManualItem(report._id, entry.manualId);
      } else if (entry.itemId) {
        await removeSummaryReportItems(report._id, [entry.itemId]);
      }
      toast.success("Đã bỏ nhiệm vụ khỏi báo cáo.");
      await onChanged();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không bỏ được nhiệm vụ."));
    } finally {
      setBusy(false);
    }
  };

  const doSend = async (payload: { recipientId: string; note?: string }) => {
    setBusy(true);
    try {
      await sendSummaryReport(report._id, payload);
      toast.success("Đã trình báo cáo lên cấp trên.");
      setSendOpen(false);
      await onChanged();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không gửi được báo cáo."));
    } finally {
      setBusy(false);
    }
  };

  const doRecall = async () => {
    setBusy(true);
    try {
      await recallSummaryReport(report._id);
      toast.success("Đã thu hồi báo cáo về trạng thái đang soạn.");
      await onChanged();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không thu hồi được báo cáo."));
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async () => {
    setBusy(true);
    try {
      await deleteSummaryReport(report._id);
      toast.success(`Đã xoá "${report.title}".`);
      setDeleteOpen(false);
      await onDeleted();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không xoá được báo cáo."));
    } finally {
      setBusy(false);
    }
  };

  const doExport = async () => {
    setExporting(true);
    try {
      await exportSummaryReportToExcel(report, detail.axes);
      toast.success("Đã xuất file Excel.");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không xuất được file."));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-xl font-semibold tracking-tight">
                  {report.title}
                </h2>
                <Badge
                  variant="secondary"
                  className={cn(
                    "font-normal",
                    summaryReportStatusBadgeClass(report.status),
                  )}
                >
                  {SUMMARY_REPORT_STATUS_LABEL[report.status]}
                </Badge>
                {loading ? (
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge
                  variant="secondary"
                  className={cn("font-normal", kpiTone.neutral.soft)}
                >
                  {report.scopeName || "Chưa đặt phạm vi"}
                </Badge>
                <span>
                  Kỳ {periodLabel(report.fromDate, report.toDate)} · Tạo{" "}
                  {formatYmd(serverYmd(report.createdAt))} ·{" "}
                  {report.ownerName || "-"}
                </span>
              </div>
              {report.status === "SENT" && report.sentToName ? (
                <p className={cn("text-xs", kpiTone.success.text)}>
                  Đã trình {report.sentToName}
                  {report.sentAt
                    ? ` lúc ${formatServerHm(report.sentAt)} ${formatYmd(serverYmd(report.sentAt))}`
                    : ""}
                </p>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                className="bg-background"
                onClick={() => void doExport()}
                disabled={exporting}
              >
                <Download className="size-4" />
                {exporting ? "Đang xuất..." : "Xuất Excel"}
              </Button>
              {editable ? (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    title="Xoá báo cáo"
                    disabled={busy}
                    onClick={() => setDeleteOpen(true)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    disabled={busy}
                    onClick={() => setSendOpen(true)}
                  >
                    <Send className="size-4" />
                    Gửi lên cấp trên
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void doRecall()}
                >
                  <Undo2 className="size-4" />
                  Thu hồi để sửa
                </Button>
              )}
            </div>
          </div>

          {detail.missingCount > 0 ? (
            <div
              className={cn(
                "flex items-start gap-2 rounded-lg border p-2.5 text-xs",
                kpiTone.warning.soft,
              )}
            >
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              {detail.missingCount} nhiệm vụ đã lưu trong báo cáo nhưng không
              còn trong hệ thống - có thể đã bị xoá sau khi đưa vào đây.
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Nhiệm vụ trong báo cáo"
          value={String(content.stats.entryCount)}
          icon={FileText}
        />
        <StatCard
          label="KPI cá nhân / Tự nhập"
          value={`${content.stats.kpiCount} / ${content.stats.manualCount}`}
          icon={CircleCheck}
          tone={kpiTone.success}
        />
        <StatCard
          label="Tổng điểm đã chốt"
          value={formatScoreNumber(content.stats.totalScore)}
          hint={
            content.stats.manualScore
              ? `Gồm ${formatScoreNumber(content.stats.manualScore)} điểm việc tự nhập`
              : `Điểm quy đổi của ${content.stats.axisCount} trục`
          }
          icon={Trophy}
          tone={kpiTone.warning}
        />
        <StatCard
          label="Đơn vị góp mặt"
          value={String(content.stats.departmentCount)}
          icon={Building2}
          tone={kpiTone.neutral}
        />
      </div>

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm font-semibold">Nhiệm vụ trong báo cáo</p>
              <SegmentedTabs
                items={VIEW_TABS}
                value={view}
                onChange={setView}
                ariaLabel="Cách xem nhiệm vụ trong báo cáo"
              />
            </div>
            {editable ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="bg-background"
                  disabled={busy}
                  onClick={() => setPickOpen(true)}
                >
                  <CircleCheck className="size-4" />
                  Chọn nhiệm vụ hoàn thành
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="bg-background"
                  disabled={busy}
                  onClick={() => setManualOpen(true)}
                >
                  <Plus className="size-4" />
                  Thêm nhiệm vụ tự nhập
                </Button>
              </div>
            ) : null}
          </div>

          <SummaryEntriesTable
            groups={groups}
            grouped={view !== "flat"}
            /* Xem theo trục thì tiêu đề nhóm đã nói trục rồi, bỏ cột đi cho
               gọn; hai cách xem kia không có gì nói thay nên phải giữ. */
            showAxis={view !== "axis"}
            editable={editable}
            busy={busy}
            onRemove={(entry) => void removeEntry(entry)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <p className="text-sm font-semibold">Nhật ký báo cáo</p>
          {report.logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Chưa có hoạt động nào.
            </p>
          ) : (
            <ul className="space-y-3">
              {[...report.logs]
                .slice()
                .reverse()
                .map((log, index) => (
                  <LogRow
                    key={`${log.at}-${index}`}
                    at={log.at}
                    message={log.message}
                    byName={log.byName}
                    tone={
                      log.type === "SEND"
                        ? "border-emerald-500"
                        : log.type === "RECALL"
                          ? "border-amber-500"
                          : "border-sky-500"
                    }
                  />
                ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <PickCompletedDialog
        open={pickOpen}
        onOpenChange={setPickOpen}
        reportId={report._id}
        onAdded={onChanged}
      />

      <ManualEntryDialog
        open={manualOpen}
        onOpenChange={setManualOpen}
        reportId={report._id}
        onAdded={onChanged}
      />

      <SendRecipientDialog
        open={sendOpen}
        onOpenChange={setSendOpen}
        title="Trình báo cáo tổng hợp"
        description="Chọn cấp trên nhận báo cáo. Gửi xong báo cáo bị khoá, muốn sửa thì thu hồi."
        confirmLabel="Gửi lên cấp trên"
        submitting={busy}
        onConfirm={(payload) =>
          doSend({ recipientId: payload.recipientId, note: payload.note })
        }
      />

      <Dialog
        open={deleteOpen}
        onOpenChange={(open) => !busy && setDeleteOpen(open)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Xoá báo cáo tổng hợp</DialogTitle>
            <DialogDescription>
              Xoá &quot;{report.title}&quot;? Các nhiệm vụ bên trong không bị
              ảnh hưởng, chúng quay lại kho để nhặt vào báo cáo khác.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="bg-background"
              onClick={() => setDeleteOpen(false)}
              disabled={busy}
            >
              Huỷ
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void doDelete()}
              disabled={busy}
            >
              {busy ? "Đang xoá..." : "Xoá"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
