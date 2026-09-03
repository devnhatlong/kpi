"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { Check, Eye, Layers, PencilLine, Undo2 } from "lucide-react";
import { toast } from "sonner";

import { SegmentedTabs } from "@/components/common/segmented-tabs";
import { TablePagination } from "@/components/common/table-pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  decideTeamReportDay,
  fetchTeamReportDay,
  fetchTeamReportInbox,
  promoteTeamReport,
  reviewTeamReportDay,
  teamReportKeys,
  type TeamReportReviewRow,
} from "@/features/team-report/api";
import { DynamicColumnCell } from "@/features/team-report/components/dynamic-column-cell";
import {
  TEAM_REPORT_STATUS_LABEL,
  catalogOfColumn,
  inputColumns,
  refName,
  type TeamReportColumn,
  type TeamReportDay,
  type TeamReportDayRow,
  type TeamReportDayStatus,
} from "@/features/team-report/types";
import { getApiErrorMessage } from "@/lib/api-client";
import { formatYmd } from "@/lib/server-time";
import { cn } from "@/lib/utils";

type TabValue = "ALL" | TeamReportDayStatus;

const TABS: Array<{ value: TabValue; label: string }> = [
  { value: "PENDING", label: "Chờ duyệt" },
  { value: "APPROVED", label: "Đã duyệt" },
  { value: "RETURNED", label: "Đã trả lại" },
  { value: "ALL", label: "Tất cả" },
];

const STATUS_CLASS: Record<TeamReportDayStatus, string> = {
  DRAFT: "",
  PENDING:
    "border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200",
  APPROVED:
    "border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  RETURNED:
    "border-red-300 bg-red-100 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200",
};

/**
 * Màn của cấp trên: nhận báo cáo ngày các đội gửi lên.
 *
 * Ba việc trên cùng một màn vì chúng đi liền nhau trong một lượt làm: mở ra
 * xem, chỉnh lại số nào thấy chưa đúng, rồi duyệt. Xong mấy đội thì gộp lại
 * trình lên cấp trên nữa.
 */
export function TeamReportInboxView() {
  const [tab, setTab] = useState<TabValue>("PENDING");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [detail, setDetail] = useState<TeamReportDay | null>(null);
  const [busy, setBusy] = useState(false);
  const [returning, setReturning] = useState<TeamReportDay | null>(null);
  const [returnReason, setReturnReason] = useState("");
  const [promoteIds, setPromoteIds] = useState<Set<string>>(new Set());
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [promoteNote, setPromoteNote] = useState("");

  const query = useMemo(
    () => ({ status: tab === "ALL" ? ("" as const) : tab, page, limit }),
    [tab, page, limit],
  );

  const { data, isLoading, mutate } = useSWR(
    teamReportKeys.incoming(query),
    () => fetchTeamReportInbox(query),
    { keepPreviousData: true },
  );

  // useMemo chứ không phải `?? []`: mảng rỗng mới mỗi lần render sẽ làm mọi
  // useMemo phụ thuộc nó chạy lại liên tục.
  const days = useMemo(() => data?.data ?? [], [data]);
  const meta = data?.meta;

  /* Chỉ gộp được báo cáo ĐÃ DUYỆT và cùng một ngày - server cũng chặn, nhưng
     chặn luôn ở đây thì người dùng không phải bấm rồi mới biết. */
  const approved = useMemo(
    () => days.filter((day) => day.status === "APPROVED"),
    [days],
  );
  const promoteDate = useMemo(() => {
    const picked = approved.filter((day) => promoteIds.has(day._id));
    const dates = new Set(picked.map((day) => day.reportDate));
    return dates.size === 1 ? [...dates][0] : "";
  }, [approved, promoteIds]);

  const refresh = async () => {
    await mutate();
  };

  const decide = async (
    day: TeamReportDay,
    decision: "APPROVE" | "RETURN",
    reason?: string,
  ) => {
    setBusy(true);
    try {
      await decideTeamReportDay(day._id, { decision, reason });
      setReturning(null);
      setReturnReason("");
      setDetail(null);
      await refresh();
      toast.success(decision === "APPROVE" ? "Đã duyệt." : "Đã trả lại.");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không thực hiện được."));
    } finally {
      setBusy(false);
    }
  };

  const confirmPromote = async () => {
    if (!promoteDate) return;
    setBusy(true);
    try {
      const result = await promoteTeamReport({
        reportDate: promoteDate,
        dayIds: [...promoteIds],
        note: promoteNote.trim() || undefined,
      });
      setPromoteOpen(false);
      setPromoteIds(new Set());
      setPromoteNote("");
      await refresh();
      toast.success(`Đã trình bản gộp ${result.rowCount} nhiệm vụ lên trên.`);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không gộp được."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            Duyệt báo cáo ngày
          </h1>
          <p className="text-sm text-muted-foreground">
            Báo cáo ngày các đội gửi lên. Duyệt, chỉnh lại số nếu cần, rồi gộp
            trình lên cấp trên.
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          className="bg-background"
          disabled={promoteIds.size === 0}
          onClick={() => setPromoteOpen(true)}
          title={
            promoteIds.size
              ? undefined
              : "Chọn báo cáo đã duyệt của cùng một ngày để gộp"
          }
        >
          <Layers className="size-4" />
          Gộp &amp; trình lên trên
          {promoteIds.size ? ` (${promoteIds.size})` : ""}
        </Button>
      </div>

      <Card className="shadow-sm">
        <CardContent className="space-y-4 py-4">
          <SegmentedTabs
            ariaLabel="Lọc theo trạng thái"
            value={tab}
            onChange={(next) => {
              setTab(next);
              setPage(1);
              setPromoteIds(new Set());
            }}
            items={TABS}
          />

          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[46px]"></TableHead>
                  <TableHead className="w-[130px]">Ngày</TableHead>
                  <TableHead className="min-w-[240px]">Đội</TableHead>
                  <TableHead className="w-[110px]">Số nhiệm vụ</TableHead>
                  <TableHead className="w-[170px]">Người gửi</TableHead>
                  <TableHead className="w-[130px]">Trạng thái</TableHead>
                  <TableHead className="w-[210px] text-right">
                    Thao tác
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && !days.length ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="h-28 text-center text-muted-foreground"
                    >
                      Đang tải...
                    </TableCell>
                  </TableRow>
                ) : null}

                {!isLoading && !days.length ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="h-28 text-center text-muted-foreground"
                    >
                      Chưa có báo cáo nào ở mục này.
                    </TableCell>
                  </TableRow>
                ) : null}

                {days.map((day) => {
                  const canPick = day.status === "APPROVED";
                  return (
                    <TableRow key={day._id}>
                      <TableCell className="align-middle">
                        <Checkbox
                          checked={promoteIds.has(day._id)}
                          disabled={!canPick}
                          aria-label="Chọn để gộp"
                          onCheckedChange={(checked) => {
                            setPromoteIds((prev) => {
                              const next = new Set(prev);
                              if (checked) next.add(day._id);
                              else next.delete(day._id);
                              return next;
                            });
                          }}
                        />
                      </TableCell>
                      <TableCell className="align-middle tabular-nums">
                        {formatYmd(day.reportDate)}
                      </TableCell>
                      <TableCell className="align-middle font-medium">
                        {refName(day.departmentId) || "Chưa rõ đội"}
                      </TableCell>
                      <TableCell className="align-middle tabular-nums">
                        {day.rows.length}
                      </TableCell>
                      <TableCell className="align-middle text-sm text-muted-foreground">
                        {day.sentByName || "-"}
                      </TableCell>
                      <TableCell className="align-middle">
                        <Badge
                          variant="secondary"
                          className={cn(
                            "font-normal",
                            STATUS_CLASS[day.status],
                          )}
                        >
                          {TEAM_REPORT_STATUS_LABEL[day.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right align-middle">
                        <div className="inline-flex gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="bg-background"
                            onClick={() => setDetail(day)}
                          >
                            <Eye className="size-4" />
                            Chi tiết
                          </Button>
                          {day.status === "PENDING" ? (
                            <>
                              <Button
                                size="sm"
                                disabled={busy}
                                onClick={() => void decide(day, "APPROVE")}
                              >
                                <Check className="size-4" />
                                Duyệt
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                aria-label="Trả lại"
                                className="text-destructive hover:text-destructive"
                                onClick={() => {
                                  setReturning(day);
                                  setReturnReason("");
                                }}
                              >
                                <Undo2 className="size-4" />
                              </Button>
                            </>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <TablePagination
            page={meta?.page ?? page}
            limit={limit}
            total={meta?.total ?? 0}
            totalPages={meta?.totalPages ?? 1}
            onPageChange={setPage}
            onLimitChange={setLimit}
            disabled={isLoading}
          />
        </CardContent>
      </Card>

      {detail ? (
        <TeamReportDayDetailDialog
          dayId={detail._id}
          fallback={detail}
          onOpenChange={(open) => {
            if (!open) setDetail(null);
          }}
          onChanged={async () => {
            await refresh();
          }}
          onApprove={() => void decide(detail, "APPROVE")}
          onReturn={() => {
            setReturning(detail);
            setReturnReason("");
          }}
        />
      ) : null}

      <Dialog
        open={!!returning}
        onOpenChange={(open) => {
          if (!open) setReturning(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Trả lại báo cáo</DialogTitle>
            <DialogDescription>
              Đội sẽ mở lại được bảng của ngày này để sửa. Nêu rõ cần sửa gì.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={returnReason}
            onChange={(e) => setReturnReason(e.target.value)}
            rows={3}
            placeholder="Ví dụ: nhiệm vụ 3 phân loại chưa đúng nội dung"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReturning(null)}>
              Huỷ
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => {
                if (!returning) return;
                if (!returnReason.trim()) {
                  toast.error("Lý do trả lại là bắt buộc.");
                  return;
                }
                void decide(returning, "RETURN", returnReason.trim());
              }}
            >
              Trả lại
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={promoteOpen} onOpenChange={setPromoteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Gộp và trình lên cấp trên</DialogTitle>
            <DialogDescription>
              Gộp {promoteIds.size} báo cáo đã duyệt thành một bản của đơn vị,
              trình lên cấp trên. Cấp trên chỉ thấy bản gộp, không mở lẻ từng
              đội.
            </DialogDescription>
          </DialogHeader>

          {/* Một bản gộp chỉ được gồm báo cáo của cùng một ngày - nói trước
              thay vì để server trả lỗi sau khi đã bấm. */}
          {promoteDate ? (
            <div className="rounded-md border bg-muted/40 px-3 py-2.5 text-sm">
              Ngày báo cáo: <strong>{formatYmd(promoteDate)}</strong>
            </div>
          ) : (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
              Đang chọn báo cáo của nhiều ngày khác nhau. Một bản gộp chỉ gồm
              báo cáo của cùng một ngày.
            </div>
          )}

          <Textarea
            value={promoteNote}
            onChange={(e) => setPromoteNote(e.target.value)}
            rows={3}
            placeholder="Ghi chú gửi kèm (không bắt buộc)"
          />

          <DialogFooter>
            <Button variant="ghost" onClick={() => setPromoteOpen(false)}>
              Huỷ
            </Button>
            <Button
              disabled={busy || !promoteDate}
              onClick={() => void confirmPromote()}
            >
              Trình lên trên
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

type DetailProps = {
  dayId: string;
  /** Bản trong danh sách - bày ngay trong lúc chờ chi tiết tải về. */
  fallback: TeamReportDay;
  onOpenChange: (open: boolean) => void;
  onChanged: () => Promise<void>;
  onApprove: () => void;
  onReturn: () => void;
};

/**
 * Chi tiết một báo cáo ngày, kèm đường chỉnh giá trị ngay tại chỗ.
 *
 * Gọi riêng chứ không dùng bản trong danh sách: bảng chấm phải dựng theo ĐÚNG
 * bộ cột mà mẫu của trục quy định, mà danh sách không mang theo bộ cột đó.
 *
 * Giá trị chỉnh ở đây ghi vào CẢ bản chụp lẫn nhiệm vụ sống của đội, nên hôm sau
 * đội bắt đầu từ con số đã chỉnh - không phải chỉnh lại y hệt mỗi ngày.
 */
function TeamReportDayDetailDialog({
  dayId,
  fallback,
  onOpenChange,
  onChanged,
  onApprove,
  onReturn,
}: DetailProps) {
  const [edits, setEdits] = useState<Record<string, TeamReportReviewRow>>({});
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const { data, isLoading, mutate } = useSWR(
    teamReportKeys.day(dayId),
    () => fetchTeamReportDay(dayId),
    { revalidateOnFocus: false },
  );

  const day = data?.day ?? fallback;
  const templates = useMemo(() => data?.templates ?? {}, [data]);
  const catalogs = useMemo(() => data?.catalogs ?? {}, [data]);

  const decided = day.status === "APPROVED";
  const changedCount = Object.keys(edits).length;

  /*
    Gom theo MẪU: một báo cáo ngày có thể gồm nhiều trục, mỗi trục một bộ cột.
    Nhét chung một bảng thì hàng tiêu đề phải là hợp của mọi trục, và dòng nào
    cũng thừa quá nửa số cột trống trơn.
  */
  const groups = useMemo(() => {
    const byTemplate = new Map<string, TeamReportDayRow[]>();
    for (const row of day.rows) {
      const key = row.formTemplateId
        ? `${row.formTemplateId}:${row.formTemplateVersion ?? 1}`
        : "";
      byTemplate.set(key, [...(byTemplate.get(key) ?? []), row]);
    }
    return [...byTemplate.entries()].map(([key, rows]) => ({
      key,
      template: templates[key] ?? null,
      axisName: rows[0]?.axisName ?? "",
      rows,
    }));
  }, [day.rows, templates]);

  const setValue = (
    row: TeamReportDayRow,
    column: TeamReportColumn,
    next: string,
  ) => {
    const catalog = catalogOfColumn(column);
    setEdits((prev) => {
      const current = prev[row.taskId] ?? { taskId: row.taskId };
      return {
        ...prev,
        [row.taskId]: {
          ...current,
          taskId: row.taskId,
          ...(catalog
            ? {
                catalogValues: {
                  ...(current.catalogValues ?? {}),
                  [column.key]: next,
                },
              }
            : {
                fieldValues: {
                  ...(current.fieldValues ?? {}),
                  [column.key]: next,
                },
              }),
        },
      };
    });
  };

  const save = async () => {
    if (!changedCount) return;
    if (!reason.trim()) {
      toast.error("Nêu lý do chỉnh.");
      return;
    }
    setSaving(true);
    try {
      await reviewTeamReportDay(day._id, {
        reason: reason.trim(),
        rows: Object.values(edits),
      });
      setEdits({});
      setReason("");
      await Promise.all([mutate(), onChanged()]);
      toast.success("Đã chỉnh và ghi vào nhật ký.");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không chỉnh được."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] w-[calc(100%-2rem)] flex-col gap-0 p-0 sm:max-w-[min(96vw,1400px)]">
        <DialogHeader className="border-b px-6 py-4 pr-14 text-left">
          <DialogTitle className="flex flex-wrap items-center gap-2 text-base">
            {refName(day.departmentId) || "Báo cáo ngày"}
            <Badge
              variant="secondary"
              className={cn("font-normal", STATUS_CLASS[day.status])}
            >
              {TEAM_REPORT_STATUS_LABEL[day.status]}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            Ngày {formatYmd(day.reportDate)} · {day.rows.length} nhiệm vụ
            {day.sentByName ? ` · người gửi ${day.sentByName}` : ""}
            {day.note ? ` · "${day.note}"` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-auto px-6 py-4">
          {isLoading && !data ? (
            <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">
              Đang tải bộ cột của báo cáo...
            </div>
          ) : null}

          {groups.map((group) => {
            const columns = inputColumns(group.template);
            return (
              <div key={group.key || "__no_template__"} className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-display text-sm font-semibold">
                    {group.axisName || "Chưa gắn trục"}
                  </h3>
                  <Badge variant="secondary" className="font-normal">
                    {group.rows.length} nhiệm vụ
                  </Badge>
                  {group.template ? (
                    <span className="text-xs text-muted-foreground">
                      Mẫu: {group.template.name} (bản {group.template.version})
                    </span>
                  ) : null}
                </div>

                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[240px]">
                          Nhiệm vụ
                        </TableHead>
                        <TableHead className="w-[220px]">
                          Nội dung công việc
                        </TableHead>
                        {columns.map((column) => (
                          <TableHead
                            key={column.key}
                            style={{ minWidth: Math.max(120, column.width) }}
                          >
                            {column.title}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.rows.map((row) => (
                        <TableRow key={row.taskId}>
                          <TableCell className="max-w-[340px] whitespace-normal break-words align-middle">
                            <div className="font-medium">{row.name}</div>
                            {/* Sản phẩm nằm cùng ô với tên việc chứ không thêm
                                cột: bảng này đã gánh cả bộ cột của mẫu, thêm
                                cột nữa là đẩy phần chấm ra khỏi màn hình. */}
                            {row.product ? (
                              <div className="text-xs text-muted-foreground">
                                Sản phẩm: {row.product}
                              </div>
                            ) : null}
                            <div className="text-xs text-muted-foreground tabular-nums">
                              {row.deadline
                                ? `Hạn ${formatYmd(row.deadline)}`
                                : "Không đặt hạn"}
                              {row.closed ? " · đã đóng trong lượt này" : ""}
                            </div>
                          </TableCell>
                          <TableCell className="align-middle text-sm">
                            {row.workContentName || "-"}
                          </TableCell>
                          {columns.map((column) => {
                            const catalog = catalogOfColumn(column);
                            const value = catalog
                              ? (row.catalogValues?.[column.key]?.id ?? "")
                              : String(row.fieldValues?.[column.key] ?? "");
                            return (
                              <TableCell
                                key={column.key}
                                className="align-middle"
                              >
                                <DynamicColumnCell
                                  column={column}
                                  value={value}
                                  catalogs={catalogs}
                                  disabled={decided}
                                  onCommit={(next) =>
                                    setValue(row, column, next)
                                  }
                                />
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            );
          })}

          {day.edits?.length ? (
            <div className="rounded-md border p-3 text-sm">
              <p className="mb-1.5 font-medium">Nhật ký chỉnh sửa</p>
              <ul className="space-y-1 text-muted-foreground">
                {day.edits.map((edit, index) => (
                  <li key={index}>
                    {edit.byName}: {edit.field} {edit.from || "trống"} →{" "}
                    {edit.to || "trống"} - {edit.reason}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {!decided && changedCount ? (
            <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/40">
              <p className="text-sm font-medium">
                Đang chỉnh {changedCount} nhiệm vụ. Giá trị này ghi vào cả bản
                đã trình lẫn nhiệm vụ đang chạy của đội.
              </p>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                placeholder="Lý do chỉnh (bắt buộc)"
                className="bg-background"
              />
            </div>
          ) : null}
        </div>

        <DialogFooter className="border-t px-6 py-4">
          {!decided && changedCount ? (
            <Button
              variant="outline"
              className="bg-background"
              disabled={saving}
              onClick={() => void save()}
            >
              <PencilLine className="size-4" />
              Lưu giá trị đã chỉnh
            </Button>
          ) : null}
          {day.status === "PENDING" ? (
            <>
              <Button variant="ghost" onClick={onReturn}>
                <Undo2 className="size-4" />
                Trả lại
              </Button>
              <Button onClick={onApprove}>
                <Check className="size-4" />
                Duyệt
              </Button>
            </>
          ) : (
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Đóng
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
