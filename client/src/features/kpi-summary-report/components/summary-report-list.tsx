"use client";

import { useState } from "react";
import Link from "next/link";
import { FileSpreadsheet, Search, Trash2 } from "lucide-react";
import useSWR from "swr";
import { toast } from "sonner";

import { TablePagination } from "@/components/common/table-pagination";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/common/searchable-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  deleteSummaryReport,
  fetchSummaryReports,
  summaryReportKeys,
} from "@/features/kpi-summary-report/api";
import {
  periodLabel,
  SUMMARY_REPORT_STATUS_LABEL,
  summaryReportStatusBadgeClass,
  type SummaryReport,
  type SummaryReportListQuery,
  type SummaryReportStatus,
} from "@/features/kpi-summary-report/types";
import { getApiErrorMessage } from "@/lib/api-client";
import { cn } from "@/lib/utils";

const ALL = "ALL";

/** Danh sách báo cáo tổng của người đang đăng nhập. */
export function SummaryReportList() {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [status, setStatus] = useState(ALL);
  const [q, setQ] = useState("");
  const [pendingDelete, setPendingDelete] = useState<SummaryReport | null>(null);
  const [busy, setBusy] = useState(false);

  const params: SummaryReportListQuery = {
    page,
    limit,
    status: status === ALL ? "" : (status as SummaryReportStatus),
    q: q.trim(),
  };

  const { data, error, isLoading, mutate } = useSWR(
    summaryReportKeys.list(params),
    () => fetchSummaryReports(params),
  );

  const rows = data?.data ?? [];
  const meta = data?.meta;

  const doDelete = async () => {
    if (!pendingDelete) return;
    setBusy(true);
    try {
      await deleteSummaryReport(pendingDelete._id);
      toast.success(`Đã xoá "${pendingDelete.title}".`);
      setPendingDelete(null);
      await mutate();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không xoá được báo cáo."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 pt-6">
          <div className="grid gap-3 md:grid-cols-[1fr_220px]">
            <div className="space-y-1.5">
              <Label>Tìm báo cáo</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-8"
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Tên báo cáo..."
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Trạng thái</Label>
              <SearchableSelect
                value={status}
                onValueChange={(next) => {
                  setStatus(next);
                  setPage(1);
                }}
                options={[
                  { value: ALL, label: "Tất cả trạng thái" },
                  { value: "DRAFT", label: "Nháp" },
                  { value: "FINALIZED", label: "Đã chốt" },
                ]}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 pt-6">
          <div className="overflow-auto rounded-md border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[280px]">Tên báo cáo</TableHead>
                  <TableHead className="w-[200px]">Kỳ báo cáo</TableHead>
                  <TableHead className="w-[120px] text-center">
                    Nhiệm vụ
                  </TableHead>
                  <TableHead className="w-[130px]">Trạng thái</TableHead>
                  <TableHead className="w-[110px] text-right">
                    Thao tác
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="py-10 text-center text-sm text-muted-foreground"
                    >
                      Đang tải danh sách báo cáo...
                    </TableCell>
                  </TableRow>
                ) : null}

                {error ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="py-10 text-center text-sm text-destructive"
                    >
                      {getApiErrorMessage(error, "Không tải được danh sách.")}
                    </TableCell>
                  </TableRow>
                ) : null}

                {!isLoading && !error && rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-12 text-center">
                      <FileSpreadsheet className="mx-auto size-8 text-muted-foreground" />
                      <p className="mt-2 text-sm font-medium">
                        Chưa có báo cáo tổng nào
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Sang tab &quot;Chọn nhiệm vụ&quot; để nhặt việc đã hoàn
                        thành vào báo cáo.
                      </p>
                    </TableCell>
                  </TableRow>
                ) : null}

                {rows.map((report) => (
                  <TableRow key={report._id}>
                    <TableCell className="align-middle">
                      <Link
                        href={`/kpi/promote/${report._id}`}
                        className="font-medium hover:underline"
                      >
                        {report.title}
                      </Link>
                      {report.note ? (
                        <p className="line-clamp-1 text-xs text-muted-foreground">
                          {report.note}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell className="align-middle text-sm">
                      {periodLabel(report.fromDate, report.toDate)}
                    </TableCell>
                    <TableCell className="text-center align-middle text-sm">
                      {report.itemCount}
                    </TableCell>
                    <TableCell className="align-middle">
                      <Badge
                        variant="secondary"
                        className={cn(
                          summaryReportStatusBadgeClass(report.status),
                        )}
                      >
                        {SUMMARY_REPORT_STATUS_LABEL[report.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right align-middle">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8 text-destructive hover:text-destructive"
                        // Báo cáo đã chốt phải mở lại rồi mới xoá - khớp với
                        // luật bên server thay vì để người dùng bấm rồi ăn lỗi.
                        disabled={report.status !== "DRAFT"}
                        title={
                          report.status === "DRAFT"
                            ? "Xoá báo cáo"
                            : "Mở lại báo cáo trước khi xoá"
                        }
                        onClick={() => setPendingDelete(report)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {meta ? (
            <TablePagination
              page={meta.page}
              limit={meta.limit}
              total={meta.total}
              totalPages={meta.totalPages}
              onPageChange={setPage}
              onLimitChange={(next) => {
                setLimit(next);
                setPage(1);
              }}
              disabled={isLoading}
            />
          ) : null}
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => {
          if (!open && !busy) setPendingDelete(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Xoá báo cáo tổng</DialogTitle>
            <DialogDescription>
              Xoá &quot;{pendingDelete?.title}&quot;? Các nhiệm vụ bên trong
              không bị ảnh hưởng, chúng quay lại kho để nhặt vào báo cáo khác.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPendingDelete(null)}
              disabled={busy}
            >
              Hủy
            </Button>
            <Button
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
