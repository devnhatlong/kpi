"use client";

import { useState } from "react";
import useSWR from "swr";
import { FileSpreadsheet, FileText, Loader2, Plus, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SegmentedTabs } from "@/components/common/segmented-tabs";
import {
  fetchTeamReportSummaries,
  fetchTeamReportSummary,
  teamReportKeys,
  type TeamReportSummaryLevel,
} from "@/features/team-report/api";
import { TeamReportSummaryPanel } from "@/features/team-report/components/team-report-summary-panel";
import { TeamReportSummaryWizard } from "@/features/team-report/components/team-report-summary-wizard";
import { DAY_STATUS_CLASS } from "@/features/team-report/status-styles";
import {
  TEAM_REPORT_PERIOD_LABEL,
  TEAM_REPORT_STATUS_LABEL,
  type TeamReportDayStatus,
  type TeamReportSummary,
} from "@/features/team-report/types";
import { getApiErrorMessage } from "@/lib/api-client";
import { formatYmd } from "@/lib/server-time";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 8;

type StatusFilter = TeamReportDayStatus | "ALL";

/**
 * Báo cáo tổng hợp theo kỳ của đội: danh sách bên trái, bản đang mở bên phải.
 *
 * Cùng bố cục với trang báo cáo tổng hợp của bản nghiệp vụ cũ - người dùng đã
 * quen tay ở đó, đổi kiểu bày chỉ vì đây là feature khác là bắt họ học lại một
 * thứ y hệt.
 *
 * Đứng RIÊNG với bảng ngày: bảng ngày là lượt bắt buộc hằng ngày, đi đúng một
 * đường lên đơn vị cha. Bản tổng hợp là người lập tự chọn kỳ, tự chọn việc, tự
 * chọn trình cho ai.
 */
export function TeamReportSummaryView({
  level = "TEAM",
}: {
  /**
   * `TEAM` = đội gom việc của mình. `UNIT` = phòng gom việc của các đội.
   *
   * Cùng một màn cho cả hai cấp: nghiệp vụ giống hệt nhau, chỉ khác đường gọi
   * và bộ lọc đội. Dựng hai màn song song là mọi lần sửa sau này phải nhớ sửa
   * cả hai chỗ - kiểu gì cũng có lần quên.
   */
  level?: TeamReportSummaryLevel;
}) {
  const unit = level === "UNIT";
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);

  const list = useSWR(teamReportKeys.summaries(status, page, level), () =>
    fetchTeamReportSummaries({
      status: status === "ALL" ? "" : status,
      page,
      limit: PAGE_SIZE,
      level,
    }),
  );

  const all = list.data?.data ?? [];
  const meta = list.data?.meta;

  /* Lọc tên ngay trên máy: một trang chỉ 8 bản, gọi thêm một lượt API cho từng
     phím gõ là tốn hơn nhiều so với lọc tại chỗ. */
  const term = query.trim().toLowerCase();
  const reports = term
    ? all.filter((report) => report.title.toLowerCase().includes(term))
    : all;

  /*
    Bản đang mở suy thẳng từ danh sách chứ không giữ thành state riêng: chưa chọn
    gì thì mở bản đầu tiên, còn bản đã chọn mà rớt khỏi trang hiện tại (đổi bộ
    lọc, vừa xoá) thì tự lùi về bản đầu, không cần effect đồng bộ.
  */
  const activeId =
    pickedId && reports.some((report) => report._id === pickedId)
      ? pickedId
      : (reports[0]?._id ?? null);

  const detail = useSWR(
    activeId ? teamReportKeys.summary(activeId, level) : null,
    () => fetchTeamReportSummary(activeId!, level),
  );

  /** Sửa gì cũng nạp lại cả hai cột - đếm và nhãn ở cột trái đọc cùng dữ liệu. */
  const refreshAll = async () => {
    await Promise.all([list.mutate(), detail.mutate()]);
  };

  return (
    <div className="space-y-4">
      <Card className="shadow-sm">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FileText className="size-5" />
            </span>
            <div>
              <h1 className="font-display text-xl font-semibold tracking-tight">
                {unit ? "Tạo báo cáo của phòng" : "Tạo báo cáo tổng hợp"}
              </h1>
              <p className="text-sm text-muted-foreground">
                {unit
                  ? "Gom nhiệm vụ của các đội trong phòng theo kỳ, lọc theo đội hoặc theo trục, rồi trình lên cấp trên."
                  : "Gom nhiệm vụ từ bảng ngày của đội theo ngày, tuần hoặc tháng, chọn những việc đã sẵn sàng rồi trình lên cấp trên."}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="secondary"
              className="whitespace-nowrap font-normal"
            >
              {meta?.total ?? 0} báo cáo
            </Badge>
            <Button type="button" onClick={() => setWizardOpen(true)}>
              <Plus className="size-4" />
              Lập báo cáo
            </Button>
          </div>
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
                placeholder="Tìm theo tên báo cáo..."
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
                { value: "ALL" as const, label: "Tất cả" },
                { value: "DRAFT" as const, label: "Nháp" },
                { value: "PENDING" as const, label: "Đã trình" },
                { value: "APPROVED" as const, label: "Đã duyệt" },
                { value: "RETURNED" as const, label: "Trả lại" },
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
                  {term ? "Không có báo cáo nào khớp." : "Chưa có báo cáo nào."}
                </p>
              ) : null}

              {reports.map((report) => (
                <SummaryListRow
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
              {getApiErrorMessage(
                list.error,
                "Không tải được danh sách báo cáo.",
              )}
            </CardContent>
          </Card>
        ) : !activeId ? (
          <Card className="shadow-sm">
            <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
              <FileSpreadsheet className="size-10 text-muted-foreground" />
              <p className="text-sm font-medium">Chưa chọn báo cáo nào</p>
              <p className="max-w-sm text-xs text-muted-foreground">
                Lập một báo cáo tổng hợp để gom những nhiệm vụ đã sẵn sàng trong
                kỳ thành một bản trình lên cấp trên.
              </p>
              <Button
                type="button"
                className="mt-2"
                onClick={() => setWizardOpen(true)}
              >
                <Plus className="size-4" />
                Lập báo cáo
              </Button>
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
            level={level}
            onChanged={refreshAll}
            onDeleted={async () => {
              setPickedId(null);
              await refreshAll();
            }}
          />
        )}
      </div>

      <TeamReportSummaryWizard
        open={wizardOpen}
        level={level}
        onOpenChange={setWizardOpen}
        onDone={async (summaryId) => {
          if (summaryId) setPickedId(summaryId);
          await refreshAll();
        }}
      />
    </div>
  );
}

/** Một dòng ở cột trái - đủ để nhận ra bản nào mà không phải mở ra xem. */
function SummaryListRow({
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
          {report.status === "DRAFT"
            ? "Nháp"
            : TEAM_REPORT_STATUS_LABEL[report.status]}
        </Badge>
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        {TEAM_REPORT_PERIOD_LABEL[report.period]} · {report.rows?.length ?? 0}{" "}
        nhiệm vụ
        {report.recipientName ? ` · ${report.recipientName}` : ""}
      </div>
    </button>
  );
}
