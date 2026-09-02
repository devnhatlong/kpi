"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClipboardList, Eye, Search } from "lucide-react";
import useSWR from "swr";

import { TablePagination } from "@/components/common/table-pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  fetchPersonalMissionReports,
  fetchPersonalMissionSummary,
  personalMissionKeys,
} from "@/features/personal-mission/api";
import { PersonalMissionStatsRow } from "@/features/personal-mission/components/personal-mission-stats-row";
import { PersonalMissionTodayBanner } from "@/features/personal-mission/components/personal-mission-today-banner";
import { PersonalTaskDrawer } from "@/features/personal-mission/components/personal-task-drawer";
import {
  PERSONAL_MISSION_STATUS_LABEL,
  type PersonalMissionStatus,
} from "@/features/personal-mission/types";
import { missionStatusPillClass } from "@/features/personal-mission/status-styles";
import { useListPagination } from "@/hooks/use-list-pagination";
import { useServerTime } from "@/hooks/use-server-time";
import { emptyPaginationMeta, rowIndex } from "@/lib/pagination";
import { serverDayjs } from "@/lib/server-time";
import { cn } from "@/lib/utils";
import { DatePickerInput } from "@/components/common/date-picker-input";

const STATUS_FILTERS: Array<{ value: string; label: string }> = [
  { value: "ALL", label: "Tất cả trạng thái" },
  { value: "DRAFT", label: PERSONAL_MISSION_STATUS_LABEL.DRAFT },
  { value: "PENDING", label: PERSONAL_MISSION_STATUS_LABEL.PENDING },
  { value: "APPROVED", label: PERSONAL_MISSION_STATUS_LABEL.APPROVED },
  { value: "RETURNED", label: PERSONAL_MISSION_STATUS_LABEL.RETURNED },
];

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("vi-VN");
}

/**
 * Trang nhiệm vụ của một ngày - nơi xem, cập nhật tiến độ và gửi báo cáo.
 * Đường dẫn viết theo thứ tự ngày-tháng-năm như người dùng đọc.
 */
function dayHref(ymd: string) {
  const [year, month, day] = ymd.split("-");
  return `/mission/personal/${day}-${month}-${year}`;
}

function formatReportDate(ymd: string) {
  const date = new Date(`${ymd}T00:00:00`);
  if (Number.isNaN(date.getTime())) return ymd;
  return date.toLocaleDateString("vi-VN", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function PersonalMissionListView() {
  const { page, setPage, limit, setLimit, query, setQuery, debouncedQuery } =
    useListPagination();
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [status, setStatus] = useState("ALL");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const router = useRouter();

  // Sync giờ server để có re-render khi offset sẵn sàng, rồi tính lại mỗi lần
  // render - tự đúng sau khi sync xong và khi sang ngày mới.
  useServerTime();
  const todayYmd = serverDayjs().format("YYYY-MM-DD");

  const listParams = useMemo(
    () => ({
      page,
      limit,
      q: debouncedQuery,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
      status: status === "ALL" ? undefined : (status as PersonalMissionStatus),
    }),
    [page, limit, debouncedQuery, fromDate, toDate, status],
  );

  const todayParams = useMemo(
    () => ({
      page: 1,
      limit: 1,
      fromDate: todayYmd,
      toDate: todayYmd,
    }),
    [todayYmd],
  );

  const { data, isLoading, mutate } = useSWR(
    personalMissionKeys.reports(listParams),
    () => fetchPersonalMissionReports(listParams),
  );

  const {
    data: todayData,
    isLoading: todayLoading,
    mutate: mutateToday,
  } = useSWR(personalMissionKeys.reports(todayParams), () =>
    fetchPersonalMissionReports(todayParams),
  );

  const {
    data: summary,
    isLoading: summaryLoading,
    mutate: mutateSummary,
  } = useSWR(personalMissionKeys.summary, fetchPersonalMissionSummary);

  const reports = data?.data ?? [];
  const meta = data?.meta ?? emptyPaginationMeta(limit);
  const todayReport =
    todayData?.data?.find((item) => item.reportDate === todayYmd) ?? null;

  const refreshReports = async () => {
    await Promise.all([mutate(), mutateToday(), mutateSummary()]);
  };

  const resetFilters = () => {
    setQuery("");
    setFromDate("");
    setToDate("");
    setStatus("ALL");
    setPage(1);
  };

  return (
    <div className="space-y-4">
      <PersonalMissionTodayBanner
        todayYmd={todayYmd}
        todayReport={todayReport}
        loading={todayLoading}
        onCreateToday={() => setDrawerOpen(true)}
        onOpenToday={() => router.push(dayHref(todayYmd))}
      />

      <PersonalMissionStatsRow
        summary={summary}
        loading={summaryLoading}
        onOpenToday={() => router.push(dayHref(todayYmd))}
      />

      <Card>
        <CardContent className="space-y-4 pt-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <div className="space-y-2 xl:col-span-2">
              <Label htmlFor="mission-search">Tìm nhiệm vụ</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="mission-search"
                  className="bg-background pl-8 placeholder:text-muted-foreground/70"
                  placeholder="Tên nhiệm vụ trong báo cáo..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="from-date">Từ ngày</Label>
              <DatePickerInput
                id="from-date"
                value={fromDate}
                onChange={(next) => {
                  setFromDate(next);
                  setPage(1);
                }}
                placeholder="Từ ngày"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="to-date">Đến ngày</Label>
              <DatePickerInput
                id="to-date"
                value={toDate}
                onChange={(next) => {
                  setToDate(next);
                  setPage(1);
                }}
                placeholder="Đến ngày"
              />
            </div>
            <div className="space-y-2">
              <Label>Trạng thái</Label>
              <Select
                value={status}
                onValueChange={(value) => {
                  setStatus(value);
                  setPage(1);
                }}
              >
                <SelectTrigger className="bg-background">
                  <SelectValue placeholder="Trạng thái" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_FILTERS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="bg-background"
              onClick={resetFilters}
            >
              Xoá bộ lọc
            </Button>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14">STT</TableHead>
                  <TableHead>Ngày báo cáo</TableHead>
                  <TableHead className="w-[110px]">Số NV</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead className="w-[170px]">Tạo lúc</TableHead>
                  <TableHead className="w-[170px]">Gửi gần nhất</TableHead>
                  <TableHead className="w-[120px] text-right">
                    Thao tác
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="h-28 text-center text-muted-foreground"
                    >
                      Đang tải...
                    </TableCell>
                  </TableRow>
                ) : reports.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="h-28 text-center text-muted-foreground"
                    >
                      <div className="inline-flex flex-col items-center gap-2">
                        <ClipboardList className="h-8 w-8 opacity-40" />
                        <span>
                          Chưa có báo cáo nào. Bấm &quot;Lập báo cáo hôm
                          nay&quot; ở phía trên để bắt đầu.
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  reports.map((report, index) => (
                    <TableRow key={report.reportDate}>
                      <TableCell className="text-muted-foreground">
                        {rowIndex(page, limit, index)}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium capitalize">
                          {formatReportDate(report.reportDate)}
                        </div>
                        <div className="font-mono text-xs text-muted-foreground">
                          {report.reportDate}
                        </div>
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {report.taskCount}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {report.draftCount > 0 ? (
                            <Badge
                              variant="secondary"
                              className={cn(missionStatusPillClass.DRAFT)}
                            >
                              Nháp {report.draftCount}
                            </Badge>
                          ) : null}
                          {report.pendingCount > 0 ? (
                            <Badge
                              variant="secondary"
                              className={cn(missionStatusPillClass.PENDING)}
                            >
                              Chờ duyệt {report.pendingCount}
                            </Badge>
                          ) : null}
                          {report.returnedCount > 0 ? (
                            <Badge
                              variant="secondary"
                              className={cn(missionStatusPillClass.RETURNED)}
                            >
                              Trả lại {report.returnedCount}
                            </Badge>
                          ) : null}
                          {report.approvedCount > 0 ? (
                            <Badge
                              variant="secondary"
                              className={cn(missionStatusPillClass.APPROVED)}
                            >
                              Đã duyệt {report.approvedCount}
                            </Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDateTime(report.createdAt)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDateTime(report.lastSentAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          asChild
                          size="sm"
                          variant="outline"
                          className="bg-background"
                        >
                          <Link href={dayHref(report.reportDate)}>
                            <Eye className="h-4 w-4" />
                            Chi tiết
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <TablePagination
            page={page}
            limit={limit}
            total={meta.total}
            totalPages={meta.totalPages}
            onPageChange={setPage}
            onLimitChange={setLimit}
            disabled={isLoading}
          />
        </CardContent>
      </Card>

      <PersonalTaskDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        reportDate={todayYmd}
        onSaved={async () => {
          await refreshReports();
        }}
      />
    </div>
  );
}
