"use client";

import { useState } from "react";
import { CheckCircle2, Inbox, Plus, Search, XCircle } from "lucide-react";
import dayjs from "dayjs";
import useSWR from "swr";
import { toast } from "sonner";

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
import { Textarea } from "@/components/ui/textarea";
import { TablePagination } from "@/components/common/table-pagination";
import {
  approveAssignment,
  assignmentKeys,
  fetchIssuedAssignments,
  rejectAssignment,
} from "@/features/kpi-assignment/api";
import { AssignTaskDrawer } from "@/features/kpi-assignment/components/assign-task-drawer";
import { AssignmentDetailDrawer } from "@/features/kpi-assignment/components/assignment-detail-drawer";
import { assignmentStatusBadgeClass } from "@/features/kpi-assignment/status-styles";
import {
  ASSIGNMENT_STATUS_LABEL,
  ASSIGNMENT_STATUSES,
  holderLabel,
  refLabel,
  type AssignmentStatus,
  type KpiAssignment,
} from "@/features/kpi-assignment/types";
import { useListPagination } from "@/hooks/use-list-pagination";
import { getApiErrorMessage } from "@/lib/api-client";
import { emptyPaginationMeta, rowIndex } from "@/lib/pagination";

const ALL = "ALL";

export function IssuedAssignmentsView() {
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
    assignmentKeys.issued(listQuery),
    () => fetchIssuedAssignments(listQuery),
  );

  const items = data?.data ?? [];
  const meta = data?.meta ?? emptyPaginationMeta(limit);

  const [assignOpen, setAssignOpen] = useState(false);
  const [detail, setDetail] = useState<KpiAssignment | null>(null);
  const [rejecting, setRejecting] = useState<KpiAssignment | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [acting, setActing] = useState(false);

  const approve = async (item: KpiAssignment) => {
    setActing(true);
    try {
      await approveAssignment(item._id);
      toast.success("Đã duyệt nhiệm vụ.");
      await mutate();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không duyệt được nhiệm vụ."));
    } finally {
      setActing(false);
    }
  };

  const confirmReject = async () => {
    if (!rejecting) return;
    if (!rejectReason.trim()) {
      toast.error("Vui lòng nhập lý do trả lại.");
      return;
    }
    setActing(true);
    try {
      await rejectAssignment(rejecting._id, rejectReason.trim());
      toast.success("Đã trả lại nhiệm vụ.");
      setRejecting(null);
      setRejectReason("");
      await mutate();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không trả lại được nhiệm vụ."));
    } finally {
      setActing(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            Giao KPI xuống
          </h1>
          <p className="text-sm text-muted-foreground">
            Nhiệm vụ bạn ban hành hoặc đã giao tiếp xuống. Cấp dưới gửi kết quả
            lên thì duyệt hoặc trả lại tại đây.
          </p>
        </div>
        <Button onClick={() => setAssignOpen(true)}>
          <Plus className="h-4 w-4" />
          Giao nhiệm vụ
        </Button>
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
                  <TableHead className="w-[180px]">Đang ở</TableHead>
                  <TableHead className="w-[120px]">Thời hạn</TableHead>
                  <TableHead className="w-[100px]">Tiến độ</TableHead>
                  <TableHead className="w-[130px]">Trạng thái</TableHead>
                  <TableHead className="w-[190px] text-right">
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
                        <span>Chưa giao nhiệm vụ nào.</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((item, index) => (
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
                          {refLabel(item.axisId)} · {refLabel(item.workContentId)}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {holderLabel(item)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {item.deadline
                          ? dayjs(item.deadline).format("DD/MM/YYYY")
                          : "-"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {item.progressPercent != null
                          ? `${item.progressPercent}%`
                          : "-"}
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
                        {item.status === "SUBMITTED" ? (
                          <div className="inline-flex gap-1.5">
                            <Button
                              size="sm"
                              className="bg-emerald-600 text-white hover:bg-emerald-700"
                              onClick={() => void approve(item)}
                              disabled={acting}
                            >
                              <CheckCircle2 className="h-4 w-4" />
                              Duyệt
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => {
                                setRejecting(item);
                                setRejectReason("");
                              }}
                              disabled={acting}
                            >
                              <XCircle className="h-4 w-4" />
                              Trả lại
                            </Button>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDetail(item)}
                          >
                            Xem
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
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

      <AssignTaskDrawer
        open={assignOpen}
        onOpenChange={setAssignOpen}
        onSaved={() => void mutate()}
      />

      <AssignmentDetailDrawer
        item={detail}
        onOpenChange={(open) => !open && setDetail(null)}
      />

      <Dialog
        open={!!rejecting}
        onOpenChange={(open) => !open && setRejecting(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Trả lại nhiệm vụ</DialogTitle>
            <DialogDescription className="line-clamp-2">
              {rejecting?.title}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="reject-reason">
              Lý do trả lại <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="reject-reason"
              rows={4}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Nêu rõ cần bổ sung gì..."
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRejecting(null)}
              disabled={acting}
            >
              Hủy
            </Button>
            <Button
              variant="destructive"
              onClick={() => void confirmReject()}
              disabled={acting}
            >
              Trả lại
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
