"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ClipboardList,
  Pencil,
  Plus,
  Search,
  Send,
  Trash2,
} from "lucide-react";
import useSWR from "swr";
import { toast } from "sonner";

import { TablePagination } from "@/components/common/table-pagination";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { fetchAxesAll } from "@/features/kpi-form-config/api";
import { entityId } from "@/features/kpi-form-config/types";
import {
  deletePersonalKpi,
  fetchMyPersonalKpi,
  personalKpiKeys,
  submitPersonalKpiReport,
  type SubmitPersonalKpiPayload,
} from "@/features/personal-kpi/api";
import { PersonalTaskDrawer } from "@/features/personal-kpi/components/personal-task-drawer";
import { SendRecipientDialog } from "@/features/personal-kpi/components/send-recipient-dialog";
import { personalKpiStatusBadgeClass } from "@/features/personal-kpi/status-styles";
import {
  PERSONAL_KPI_STATUS_LABEL,
  canDeletePersonalKpi,
  canEditPersonalKpi,
  canSendPersonalKpi,
  type PersonalKpiItem,
  type PersonalKpiStatus,
} from "@/features/personal-kpi/types";
import { useListPagination } from "@/hooks/use-list-pagination";
import { getApiErrorMessage } from "@/lib/api-client";
import { emptyPaginationMeta, rowIndex } from "@/lib/pagination";

const STATUS_FILTERS: Array<{ value: string; label: string }> = [
  { value: "ALL", label: "Tất cả trạng thái" },
  { value: "DRAFT", label: PERSONAL_KPI_STATUS_LABEL.DRAFT },
  { value: "PENDING", label: PERSONAL_KPI_STATUS_LABEL.PENDING },
  { value: "APPROVED", label: PERSONAL_KPI_STATUS_LABEL.APPROVED },
  { value: "RETURNED", label: PERSONAL_KPI_STATUS_LABEL.RETURNED },
];

function formatDateTime(value?: string) {
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

function catalogOptionLabel(item: { name: string; description?: string }) {
  const name = item.name.trim();
  const description = item.description?.trim();
  if (!description || description === name) return name;
  return `${name} (${description})`;
}

type PersonalKpiDayViewProps = {
  reportDate: string;
};

export function PersonalKpiDayView({ reportDate }: PersonalKpiDayViewProps) {
  const { page, setPage, limit, setLimit, query, setQuery, debouncedQuery } =
    useListPagination();
  const [status, setStatus] = useState("ALL");
  const [axisId, setAxisId] = useState("ALL");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [edit, setEdit] = useState<PersonalKpiItem | null>(null);
  const [deleting, setDeleting] = useState<PersonalKpiItem | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [sendingItem, setSendingItem] = useState<PersonalKpiItem | null>(null);
  const [sendAllOpen, setSendAllOpen] = useState(false);
  const [sending, setSending] = useState(false);

  const { data: axes = [] } = useSWR(
    ["axes", "all", "personal-kpi-day"],
    fetchAxesAll,
  );

  const listParams = useMemo(
    () => ({
      reportDate,
      page,
      limit,
      q: debouncedQuery,
      status:
        status === "ALL" ? undefined : (status as PersonalKpiStatus),
      axisId: axisId === "ALL" ? undefined : axisId,
    }),
    [reportDate, page, limit, debouncedQuery, status, axisId],
  );

  const { data, isLoading, mutate } = useSWR(
    personalKpiKeys.byDate(listParams),
    () => fetchMyPersonalKpi(listParams),
  );

  const items = data?.data ?? [];
  const meta = data?.meta ?? emptyPaginationMeta(limit);

  /** Nhiệm vụ gửi được trong ngày - dùng cho nút "Gửi báo cáo". */
  const sendableItems = items.filter((item) => canSendPersonalKpi(item.status));
  /** Báo cáo đã từng gửi lần nào chưa - đổi nhãn nút cho đúng việc. */
  const everSent = items.some((item) => Boolean(item.sentAt));

  const resetFilters = () => {
    setQuery("");
    setStatus("ALL");
    setAxisId("ALL");
    setPage(1);
  };

  const openCreate = () => {
    setEdit(null);
    setDrawerOpen(true);
  };

  const openEdit = (item: PersonalKpiItem) => {
    if (!canEditPersonalKpi(item.status)) {
      toast.error(
        item.status === "PENDING"
          ? "Đã gửi, đang chờ cấp trên duyệt - không sửa được."
          : "Nhiệm vụ đã duyệt - không sửa được.",
      );
      return;
    }
    setEdit(item);
    setDrawerOpen(true);
  };

  const openSend = (item: PersonalKpiItem) => {
    if (!canSendPersonalKpi(item.status)) {
      toast.error("Chỉ gửi được khi đang Nháp hoặc bị Trả lại.");
      return;
    }
    setSendingItem(item);
  };

  const refreshDay = async () => {
    await mutate();
  };

  /**
   * Gửi luôn đi qua API báo cáo ngày; gửi một dòng chỉ là truyền đúng một id.
   * Nhờ vậy mỗi lần gửi vẫn sinh ra một lượt gửi có người nhận và ghi chú.
   */
  const confirmSend = async (payload: SubmitPersonalKpiPayload) => {
    const targets = sendingItem ? [sendingItem] : sendableItems;
    if (!targets.length) return;
    setSending(true);
    setActingId(sendingItem?.id ?? null);
    try {
      const result = await submitPersonalKpiReport(reportDate, {
        ...payload,
        itemIds: targets.map((item) => item.id),
      });
      await refreshDay();
      toast.success(
        `Đã gửi ${result.sentCount} nhiệm vụ tới ${result.recipientName}.`,
      );
      setSendingItem(null);
      setSendAllOpen(false);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không gửi được nhiệm vụ."));
    } finally {
      setSending(false);
      setActingId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setActingId(deleting.id);
    try {
      await deletePersonalKpi(deleting.id);
      await refreshDay();
      toast.success("Đã xoá nhiệm vụ.");
      setDeleting(null);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không xoá được nhiệm vụ."));
    } finally {
      setActingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <Button
            asChild
            variant="outline"
            size="sm"
            className="-ml-2 w-fit bg-background"
          >
            <Link href="/kpi/personal">
              <ArrowLeft className="h-4 w-4" />
              Danh sách báo cáo
            </Link>
          </Button>
          <div className="space-y-1">
            <h1 className="font-display text-2xl font-semibold tracking-tight capitalize">
              {formatReportDate(reportDate)}
            </h1>
            <p className="text-sm text-muted-foreground">
              Chi tiết nhiệm vụ trong báo cáo ngày{" "}
              <span className="font-mono">{reportDate}</span>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Thêm nhiệm vụ
          </Button>
          <Button
            onClick={() => setSendAllOpen(true)}
            disabled={sendableItems.length === 0}
            title={
              sendableItems.length === 0
                ? "Không còn nhiệm vụ Nháp hoặc Trả lại nào để gửi"
                : undefined
            }
          >
            <Send className="h-4 w-4" />
            {everSent ? "Gửi lại" : "Gửi báo cáo"} ({sendableItems.length})
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-2 xl:col-span-2">
              <Label htmlFor="day-search">Tìm nhiệm vụ</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="day-search"
                  className="bg-background pl-8 placeholder:text-muted-foreground/70"
                  placeholder="Tên nhiệm vụ..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
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
            <div className="space-y-2">
              <Label>Trục</Label>
              <Select
                value={axisId}
                onValueChange={(value) => {
                  setAxisId(value);
                  setPage(1);
                }}
              >
                <SelectTrigger className="bg-background">
                  <SelectValue placeholder="Trục" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Tất cả trục</SelectItem>
                  {axes.map((axis) => (
                    <SelectItem key={entityId(axis)} value={entityId(axis)}>
                      {catalogOptionLabel(axis)}
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
                  <TableHead>Nhiệm vụ</TableHead>
                  <TableHead className="w-[160px]">Trục</TableHead>
                  <TableHead className="w-[220px]">Nội dung công việc</TableHead>
                  <TableHead className="w-[100px]">Điểm chuẩn</TableHead>
                  <TableHead className="w-[110px]">Trạng thái</TableHead>
                  <TableHead className="w-[160px]">Ngày tạo</TableHead>
                  <TableHead className="w-[160px]">Ngày gửi</TableHead>
                  <TableHead className="w-[130px] text-right">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell
                      colSpan={9}
                      className="h-28 text-center text-muted-foreground"
                    >
                      Đang tải...
                    </TableCell>
                  </TableRow>
                ) : items.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={9}
                      className="h-28 text-center text-muted-foreground"
                    >
                      <div className="inline-flex flex-col items-center gap-2">
                        <ClipboardList className="h-8 w-8 opacity-40" />
                        <span>Không có nhiệm vụ phù hợp bộ lọc.</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((item, index) => (
                    <TableRow key={item.id}>
                      <TableCell className="text-muted-foreground">
                        {rowIndex(page, limit, index)}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{item.task.title}</div>
                        {item.rejectReason ? (
                          <div className="text-xs text-amber-600 dark:text-amber-400">
                            Lý do trả lại: {item.rejectReason}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {item.axisName}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {item.workContentName}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {item.task.standardScore || "-"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={personalKpiStatusBadgeClass(item.status)}
                        >
                          {PERSONAL_KPI_STATUS_LABEL[item.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDateTime(item.createdAt)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDateTime(item.sentAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => openEdit(item)}
                            aria-label="Sửa"
                            disabled={
                              !canEditPersonalKpi(item.status) ||
                              actingId === item.id
                            }
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {/* Chỉ dòng đã từng gửi (bị trả lại rồi sửa) mới gửi
                              lẻ được; báo cáo mới thì gửi cả lượt ở trên. */}
                          {item.status === "DRAFT" && item.sentAt ? (
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => openSend(item)}
                              aria-label="Gửi lại"
                              title="Gửi lại nhiệm vụ này"
                              disabled={actingId === item.id}
                            >
                              <Send className="h-4 w-4" />
                            </Button>
                          ) : null}
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setDeleting(item)}
                            aria-label="Xoá"
                            disabled={
                              !canDeletePersonalKpi(item.status) ||
                              actingId === item.id
                            }
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
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
        edit={edit}
        reportDate={reportDate}
        onSaved={async () => {
          await refreshDay();
        }}
      />

      <AlertDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xoá nhiệm vụ nháp?</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn sắp xoá{" "}
              <span className="font-medium text-foreground">
                {deleting?.task.title}
              </span>
              .
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDelete()}>
              Xoá
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SendRecipientDialog
        open={!!sendingItem || sendAllOpen}
        onOpenChange={(open) => {
          if (open || sending) return;
          setSendingItem(null);
          setSendAllOpen(false);
        }}
        title={
          sendingItem
            ? "Gửi nhiệm vụ"
            : `Gửi báo cáo ngày (${sendableItems.length} nhiệm vụ)`
        }
        submitting={sending}
        onConfirm={confirmSend}
      />
    </div>
  );
}
