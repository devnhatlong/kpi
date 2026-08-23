"use client";

import { useMemo, useState } from "react";
import { FileSpreadsheet, FileText, Loader2, Plus } from "lucide-react";
import useSWR, { useSWRConfig } from "swr";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  fetchSummaryReport,
  fetchSummaryReports,
  fetchSummaryReportStats,
  summaryReportKeys,
} from "@/features/kpi-summary-report/api";
import { CreateReportWizard } from "@/features/kpi-summary-report/components/create-report-wizard";
import {
  SummaryReportListPanel,
  type ReportTab,
} from "@/features/kpi-summary-report/components/summary-report-list-panel";
import { SummaryReportPanel } from "@/features/kpi-summary-report/components/summary-report-panel";
import type {
  SummaryReportListQuery,
  SummaryReportStatus,
} from "@/features/kpi-summary-report/types";
import { kpiTone } from "@/features/personal-kpi/status-styles";
import { getApiErrorMessage } from "@/lib/api-client";
import { useListPagination } from "@/hooks/use-list-pagination";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 8;

/**
 * Trang báo cáo tổng hợp: danh sách bên trái, báo cáo đang mở bên phải.
 *
 * Một màn duy nhất chứ không phải hai tab rồi nhảy trang: người lập vừa sửa
 * báo cáo vừa liếc sang các bản khác trong kỳ, tách ra là mất mạch việc.
 */
export function SummaryReportWorkspace() {
  const { mutate } = useSWRConfig();
  const [tab, setTab] = useState<ReportTab>("ALL");
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);

  // Ô tìm kiếm dùng chung nhịp gõ với mọi danh sách khác trong app.
  const {
    page,
    setPage,
    limit,
    query: q,
    setQuery: setQ,
    debouncedQuery,
  } = useListPagination(PAGE_SIZE);

  const listParams: SummaryReportListQuery = useMemo(
    () => ({
      page,
      limit,
      status: tab === "ALL" ? "" : (tab as SummaryReportStatus),
      q: debouncedQuery,
    }),
    [page, limit, tab, debouncedQuery],
  );

  const list = useSWR(summaryReportKeys.list(listParams), () =>
    fetchSummaryReports(listParams),
  );
  const stats = useSWR(summaryReportKeys.stats, fetchSummaryReportStats);

  const reports = useMemo(() => list.data?.data ?? [], [list.data]);
  const meta = list.data?.meta;

  /*
    Báo cáo đang mở suy thẳng từ danh sách chứ không giữ thành state riêng:
    chưa chọn gì thì mở bản đầu tiên, còn bản đã chọn mà rớt khỏi trang hiện
    tại (đổi bộ lọc, vừa xoá) thì tự lùi về bản đầu, không cần effect đồng bộ.
  */
  const activeId =
    pickedId && reports.some((report) => report._id === pickedId)
      ? pickedId
      : (reports[0]?._id ?? null);

  const detail = useSWR(
    activeId ? summaryReportKeys.detail(activeId) : null,
    () => fetchSummaryReport(activeId!),
  );

  /**
   * Sửa gì cũng phải nạp lại cả hai cột: đếm ở cột trái đọc từ cùng dữ liệu.
   * Kho nhiệm vụ cũng phải làm mới - việc vừa đưa vào báo cáo thì biến khỏi
   * kho, việc vừa bỏ ra thì quay lại kho.
   */
  const refreshAll = async () => {
    await Promise.all([
      list.mutate(),
      detail.mutate(),
      stats.mutate(),
      mutate(
        (key) =>
          Array.isArray(key) &&
          key[0] === "kpi-summary-reports" &&
          key[1] === "candidates",
        undefined,
        { revalidate: true },
      ),
    ]);
  };

  return (
    <div className="space-y-4">
      <Card className="border-border/80">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "flex size-10 items-center justify-center rounded-lg",
                kpiTone.info.icon,
              )}
            >
              <FileText className="size-5" />
            </span>
            <div>
              <h1 className="font-display text-xl font-semibold tracking-tight">
                Báo cáo tổng hợp
              </h1>
              <p className="text-sm text-muted-foreground">
                Tổng hợp nhiệm vụ đã xác nhận hoàn thành và trình lên cấp trên.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="secondary"
              className={cn("font-normal", kpiTone.neutral.soft)}
            >
              {stats.data?.total ?? 0} báo cáo · {stats.data?.sent ?? 0} đã gửi
            </Badge>
            <Button type="button" onClick={() => setWizardOpen(true)}>
              <Plus className="size-4" />
              Tạo báo cáo tổng hợp
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <SummaryReportListPanel
          reports={reports}
          loading={list.isLoading}
          activeId={activeId}
          onSelect={(report) => setPickedId(report._id)}
          q={q}
          onQChange={setQ}
          tab={tab}
          onTabChange={(next) => {
            setTab(next);
            setPage(1);
          }}
          page={meta?.page ?? page}
          total={meta?.total ?? 0}
          totalPages={meta?.totalPages ?? 1}
          onPageChange={setPage}
        />

        {list.error ? (
          <Card>
            <CardContent className="p-4 text-sm text-destructive">
              {getApiErrorMessage(
                list.error,
                "Không tải được danh sách báo cáo.",
              )}
            </CardContent>
          </Card>
        ) : !activeId ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
              <FileSpreadsheet className="size-10 text-muted-foreground" />
              <p className="text-sm font-medium">Chưa chọn báo cáo nào</p>
              <p className="max-w-sm text-xs text-muted-foreground">
                Tạo một báo cáo tổng hợp để gom các nhiệm vụ đã hoàn thành trong
                nhánh đơn vị của bạn thành một bản trình cấp trên.
              </p>
              <Button
                type="button"
                className="mt-2"
                onClick={() => setWizardOpen(true)}
              >
                <Plus className="size-4" />
                Tạo báo cáo tổng hợp
              </Button>
            </CardContent>
          </Card>
        ) : detail.error ? (
          <Card>
            <CardContent className="p-4 text-sm text-destructive">
              {getApiErrorMessage(detail.error, "Không tải được báo cáo.")}
            </CardContent>
          </Card>
        ) : !detail.data ? (
          <Card>
            <CardContent className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Đang tải báo cáo...
            </CardContent>
          </Card>
        ) : (
          <SummaryReportPanel
            detail={detail.data}
            loading={detail.isValidating}
            onChanged={refreshAll}
            onDeleted={async () => {
              setPickedId(null);
              await refreshAll();
            }}
          />
        )}
      </div>

      <CreateReportWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        onCreated={async (reportId) => {
          setPickedId(reportId);
          await refreshAll();
        }}
      />
    </div>
  );
}
