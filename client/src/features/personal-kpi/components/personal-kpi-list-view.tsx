"use client";

import { useMemo, useState } from "react";
import { ClipboardList, Eye, Plus, Search } from "lucide-react";
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
  fetchPersonalKpiReports,
  personalKpiKeys,
} from "@/features/personal-kpi/api";
import { PersonalReportDetailDrawer } from "@/features/personal-kpi/components/personal-report-detail-drawer";
import { PersonalTaskDrawer } from "@/features/personal-kpi/components/personal-task-drawer";
import {
  PERSONAL_KPI_STATUS_LABEL,
  type PersonalKpiStatus,
} from "@/features/personal-kpi/types";
import { useListPagination } from "@/hooks/use-list-pagination";
import { emptyPaginationMeta, rowIndex } from "@/lib/pagination";

const STATUS_FILTERS: Array<{ value: string; label: string }> = [
  { value: "ALL", label: "Tất cả trạng thái" },
  { value: "DRAFT", label: PERSONAL_KPI_STATUS_LABEL.DRAFT },
  { value: "SENT", label: PERSONAL_KPI_STATUS_LABEL.SENT },
  { value: "REJECTED", label: PERSONAL_KPI_STATUS_LABEL.REJECTED },
  { value: "COMPLETED", label: PERSONAL_KPI_STATUS_LABEL.COMPLETED },
];

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("vi-VN");
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

export function PersonalKpiListView() {
  const { page, setPage, limit, setLimit, query, setQuery, debouncedQuery } =
    useListPagination();
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [status, setStatus] = useState("ALL");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [detailDate, setDetailDate] = useState<string | null>(null);

  const listParams = useMemo(
    () => ({
      page,
      limit,
      q: debouncedQuery,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
      status:
        status === "ALL" ? undefined : (status as PersonalKpiStatus),
    }),
    [page, limit, debouncedQuery, fromDate, toDate, status],
  );

  const { data, isLoading, mutate } = useSWR(
    personalKpiKeys.reports(listParams),
    () => fetchPersonalKpiReports(listParams),
  );

  const reports = data?.data ?? [];
  const meta = data?.meta ?? emptyPaginationMeta(limit);

  const resetFilters = () => {
    setQuery("");
    setFromDate("");
    setToDate("");
    setStatus("ALL");
    setPage(1);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            KPI cá nhân
          </h1>
          <p className="text-sm text-muted-foreground">
            Mỗi ngày một báo cáo tổng. Bấm Chi tiết để xem từng nhiệm vụ. Thời
            gian lưu theo giờ server (VN).
          </p>
        </div>
        <Button onClick={() => setDrawerOpen(true)}>
          <Plus className="h-4 w-4" />
          Tạo nháp
        </Button>
      </div>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <div className="space-y-2 xl:col-span-2">
              <Label htmlFor="kpi-search">Tìm nhiệm vụ</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="kpi-search"
                  className="bg-background pl-8 placeholder:text-muted-foreground/70"
                  placeholder="Tên nhiệm vụ trong báo cáo..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="from-date">Từ ngày</Label>
              <Input
                id="from-date"
                type="date"
                className="bg-background"
                value={fromDate}
                onChange={(e) => {
                  setFromDate(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="to-date">Đến ngày</Label>
              <Input
                id="to-date"
                type="date"
                className="bg-background"
                value={toDate}
                onChange={(e) => {
                  setToDate(e.target.value);
                  setPage(1);
                }}
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
                  <TableHead className="w-[120px] text-right">Thao tác</TableHead>
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
                          Chưa có báo cáo nào. Bấm &quot;Tạo nháp&quot; để thêm
                          nhiệm vụ ngày hôm nay.
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
                            <Badge variant="outline">
                              Nháp {report.draftCount}
                            </Badge>
                          ) : null}
                          {report.sentCount > 0 ? (
                            <Badge variant="outline">
                              Đã gửi {report.sentCount}
                            </Badge>
                          ) : null}
                          {report.rejectedCount > 0 ? (
                            <Badge variant="outline">
                              Từ chối {report.rejectedCount}
                            </Badge>
                          ) : null}
                          {report.completedCount > 0 ? (
                            <Badge variant="outline">
                              HT {report.completedCount}
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
                          size="sm"
                          variant="outline"
                          className="bg-background"
                          onClick={() => setDetailDate(report.reportDate)}
                        >
                          <Eye className="h-4 w-4" />
                          Chi tiết
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
        onSaved={async () => {
          await mutate();
        }}
      />

      <PersonalReportDetailDrawer
        open={!!detailDate}
        onOpenChange={(open) => {
          if (!open) setDetailDate(null);
        }}
        reportDate={detailDate}
        onChanged={async () => {
          await mutate();
        }}
      />
    </div>
  );
}
