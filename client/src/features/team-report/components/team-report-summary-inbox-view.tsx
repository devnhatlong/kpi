"use client";

import { useState } from "react";
import useSWR from "swr";
import { FileSpreadsheet, Inbox, Loader2, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SegmentedTabs } from "@/components/common/segmented-tabs";
import {
  fetchIncomingTeamReportSummary,
  fetchTeamReportSummaryInbox,
  teamReportKeys,
} from "@/features/team-report/api";
import { TeamReportSummaryPanel } from "@/features/team-report/components/team-report-summary-panel";
import { DAY_STATUS_CLASS } from "@/features/team-report/status-styles";
import {
  TEAM_REPORT_PERIOD_LABEL,
  TEAM_REPORT_STATUS_LABEL,
  refName,
  type TeamReportDayStatus,
  type TeamReportSummary,
} from "@/features/team-report/types";
import { getApiErrorMessage } from "@/lib/api-client";
import { formatYmd } from "@/lib/server-time";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 8;

type StatusFilter = TeamReportDayStatus | "ALL";

/**
 * Hộp đến bản tổng hợp của cấp trên: danh sách bên trái, bản đang mở bên phải.
 *
 * Tách hẳn với "Duyệt báo cáo ngày": bản ngày là lượt bắt buộc hằng ngày của cả
 * bảng, bản tổng hợp là tập chọn tay theo kỳ. Gộp chung một hộp thư thì hai thứ
 * khác nhịp nằm lẫn vào nhau, mà "đã duyệt bản ngày" không có nghĩa là "đã
 * duyệt bản tuần".
 */
export function TeamReportSummaryInboxView() {
  const [status, setStatus] = useState<StatusFilter>("PENDING");
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [pickedId, setPickedId] = useState<string | null>(null);

  const list = useSWR(teamReportKeys.summaryInbox(status, page), () =>
    fetchTeamReportSummaryInbox({
      status: status === "ALL" ? "" : status,
      page,
      limit: PAGE_SIZE,
    }),
  );

  const all = list.data?.data ?? [];
  const meta = list.data?.meta;

  const term = query.trim().toLowerCase();
  const reports = term
    ? all.filter(
        (report) =>
          report.title.toLowerCase().includes(term) ||
          (refName(report.departmentId) ?? "").toLowerCase().includes(term),
      )
    : all;

  const activeId =
    pickedId && reports.some((report) => report._id === pickedId)
      ? pickedId
      : (reports[0]?._id ?? null);

  const detail = useSWR(
    activeId ? ["team-report", "summary-incoming", activeId] : null,
    () => fetchIncomingTeamReportSummary(activeId!),
  );

  const refreshAll = async () => {
    await Promise.all([list.mutate(), detail.mutate()]);
  };

  return (
    <div className="space-y-4">
      <Card className="shadow-sm">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Inbox className="size-5" />
            </span>
            <div>
              <h1 className="font-display text-xl font-semibold tracking-tight">
                Duyệt báo cáo tổng hợp
              </h1>
              <p className="text-sm text-muted-foreground">
                Bản tổng hợp theo kỳ các đội trình lên - đọc, chỉnh lại số nếu
                cần, rồi duyệt hoặc trả lại kèm lý do.
              </p>
            </div>
          </div>

          <Badge variant="secondary" className="whitespace-nowrap font-normal">
            {meta?.total ?? 0} báo cáo
          </Badge>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Card className="shadow-sm lg:sticky lg:top-4 lg:self-start">
          <CardContent className="space-y-3 py-4">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Tìm theo tên báo cáo hoặc đội..."
                className="bg-background pl-8"
              />
            </div>

            <SegmentedTabs
              ariaLabel="Lọc theo trạng thái"
              value={status}
              onChange={(next) => {
                setStatus(next);
                setPage(1);
              }}
              items={[
                { value: "PENDING" as const, label: "Chờ duyệt" },
                { value: "APPROVED" as const, label: "Đã duyệt" },
                { value: "RETURNED" as const, label: "Đã trả lại" },
                { value: "ALL" as const, label: "Tất cả" },
              ]}
              className="flex-wrap"
            />

            <div className="max-h-[32rem] space-y-1.5 overflow-y-auto">
              {list.isLoading && !reports.length ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Đang tải...
                </p>
              ) : null}

              {!list.isLoading && !reports.length ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {term
                    ? "Không có báo cáo nào khớp."
                    : "Chưa có báo cáo nào ở mục này."}
                </p>
              ) : null}

              {reports.map((report) => (
                <InboxRow
                  key={report._id}
                  report={report}
                  active={report._id === activeId}
                  onPick={() => setPickedId(report._id)}
                />
              ))}
            </div>

            {(meta?.totalPages ?? 1) > 1 ? (
              <div className="flex items-center justify-between gap-2 border-t pt-3">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="bg-background"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => current - 1)}
                >
                  Trước
                </Button>
                <span className="text-xs text-muted-foreground tabular-nums">
                  Trang {meta?.page ?? page}/{meta?.totalPages ?? 1}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="bg-background"
                  disabled={page >= (meta?.totalPages ?? 1)}
                  onClick={() => setPage((current) => current + 1)}
                >
                  Sau
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {list.error ? (
          <Card className="shadow-sm">
            <CardContent className="p-4 text-sm text-destructive">
              {getApiErrorMessage(list.error, "Không tải được danh sách.")}
            </CardContent>
          </Card>
        ) : !activeId ? (
          <Card className="shadow-sm">
            <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
              <FileSpreadsheet className="size-10 text-muted-foreground" />
              <p className="text-sm font-medium">Chưa có bản nào trình lên</p>
              <p className="max-w-sm text-xs text-muted-foreground">
                Đội trình báo cáo tổng hợp lên thì nó nằm ở đây, chờ bạn duyệt
                hoặc trả lại.
              </p>
            </CardContent>
          </Card>
        ) : detail.error ? (
          <Card className="shadow-sm">
            <CardContent className="p-4 text-sm text-destructive">
              {getApiErrorMessage(detail.error, "Không tải được báo cáo.")}
            </CardContent>
          </Card>
        ) : !detail.data ? (
          <Card className="shadow-sm">
            <CardContent className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Đang tải báo cáo...
            </CardContent>
          </Card>
        ) : (
          <TeamReportSummaryPanel
            detail={detail.data}
            role="REVIEWER"
            onChanged={refreshAll}
          />
        )}
      </div>
    </div>
  );
}

/** Dòng ở cột trái - phải thấy ngay là đội nào trình, kỳ nào, bao nhiêu việc. */
function InboxRow({
  report,
  active,
  onPick,
}: {
  report: TeamReportSummary;
  active: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      className={cn(
        "w-full cursor-pointer rounded-md border p-2.5 text-left transition-colors",
        active ? "border-primary bg-primary/5" : "hover:bg-muted/60",
      )}
    >
      <div className="line-clamp-2 break-words text-sm font-medium">
        {report.title}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        {refName(report.departmentId) || "Không rõ đội"}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted-foreground tabular-nums">
          {formatYmd(report.fromDate)} - {formatYmd(report.toDate)}
        </span>
        <Badge
          variant="secondary"
          className={cn(
            "whitespace-nowrap font-normal",
            DAY_STATUS_CLASS[report.status],
          )}
        >
          {TEAM_REPORT_STATUS_LABEL[report.status]}
        </Badge>
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        {TEAM_REPORT_PERIOD_LABEL[report.period]} · {report.rows?.length ?? 0}{" "}
        nhiệm vụ
      </div>
    </button>
  );
}
