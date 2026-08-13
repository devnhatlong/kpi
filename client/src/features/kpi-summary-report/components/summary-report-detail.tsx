"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCheck,
  Download,
  Inbox,
  Loader2,
  LockOpen,
  Save,
  TriangleAlert,
  X,
} from "lucide-react";
import useSWR from "swr";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  fetchSummaryReport,
  finalizeSummaryReport,
  removeSummaryReportItems,
  reopenSummaryReport,
  summaryReportKeys,
  updateSummaryReport,
} from "@/features/kpi-summary-report/api";
import { SummaryAxisTable } from "@/features/kpi-summary-report/components/summary-axis-table";
import { exportSummaryReportToExcel } from "@/features/kpi-summary-report/excel";
import {
  canEditSummaryReport,
  countAxisRows,
  periodLabel,
  SUMMARY_REPORT_STATUS_LABEL,
  summaryReportStatusBadgeClass,
} from "@/features/kpi-summary-report/types";
import { getApiErrorMessage } from "@/lib/api-client";
import { cn } from "@/lib/utils";

type SummaryReportDetailProps = { reportId: string };

/**
 * Một báo cáo tổng: thông tin kỳ báo cáo + toàn bộ nhiệm vụ đã nhặt, gom theo
 * trục và dựng đúng mẫu bảng của từng trục. Còn nháp thì sửa và bỏ bớt được;
 * chốt rồi thì chỉ xem và xuất file.
 */
export function SummaryReportDetail({ reportId }: SummaryReportDetailProps) {
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  /** Bản nháp của ô nhập tiêu đề / kỳ / ghi chú; null = chưa sửa gì. */
  const [draft, setDraft] = useState<{
    title: string;
    fromDate: string;
    toDate: string;
    note: string;
  } | null>(null);

  const { data, error, isLoading, mutate } = useSWR(
    summaryReportKeys.detail(reportId),
    () => fetchSummaryReport(reportId),
  );

  const report = data?.report;
  const axes = useMemo(() => data?.axes ?? [], [data]);
  const editable = report ? canEditSummaryReport(report.status) : false;

  /** Offset số thứ tự để TT chạy liên tục qua các trục, không reset về 1. */
  const axisOffsets = useMemo(() => {
    const offsets: number[] = [];
    let running = 0;
    for (const axis of axes) {
      offsets.push(running);
      running += axis.groups.reduce((sum, group) => sum + group.rows.length, 0);
    }
    return offsets;
  }, [axes]);

  const form = draft ?? {
    title: report?.title ?? "",
    fromDate: report?.fromDate ?? "",
    toDate: report?.toDate ?? "",
    note: report?.note ?? "",
  };
  const patch = (next: Partial<typeof form>) => setDraft({ ...form, ...next });

  const doSave = async () => {
    if (!draft || !report) return;
    setBusy(true);
    try {
      await updateSummaryReport(report._id, {
        title: draft.title,
        fromDate: draft.fromDate,
        toDate: draft.toDate,
        note: draft.note,
      });
      toast.success("Đã lưu báo cáo tổng.");
      setDraft(null);
      await mutate();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không lưu được."));
    } finally {
      setBusy(false);
    }
  };

  const doRemoveItem = async (itemId: string) => {
    if (!report) return;
    setBusy(true);
    try {
      const result = await removeSummaryReportItems(report._id, [itemId]);
      toast.success(
        `Đã bỏ nhiệm vụ, báo cáo còn ${result.itemCount} nhiệm vụ.`,
      );
      await mutate();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không bỏ được nhiệm vụ."));
    } finally {
      setBusy(false);
    }
  };

  const doFinalize = async () => {
    if (!report) return;
    setBusy(true);
    try {
      await finalizeSummaryReport(report._id);
      toast.success("Đã chốt báo cáo tổng.");
      await mutate();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không chốt được báo cáo."));
    } finally {
      setBusy(false);
    }
  };

  const doReopen = async () => {
    if (!report) return;
    setBusy(true);
    try {
      await reopenSummaryReport(report._id);
      toast.success("Đã mở lại báo cáo để sửa.");
      await mutate();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không mở lại được báo cáo."));
    } finally {
      setBusy(false);
    }
  };

  const doExport = async () => {
    if (!report) return;
    setExporting(true);
    try {
      await exportSummaryReportToExcel(report, axes);
      toast.success("Đã xuất file Excel.");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không xuất được file."));
    } finally {
      setExporting(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 pt-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Đang tải báo cáo...
        </CardContent>
      </Card>
    );
  }

  if (error || !report) {
    return (
      <Card>
        <CardContent className="space-y-3 pt-6">
          <p className="text-sm text-destructive">
            {getApiErrorMessage(error, "Không tìm thấy báo cáo tổng.")}
          </p>
          <Button asChild size="sm" variant="outline">
            <Link href="/kpi/promote">
              <ArrowLeft className="size-3.5" />
              Về danh sách báo cáo
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-3">
        <Button asChild size="sm" variant="outline" className="bg-background">
          <Link href="/kpi/promote">
            <ArrowLeft className="size-4" />
            Danh sách
          </Link>
        </Button>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl font-semibold tracking-tight">
              {report.title}
            </h1>
            <Badge
              variant="secondary"
              className={cn(summaryReportStatusBadgeClass(report.status))}
            >
              {SUMMARY_REPORT_STATUS_LABEL[report.status]}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {periodLabel(report.fromDate, report.toDate)} · {countAxisRows(axes)}{" "}
            nhiệm vụ · {axes.length} trục · Người lập: {report.ownerName || "-"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => void doExport()}
            disabled={exporting}
          >
            <Download className="size-3.5" />
            {exporting ? "Đang xuất..." : "Xuất Excel"}
          </Button>
          {editable ? (
            <Button size="sm" onClick={() => void doFinalize()} disabled={busy}>
              <CheckCheck className="size-3.5" />
              Chốt báo cáo
            </Button>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void doReopen()}
              disabled={busy}
            >
              <LockOpen className="size-3.5" />
              Mở lại để sửa
            </Button>
          )}
        </div>
      </div>

      {data.missingCount > 0 ? (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-500" />
          <span>
            {data.missingCount} nhiệm vụ đã lưu trong báo cáo nhưng không còn
            trong hệ thống - có thể đã bị xoá sau khi đưa vào đây.
          </span>
        </div>
      ) : null}

      <Card>
        <CardContent className="space-y-3 pt-6">
          <div className="grid gap-3 md:grid-cols-[1fr_180px_180px]">
            <div className="space-y-1.5">
              <Label htmlFor="detail-title">Tên báo cáo</Label>
              <Input
                id="detail-title"
                value={form.title}
                disabled={!editable || busy}
                onChange={(e) => patch({ title: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="detail-from">Từ ngày</Label>
              <Input
                id="detail-from"
                type="date"
                value={form.fromDate}
                disabled={!editable || busy}
                onChange={(e) => patch({ fromDate: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="detail-to">Đến ngày</Label>
              <Input
                id="detail-to"
                type="date"
                value={form.toDate}
                disabled={!editable || busy}
                onChange={(e) => patch({ toDate: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="detail-note">Ghi chú</Label>
            <Textarea
              id="detail-note"
              rows={2}
              value={form.note}
              disabled={!editable || busy}
              onChange={(e) => patch({ note: e.target.value })}
              placeholder="Nội dung tóm tắt, nơi nhận..."
            />
          </div>
          {draft ? (
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setDraft(null)}
                disabled={busy}
              >
                Hoàn tác
              </Button>
              <Button size="sm" onClick={() => void doSave()} disabled={busy}>
                <Save className="size-3.5" />
                {busy ? "Đang lưu..." : "Lưu thay đổi"}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {axes.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Inbox className="size-8 text-muted-foreground" />
            <p className="text-sm font-medium">
              Báo cáo chưa có nhiệm vụ nào
            </p>
            <p className="max-w-md text-xs text-muted-foreground">
              Sang tab &quot;Chọn nhiệm vụ&quot; ở danh sách báo cáo để nhặt việc
              đã hoàn thành vào đây.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {axes.map((axis, index) => (
        <SummaryAxisTable
          key={`${axis.axisId}-${axis.template?.version ?? "live"}`}
          axis={axis}
          startIndex={axisOffsets[index] ?? 0}
          actionLabel={editable ? "Thao tác" : undefined}
          renderRowAction={
            editable
              ? (row) => (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                    onClick={() => void doRemoveItem(row._id)}
                    disabled={busy}
                    title="Bỏ nhiệm vụ này khỏi báo cáo"
                  >
                    <X className="size-3.5" />
                    Bỏ
                  </Button>
                )
              : undefined
          }
        />
      ))}
    </div>
  );
}
