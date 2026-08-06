"use client";

import { useState } from "react";
import { ArrowDownToLine, Inbox, PlayCircle, Search } from "lucide-react";
import dayjs from "dayjs";
import useSWR from "swr";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { TablePagination } from "@/components/common/table-pagination";
import {
  assignmentKeys,
  fetchReceivedAssignments,
  startAssignment,
} from "@/features/kpi-assignment/api";
import { AssignmentDetailDrawer } from "@/features/kpi-assignment/components/assignment-detail-drawer";
import { AssignmentReportDialog } from "@/features/kpi-assignment/components/assignment-report-dialog";
import { DelegateDialog } from "@/features/kpi-assignment/components/delegate-dialog";
import { assignmentStatusBadgeClass } from "@/features/kpi-assignment/status-styles";
import {
  ASSIGNMENT_STATUS_LABEL,
  ASSIGNMENT_STATUSES,
  holderLabel,
  isAssignmentOpen,
  refLabel,
  scoreGroupLabel,
  type AssignmentStatus,
  type KpiAssignment,
} from "@/features/kpi-assignment/types";
import { useListPagination } from "@/hooks/use-list-pagination";
import { getApiErrorMessage } from "@/lib/api-client";
import { emptyPaginationMeta, rowIndex } from "@/lib/pagination";

const ALL = "ALL";

export function ReceivedAssignmentsView() {
  const { page, setPage, limit, setLimit, query, setQuery, debouncedQuery } =
    useListPagination();
  const [status, setStatus] = useState<AssignmentStatus | typeof ALL>(ALL);

  const listQuery = {
    page,
    limit,
    q: debouncedQuery,
    status: status === ALL ? ("" as const) : status,
  };
  const { data, isLoading, mutate } = useSWR(
    assignmentKeys.received(listQuery),
    () => fetchReceivedAssignments(listQuery),
  );

  const items = data?.data ?? [];
  const meta = data?.meta ?? emptyPaginationMeta(limit);

  const [detail, setDetail] = useState<KpiAssignment | null>(null);
  const [delegating, setDelegating] = useState<KpiAssignment | null>(null);
  const [reporting, setReporting] = useState<KpiAssignment | null>(null);
  const [acting, setActing] = useState(false);

  const start = async (item: KpiAssignment) => {
    setActing(true);
    try {
      await startAssignment(item._id);
      toast.success("Đã nhận thực hiện nhiệm vụ.");
      await mutate();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không nhận được nhiệm vụ."));
    } finally {
      setActing(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          KPI cấp trên giao
        </h1>
        <p className="text-sm text-muted-foreground">
          Nhiệm vụ đang nằm ở chỗ bạn. Giao tiếp xuống cấp dưới, hoặc nhận thực
          hiện rồi báo cáo kết quả lên.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Tìm theo tên nhiệm vụ..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <Select
              value={status}
              onValueChange={(value) => {
                setStatus(value as AssignmentStatus | typeof ALL);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Tất cả trạng thái</SelectItem>
                {ASSIGNMENT_STATUSES.map((item) => (
                  <SelectItem key={item} value={item}>
                    {ASSIGNMENT_STATUS_LABEL[item]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14">STT</TableHead>
                  <TableHead className="min-w-[240px]">Nhiệm vụ</TableHead>
                  <TableHead className="w-[170px]">Cấp giao</TableHead>
                  <TableHead className="w-[120px]">Thời hạn</TableHead>
                  <TableHead className="w-[150px]">Nhóm điểm</TableHead>
                  <TableHead className="w-[130px]">Trạng thái</TableHead>
                  <TableHead className="w-[230px] text-right">
                    Thao tác
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="h-24 text-center text-muted-foreground"
                    >
                      Đang tải...
                    </TableCell>
                  </TableRow>
                ) : items.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="h-24 text-center text-muted-foreground"
                    >
                      <div className="inline-flex flex-col items-center gap-2">
                        <Inbox className="h-8 w-8 opacity-40" />
                        <span>Chưa có nhiệm vụ nào được giao xuống.</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((item, index) => {
                    const open = isAssignmentOpen(item.status);
                    // Chỉ nhiệm vụ đang ở đơn vị mới giao tiếp xuống được.
                    const canDelegate = open && item.holderType === "DEPARTMENT";
                    return (
                      <TableRow key={item._id}>
                        <TableCell className="text-muted-foreground">
                          {rowIndex(meta.page, meta.limit, index)}
                        </TableCell>
                        <TableCell>
                          <button
                            type="button"
                            className="text-left font-medium hover:underline"
                            onClick={() => setDetail(item)}
                          >
                            {item.title}
                          </button>
                          <div className="text-xs text-muted-foreground">
                            {refLabel(item.axisId)} ·{" "}
                            {refLabel(item.workContentId)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Đang ở: {holderLabel(item)}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {refLabel(item.lastAssignedByDepartmentId, "Hệ thống")}
                        </TableCell>
                        <TableCell className="text-sm">
                          {item.deadline
                            ? dayjs(item.deadline).format("DD/MM/YYYY")
                            : "-"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {scoreGroupLabel(item.scoreGroupId)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={assignmentStatusBadgeClass(item.status)}
                          >
                            {ASSIGNMENT_STATUS_LABEL[item.status]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex flex-wrap justify-end gap-1.5">
                            {canDelegate ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="bg-background"
                                onClick={() => setDelegating(item)}
                                disabled={acting}
                              >
                                <ArrowDownToLine className="h-4 w-4" />
                                Giao xuống
                              </Button>
                            ) : null}
                            {item.status === "ASSIGNED" ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="bg-background"
                                onClick={() => void start(item)}
                                disabled={acting}
                              >
                                <PlayCircle className="h-4 w-4" />
                                Nhận làm
                              </Button>
                            ) : null}
                            {open ? (
                              <Button
                                size="sm"
                                onClick={() => setReporting(item)}
                                disabled={acting}
                              >
                                Báo cáo
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setDetail(item)}
                              >
                                Xem
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          <TablePagination
            page={meta.page}
            limit={limit}
            total={meta.total}
            totalPages={meta.totalPages}
            onPageChange={setPage}
            onLimitChange={setLimit}
            disabled={isLoading}
          />
        </CardContent>
      </Card>

      <AssignmentDetailDrawer
        item={detail}
        onOpenChange={(open) => !open && setDetail(null)}
      />

      <DelegateDialog
        item={delegating}
        onOpenChange={(open) => !open && setDelegating(null)}
        onDone={() => void mutate()}
      />

      <AssignmentReportDialog
        item={reporting}
        onOpenChange={(open) => !open && setReporting(null)}
        onDone={() => void mutate()}
      />
    </div>
  );
}
