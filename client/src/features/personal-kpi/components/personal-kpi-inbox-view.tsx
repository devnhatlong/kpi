"use client";

import { useMemo, useState } from "react";
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
  fetchPersonalKpiInboxReports,
  personalKpiKeys,
  type PersonalKpiInboxReport,
} from "@/features/personal-kpi/api";
import { PersonalInboxDetailDrawer } from "@/features/personal-kpi/components/personal-inbox-detail-drawer";
import {
  PERSONAL_KPI_STATUS_LABEL,
  type PersonalKpiStatus,
} from "@/features/personal-kpi/types";
import { useListPagination } from "@/hooks/use-list-pagination";
import { emptyPaginationMeta, rowIndex } from "@/lib/pagination";

const STATUS_FILTERS: Array<{ value: string; label: string }> = [
  { value: "ALL", label: "Tất cả trạng thái" },
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

export function PersonalKpiInboxView() {
  const { page, setPage, limit, setLimit, query, setQuery, debouncedQuery } =
    useListPagination();
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [status, setStatus] = useState("ALL");
  const [detail, setDetail] = useState<PersonalKpiInboxReport | null>(null);

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
    personalKpiKeys.inboxReports(listParams),
    () => fetchPersonalKpiInboxReports(listParams),
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
      <div className="space-y-1">
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          Duyệt KPI cấp dưới
        </h1>
        <p className="text-sm text-muted-foreground">
          Báo cáo KPI cấp dưới gửi lên để bạn duyệt hoặc trả lại.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <div className="space-y-2 xl:col-span-2">
              <Label>Tìm kiếm</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setPage(1);
                  }}
                  placeholder="Tìm theo tên nhiệm vụ..."
                  className="bg-background pl-9"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Từ ngày</Label>
              <Input
                type="date"
                value={fromDate}
                onChange={(event) => {
                  setFromDate(event.target.value);
                  setPage(1);
                }}
                className="bg-background"
              />
            </div>
            <div className="space-y-2">
              <Label>Đến ngày</Label>
              <Input
                type="date"
                value={toDate}
                onChange={(event) => {
                  setToDate(event.target.value);
                  setPage(1);
                }}
                className="bg-background"
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
                  <SelectValue />
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
            <Button type="button" variant="outline" onClick={resetFilters}>
              Xoá lọc
            </Button>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-14">STT</TableHead>
                <TableHead>Ngày báo cáo</TableHead>
                <TableHead>Người gửi</TableHead>
                <TableHead className="w-[90px]">Số NV</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead className="w-[160px]">Gửi lúc</TableHead>
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
                      <span>Chưa có báo cáo nào gửi đến bạn.</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                reports.map((report, index) => (
                  <TableRow
                    key={`${report.ownerId}:${report.reportDate}`}
                  >
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
                    <TableCell>
                      <div className="font-medium">
                        {report.ownerName || "—"}
                      </div>
                      {report.ownerUsername ? (
                        <div className="text-xs text-muted-foreground">
                          {report.ownerUsername}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {report.taskCount}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {report.sentCount > 0 ? (
                          <Badge variant="outline">
                            Đã gửi {report.sentCount}
                          </Badge>
                        ) : null}
                        {report.rejectedCount > 0 ? (
                          <Badge variant="outline">
                            Trả lại {report.rejectedCount}
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
                      {formatDateTime(report.lastSentAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="bg-background"
                        onClick={() => setDetail(report)}
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

      <PersonalInboxDetailDrawer
        open={!!detail}
        onOpenChange={(open) => {
          if (!open) setDetail(null);
        }}
        ownerId={detail?.ownerId ?? null}
        ownerName={detail?.ownerName}
        reportDate={detail?.reportDate ?? null}
        onChanged={async () => {
          await mutate();
        }}
      />
    </div>
  );
}
