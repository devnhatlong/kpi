"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Building2,
  CircleCheck,
  Download,
  FileText,
  Loader2,
  MoreHorizontal,
  PencilLine,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useQualityLevelMap } from "@/features/kpi-form-config/use-quality-levels";
import { useAxisTemplates } from "@/features/personal-kpi/use-axis-templates";
import { useScoreGroupMap } from "@/features/kpi-form-config/use-score-groups";
import {
  approveSummaryReport,
  deleteSummaryReport,
  fetchSummaryReport,
  returnSummaryReport,
  removeSummaryManualItem,
  removeSummaryReportItems,
  sendSummaryReport,
} from "@/features/kpi-summary-report/api";
import { ManualEntryDialog } from "@/features/kpi-summary-report/components/manual-entry-dialog";
import { mapPersonalKpiFromApi } from "@/features/personal-kpi/api";
import { ProgressUpdateDialog } from "@/features/personal-kpi/components/progress-update-dialog";
import { ReviewerEditDialog } from "@/features/personal-kpi/components/reviewer-edit-dialog";
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
  canDecideSummaryReport,
  canEditSummaryReport,
  periodLabel,
  SUMMARY_REPORT_STATUS_LABEL,
  summaryReportStatusBadgeClass,
  type SummaryManualItem,
  type SummaryReportDetail,
  type SummaryReportRole,
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
  /** Đang xem bản mình lập hay bản cấp dưới trình lên. */
  role: SummaryReportRole;
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
  role,
  onChanged,
  onDeleted,
}: SummaryReportPanelProps) {
  const [view, setView] = useState<ViewMode>("axis");
  const [pickOpen, setPickOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  /* Cấp trên mặc định ở chế độ ĐỌC; bật sửa mới hiện nút thêm / bớt. */
  const [reviewEdit, setReviewEdit] = useState(false);
  const [returnReason, setReturnReason] = useState("");
  /** Dòng tự nhập đang sửa; null = đang thêm mới. */
  const [manualEditing, setManualEditing] = useState<SummaryManualItem | null>(
    null,
  );
  /** Nhiệm vụ KPI đang mở chi tiết ngay trong báo cáo. */
  const [taskRow, setTaskRow] = useState<ReportEntry | null>(null);
  const [taskOpen, setTaskOpen] = useState(false);
  const [taskEditOpen, setTaskEditOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);

  const report = detail.report;
  const editable = canEditSummaryReport(report.status, role);
  const reviewing = role === "REVIEWER";
  const decidable = reviewing && canDecideSummaryReport(report.status);
  /** Nút thêm / bớt nhiệm vụ có hiện không. */
  const canEditNow = editable && (!reviewing || reviewEdit);

  const scoreGroupById = useScoreGroupMap();
  const qualityLevelById = useQualityLevelMap();
  /*
    Nhiệm vụ khoá bộ cột theo phiên bản mẫu lúc gửi, nhưng CÔNG THỨC tính điểm
    thì lấy theo mẫu đang áp dụng của trục - admin sửa công thức xong phải thấy
    báo cáo đổi theo, chứ không phải chờ gửi nhiệm vụ mới mới biết mình sửa gì.
  */
  const { byAxis } = useAxisTemplates();

  const content = useMemo(
    () =>
      buildReportContent(
        detail.axes,
        report.manualItems ?? [],
        { scoreGroups: scoreGroupById, qualityLevels: qualityLevelById },
        byAxis,
      ),
    [detail.axes, report.manualItems, scoreGroupById, qualityLevelById, byAxis],
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
          // Xem phẳng thì trộn mọi trục, không có công thức nào áp cho cả bảng.
          footer: null,
          entries: content.entries,
        },
      ];
    }
    return groupByAxis(content.entries, content.axisScores);
  }, [view, content]);

  /*
    Bấm một dòng: dòng KPI mở đúng hộp thoại chi tiết của nhiệm vụ (số liệu,
    điểm chỉ huy đã chốt, nhật ký theo ngày); dòng tự nhập mở thẳng form sửa vì
    nó không có nhiệm vụ nào đứng sau để mà xem.
  */
  const openEntry = (entry: ReportEntry) => {
    if (entry.kind === "MANUAL") {
      const manual = (report.manualItems ?? []).find(
        (item) => item._id === entry.manualId,
      );
      if (!manual) return;
      setManualEditing(manual);
      setManualOpen(true);
      return;
    }
    setTaskRow(entry);
    setTaskOpen(true);
  };

  /** Nhiệm vụ đang mở, quy về đúng kiểu của màn KPI cá nhân. */
  const taskItem = useMemo(
    () => (taskRow?.row ? mapPersonalKpiFromApi(taskRow.row) : null),
    [taskRow],
  );

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

  const doApprove = async () => {
    setBusy(true);
    try {
      await approveSummaryReport(report._id);
      toast.success("Đã duyệt báo cáo tổng hợp.");
      await onChanged();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không duyệt được báo cáo."));
    } finally {
      setBusy(false);
    }
  };

  const doReturn = async () => {
    const reason = returnReason.trim();
    if (!reason) {
      toast.error("Lý do trả lại là bắt buộc.");
      return;
    }
    setBusy(true);
    try {
      await returnSummaryReport(report._id, reason);
      toast.success("Đã trả lại báo cáo cho người lập.");
      setReturnOpen(false);
      setReturnReason("");
      await onChanged();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không trả lại được báo cáo."));
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

  /**
   * File xuất ra phải là số của LÚC BẤM, không phải bản đang nằm trong bộ nhớ
   * đệm: báo cáo có thể vừa bị cấp trên sửa, hoặc mở từ hôm qua chưa nạp lại.
   * Nạp lại một lượt rồi mới dựng file; khác với bản trên màn hình thì đồng bộ
   * luôn màn hình, không để người dùng cầm file lệch với thứ họ đang nhìn.
   */
  const doExport = async () => {
    setExporting(true);
    try {
      const fresh = await fetchSummaryReport(report._id);
      await exportSummaryReportToExcel(fresh.report, fresh.axes);
      const stale = fresh.report.updatedAt !== report.updatedAt;
      if (stale) await onChanged();
      toast.success(
        stale
          ? "Đã xuất file Excel theo số liệu mới nhất - báo cáo trên màn hình cũng vừa được nạp lại."
          : "Đã xuất file Excel.",
      );
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
                <p className={cn("text-xs", kpiTone.warning.text)}>
                  Đã trình {report.sentToName}
                  {report.sentAt
                    ? ` lúc ${formatServerHm(report.sentAt)} ${formatYmd(serverYmd(report.sentAt))}`
                    : ""}
                  {" · đang chờ duyệt"}
                </p>
              ) : null}
              {report.status === "APPROVED" ? (
                <p className={cn("text-xs", kpiTone.success.text)}>
                  {report.decidedByName || "Cấp trên"} đã duyệt
                  {report.decidedAt
                    ? ` lúc ${formatServerHm(report.decidedAt)} ${formatYmd(serverYmd(report.decidedAt))}`
                    : ""}
                </p>
              ) : null}
              {/* Duyệt là hết đời bản của cấp dưới. Nói thẳng bước tiếp theo ở
                  đây, không thì cấp trên ngồi tìm nút "gửi lên trên" không có. */}
              {reviewing && report.status === "APPROVED" ? (
                <p className="text-xs text-muted-foreground">
                  Muốn báo cáo lên cấp trên thì{" "}
                  <Link
                    href="/kpi/promote"
                    className="font-medium underline underline-offset-2"
                  >
                    lập bản tổng hợp của cấp mình
                  </Link>{" "}
                  - các nhiệm vụ trong bản này vẫn nhặt lại được.
                </p>
              ) : null}
            </div>

            {/*
              Một nút chính cho việc chính, phần còn lại vào menu "...". Cấp
              trên vào đây để QUYẾT, nên "Duyệt" đứng ngoài; xuất file, sửa nội
              dung, xoá là việc phụ - bày ngang hàng thì nút nào cũng như nút
              nào, mắt không biết bấm đâu.
            */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Cấp trên đang giữ bản trình: duyệt hoặc trả lại. Người lập:
                  trình bản của mình lên. Duyệt xong là hết đời bản đó - cấp
                  trên muốn báo cáo tiếp thì lập bản của cấp mình. */}
              {decidable ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    className="border-rose-300 bg-background text-rose-600 hover:border-rose-400 hover:bg-rose-50 hover:text-rose-700 dark:border-rose-900 dark:text-rose-400"
                    disabled={busy}
                    onClick={() => setReturnOpen(true)}
                  >
                    <Undo2 className="size-4" />
                    Trả lại
                  </Button>
                  <Button
                    type="button"
                    disabled={busy}
                    onClick={() => void doApprove()}
                  >
                    <CircleCheck className="size-4" />
                    Duyệt báo cáo
                  </Button>
                </>
              ) : reviewing ? null : editable ? (
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => setSendOpen(true)}
                >
                  <Send className="size-4" />
                  {report.status === "RETURNED"
                    ? "Trình lại cấp trên"
                    : "Gửi lên cấp trên"}
                </Button>
              ) : null}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-9"
                    aria-label="Thao tác khác"
                  >
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {/* Cấp trên sửa bản trình phải bật hẳn chế độ sửa: mặc định
                      là đọc để quyết, không phải để nghịch vào bản của cấp
                      dưới. */}
                  {reviewing && canEditSummaryReport(report.status, role) ? (
                    <DropdownMenuItem
                      onSelect={() => setReviewEdit((prev) => !prev)}
                    >
                      <PencilLine className="size-4" />
                      {reviewEdit ? "Xong, thôi sửa" : "Sửa nội dung"}
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuItem
                    onSelect={() => void doExport()}
                    disabled={exporting}
                  >
                    <Download className="size-4" />
                    {exporting ? "Đang xuất..." : "Xuất Excel"}
                  </DropdownMenuItem>
                  {!reviewing && editable ? (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onSelect={() => setDeleteOpen(true)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="size-4" />
                        Xoá báo cáo
                      </DropdownMenuItem>
                    </>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Đang sửa bản của cấp dưới thì phải nhắc liên tục - sửa xong bấm
              "Xong" để về lại chế độ đọc. */}
          {reviewing && reviewEdit ? (
            <div
              className={cn(
                "flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2.5 text-xs",
                kpiTone.warning.soft,
              )}
            >
              <span className="flex items-center gap-2">
                <PencilLine className="size-4 shrink-0" />
                Đang sửa bản trình của {report.ownerName || "cấp dưới"} - thêm,
                bớt nhiệm vụ đều ghi vào nhật ký báo cáo.
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="bg-background"
                onClick={() => setReviewEdit(false)}
              >
                Xong
              </Button>
            </div>
          ) : null}

          {/* Bị trả lại thì lý do phải nằm ngay đầu báo cáo, không bắt người
              lập đi lục nhật ký mới biết phải sửa gì. */}
          {report.status === "RETURNED" && report.returnReason ? (
            <div
              className={cn(
                "flex items-start gap-2 rounded-lg border p-2.5 text-xs",
                kpiTone.danger.soft,
              )}
            >
              <Undo2 className="mt-0.5 size-4 shrink-0" />
              <span>
                <span className="font-medium">
                  {report.decidedByName || "Cấp trên"} trả lại
                  {report.decidedAt
                    ? ` lúc ${formatServerHm(report.decidedAt)} ${formatYmd(serverYmd(report.decidedAt))}`
                    : ""}
                  :{" "}
                </span>
                {report.returnReason}
              </span>
            </div>
          ) : null}

          {reviewing && report.sentNote ? (
            <div
              className={cn(
                "flex items-start gap-2 rounded-lg border p-2.5 text-xs",
                kpiTone.info.soft,
              )}
            >
              <Send className="mt-0.5 size-4 shrink-0" />
              <span>
                <span className="font-medium">
                  Lời trình của {report.ownerName || "cấp dưới"}:{" "}
                </span>
                {report.sentNote}
              </span>
            </div>
          ) : null}

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
            {canEditNow ? (
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
                  onClick={() => {
                    setManualEditing(null);
                    setManualOpen(true);
                  }}
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
            editable={canEditNow}
            onOpen={openEntry}
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
        item={manualEditing}
        onAdded={onChanged}
      />

      {/* Chi tiết một nhiệm vụ KPI ngay trong báo cáo - chỉ đọc, có đường sang
          form sửa nếu người xem còn quyền sửa báo cáo. */}
      <ProgressUpdateDialog
        open={taskOpen}
        item={taskItem}
        template={taskRow?.template ?? null}
        readOnly
        onOpenChange={setTaskOpen}
        onSaved={onChanged}
        onEdit={
          canEditNow
            ? () => {
                setTaskOpen(false);
                setTaskEditOpen(true);
              }
            : undefined
        }
      />

      <ReviewerEditDialog
        open={taskEditOpen}
        item={taskItem}
        onOpenChange={setTaskEditOpen}
        /* Sửa xong nạp lại báo cáo rồi mở lại chi tiết của đúng nhiệm vụ đó. */
        onSaved={async () => {
          await onChanged();
          setTaskOpen(true);
        }}
      />

      <SendRecipientDialog
        open={sendOpen}
        onOpenChange={setSendOpen}
        title="Trình báo cáo tổng hợp"
        description="Chọn cấp trên nhận báo cáo. Trình xong là khoá - sai thì chờ cấp trên trả lại."
        confirmLabel="Gửi lên cấp trên"
        submitting={busy}
        onConfirm={(payload) =>
          doSend({ recipientId: payload.recipientId, note: payload.note })
        }
      />

      <Dialog
        open={returnOpen}
        onOpenChange={(open) => {
          if (!busy) setReturnOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Trả lại báo cáo</DialogTitle>
            <DialogDescription>
              Báo cáo quay về chỗ {report.ownerName || "người lập"} ở trạng thái
              &quot;Bị trả lại&quot;. Lý do hiện ngay đầu báo cáo và trong nhật
              ký.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="summary-return-reason">
              Lý do trả lại <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="summary-return-reason"
              className="min-h-[88px]"
              placeholder="Thiếu nhiệm vụ nào, sai số ở đâu..."
              value={returnReason}
              maxLength={1000}
              disabled={busy}
              onChange={(event) => setReturnReason(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="bg-background"
              onClick={() => setReturnOpen(false)}
              disabled={busy}
            >
              Huỷ
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void doReturn()}
              disabled={busy || !returnReason.trim()}
            >
              <Undo2 className="size-4" />
              {busy ? "Đang gửi..." : "Trả lại"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
