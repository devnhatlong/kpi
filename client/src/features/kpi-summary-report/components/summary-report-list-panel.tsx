"use client";

import {
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  Loader2,
  Search,
} from "lucide-react";

import { SegmentedTabs } from "@/components/common/segmented-tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  SUMMARY_REPORT_STATUS_LABEL,
  summaryReportStatusBadgeClass,
  type SummaryReport,
  type SummaryReportStatus,
} from "@/features/kpi-summary-report/types";
import { kpiTone } from "@/features/personal-kpi/status-styles";
import { formatYmd, serverYmd } from "@/lib/server-time";
import { cn } from "@/lib/utils";

export type ReportTab = "ALL" | SummaryReportStatus;
export type ReportScope = "mine" | "incoming";

/*
  Hai ngăn: bản mình lập và bản cấp dưới trình lên. Mỗi ngăn có bộ tab riêng vì
  trạng thái đáng quan tâm khác hẳn nhau - bên mình là "soạn tiếp / bị trả lại",
  bên nhận là "chờ mình quyết".
*/
const SCOPES: Array<{ value: ReportScope; label: string }> = [
  { value: "mine", label: "Tôi lập" },
  { value: "incoming", label: "Cấp dưới trình" },
];

const MINE_TABS: Array<{ value: ReportTab; label: string }> = [
  { value: "ALL", label: "Tất cả" },
  { value: "DRAFT", label: "Đang soạn" },
  { value: "SENT", label: "Chờ duyệt" },
  { value: "RETURNED", label: "Bị trả lại" },
  { value: "APPROVED", label: "Đã duyệt" },
];

const INCOMING_TABS: Array<{ value: ReportTab; label: string }> = [
  { value: "ALL", label: "Tất cả" },
  { value: "SENT", label: "Chờ tôi duyệt" },
  { value: "APPROVED", label: "Đã duyệt" },
  { value: "RETURNED", label: "Đã trả lại" },
];

type SummaryReportListPanelProps = {
  reports: SummaryReport[];
  loading: boolean;
  activeId: string | null;
  onSelect: (report: SummaryReport) => void;
  q: string;
  onQChange: (value: string) => void;
  tab: ReportTab;
  onTabChange: (value: ReportTab) => void;
  scope: ReportScope;
  onScopeChange: (value: ReportScope) => void;
  /** Số bản đang chờ tôi quyết - gắn lên nhãn ngăn "Cấp dưới trình". */
  incomingPending: number;
  page: number;
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
};

/** Ngày tạo hiển thị gọn - lấy phần ngày của mốc ISO server trả về. */
function createdLabel(value: string): string {
  // Quy về ngày theo múi giờ server, không cắt chuỗi ISO (UTC lệch một ngày).
  return value ? formatYmd(serverYmd(value)) : "";
}

/**
 * Cột trái: danh sách báo cáo của tôi, tìm theo tên hoặc phạm vi và lọc theo
 * trạng thái. Bấm một dòng là mở nó ở cột phải, không rời trang.
 */
export function SummaryReportListPanel({
  reports,
  loading,
  activeId,
  onSelect,
  q,
  onQChange,
  tab,
  onTabChange,
  scope,
  onScopeChange,
  incomingPending,
  page,
  total,
  totalPages,
  onPageChange,
}: SummaryReportListPanelProps) {
  return (
    <Card className="h-fit">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Danh sách báo cáo</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <SegmentedTabs
          items={SCOPES.map((item) => ({
            value: item.value,
            label:
              item.value === "incoming" && incomingPending > 0 ? (
                <span className="flex items-center gap-1.5">
                  {item.label}
                  <span
                    className={cn(
                      "rounded-full px-1.5 text-xs font-medium tabular-nums",
                      kpiTone.warning.soft,
                    )}
                  >
                    {incomingPending}
                  </span>
                </span>
              ) : (
                item.label
              ),
          }))}
          value={scope}
          onChange={onScopeChange}
          ariaLabel="Báo cáo tôi lập hay cấp dưới trình lên"
        />

        <div className="relative">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            value={q}
            onChange={(event) => onQChange(event.target.value)}
            placeholder="Tìm theo tên hoặc phạm vi"
          />
        </div>

        <SegmentedTabs
          items={scope === "incoming" ? INCOMING_TABS : MINE_TABS}
          value={tab}
          onChange={onTabChange}
          ariaLabel="Lọc báo cáo theo trạng thái"
        />

        <div className="space-y-2">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Đang tải danh sách...
            </div>
          ) : null}

          {!loading && reports.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <FileSpreadsheet className="size-8 text-muted-foreground" />
              <p className="text-sm font-medium">Chưa có báo cáo nào</p>
              <p className="max-w-[220px] text-xs text-muted-foreground">
                {scope === "incoming"
                  ? "Chưa có cấp dưới nào trình báo cáo tổng hợp lên bạn."
                  : "Bấm Tạo báo cáo tổng hợp để gom việc đã hoàn thành thành một bản trình."}
              </p>
            </div>
          ) : null}

          {reports.map((report) => {
            const active = report._id === activeId;
            const count = report.itemCount + (report.manualItems?.length ?? 0);
            return (
              <button
                key={report._id}
                type="button"
                onClick={() => onSelect(report)}
                className={cn(
                  "w-full rounded-lg border-l-2 border border-l-transparent p-3 text-left transition-colors",
                  active
                    ? "border-l-primary bg-primary/5"
                    : "hover:bg-accent/40",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium">{report.title}</p>
                  <Badge
                    variant="secondary"
                    className={cn(
                      "shrink-0 font-normal",
                      summaryReportStatusBadgeClass(report.status),
                    )}
                  >
                    {SUMMARY_REPORT_STATUS_LABEL[report.status]}
                  </Badge>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {/* Bản cấp dưới trình lên thì thứ cần biết trước là AI trình. */}
                  {scope === "incoming"
                    ? report.ownerName || "Chưa rõ người lập"
                    : report.scopeName || "Chưa đặt phạm vi"}{" "}
                  · {createdLabel(report.createdAt)}
                </p>
                <Badge
                  variant="secondary"
                  className={cn("mt-2 font-normal", kpiTone.neutral.soft)}
                >
                  {count} nhiệm vụ
                </Badge>
              </button>
            );
          })}
        </div>

        {/* Cột hẹp nên phân trang gọn: chỉ lùi / tiến, không kèm ô "mỗi trang". */}
        {totalPages > 1 ? (
          <div className="flex items-center justify-between gap-2 border-t pt-2 text-xs text-muted-foreground">
            <span>
              Trang {page}/{totalPages} · {total} báo cáo
            </span>
            <div className="flex gap-1">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 bg-background px-2"
                disabled={loading || page <= 1}
                onClick={() => onPageChange(page - 1)}
              >
                <ChevronLeft className="size-3.5" />
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 bg-background px-2"
                disabled={loading || page >= totalPages}
                onClick={() => onPageChange(page + 1)}
              >
                <ChevronRight className="size-3.5" />
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
