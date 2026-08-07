"use client";

import { useMemo, useState } from "react";
import { Check, Inbox, LayoutTemplate, Search, Send, TriangleAlert, Undo2 } from "lucide-react";
import useSWR from "swr";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { FormTemplateColumn } from "@/features/kpi-form-config/types";
import {
  fetchPersonalKpiBoard,
  forwardPersonalKpi,
  reviewPersonalKpi,
  type PersonalKpiBoardAxis,
  type PersonalKpiBoardRow,
  type PersonalKpiBoardQuery,
} from "@/features/personal-kpi/api";
import { SendRecipientDialog } from "@/features/personal-kpi/components/send-recipient-dialog";
import { TaskTableHeader } from "@/features/personal-kpi/components/task-table-header";
import { personalKpiStatusBadgeClass } from "@/features/personal-kpi/status-styles";
import {
  PERSONAL_KPI_STATUS_LABEL,
  type PersonalKpiStatus,
} from "@/features/personal-kpi/types";
import { getApiErrorMessage } from "@/lib/api-client";
import { cn } from "@/lib/utils";

const STATUS_FILTERS: Array<{ value: string; label: string }> = [
  { value: "PENDING", label: "Chờ tôi duyệt" },
  { value: "APPROVED", label: "Tôi đã duyệt" },
  { value: "RETURNED", label: "Tôi đã trả lại" },
  { value: "ALL", label: "Tất cả đang ở chỗ tôi" },
];

function refLabel(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return "";
  const ref = value as { name?: string; fullName?: string; username?: string };
  return ref.fullName ?? ref.name ?? ref.username ?? "";
}

/** Giá trị hiển thị của một ô theo ý nghĩa cột của mẫu. */
function cellText(row: PersonalKpiBoardRow, column: FormTemplateColumn): string {
  switch (column.semanticKey) {
    case "task_title":
      return row.title ?? "";
    case "work_content":
      return refLabel(row.workContentId);
    case "deadline":
      return row.deadline ?? "";
    case "product":
      return row.product ?? "";
    case "standard_score":
      return row.standardScore == null ? "" : String(row.standardScore);
    case "executing_unit":
      return row.executingUnit ?? "";
    case "progress_percent":
      return row.progressPercent == null ? "" : `${row.progressPercent}%`;
    case "progress_self_score":
      return row.progressSelfScore == null ? "" : String(row.progressSelfScore);
    case "quality_percent":
      return row.qualityPercent == null ? "" : `${row.qualityPercent}%`;
    case "quality_self_score":
      return row.qualitySelfScore == null ? "" : String(row.qualitySelfScore);
    case "note":
      return row.note ?? "";
    case "evidence_files":
      return row.evidenceFiles?.length
        ? `${row.evidenceFiles.length} tệp`
        : "";
    case "custom": {
      const value = row.fieldValues?.[column.key];
      return value == null ? "" : String(value);
    }
    default:
      return "";
  }
}

function isTickedCell(
  row: PersonalKpiBoardRow,
  column: FormTemplateColumn,
): boolean {
  if (column.semanticKey === "result_passed") return row.resultPassed === true;
  if (column.semanticKey === "result_failed") return row.resultFailed === true;
  return row.fieldValues?.[column.key] === "1";
}

export function PersonalKpiBoardView() {
  const [reportDate, setReportDate] = useState("");
  const [status, setStatus] = useState("PENDING");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [returnOpen, setReturnOpen] = useState(false);
  const [returnReason, setReturnReason] = useState("");
  const [forwardOpen, setForwardOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const params: PersonalKpiBoardQuery = useMemo(
    () => ({
      reportDate: reportDate || undefined,
      status:
        status === "ALL" ? undefined : (status as PersonalKpiStatus),
      includeDecided: status === "ALL",
      q: q.trim() || undefined,
    }),
    [reportDate, status, q],
  );

  const { data, isLoading, mutate } = useSWR(
    [
      "personal-kpi-board",
      params.reportDate ?? "",
      params.status ?? "",
      params.q ?? "",
      params.includeDecided ? "1" : "",
    ],
    () => fetchPersonalKpiBoard(params),
  );

  const axes = data?.axes ?? [];

  const allRows = useMemo(
    () => axes.flatMap((axis) => axis.groups.flatMap((group) => group.rows)),
    [axes],
  );
  const byId = useMemo(
    () => new Map(allRows.map((row) => [row._id, row])),
    [allRows],
  );

  const selectedRows = [...selected]
    .map((id) => byId.get(id))
    .filter((row): row is PersonalKpiBoardRow => Boolean(row));
  const selectedPending = selectedRows.filter(
    (row) => row.reviewStatus === "PENDING",
  );
  const selectedForwardable = selectedRows.filter(
    (row) =>
      (row.holderLevel ?? 0) >= 1 &&
      (row.reviewStatus === "APPROVED" || row.reviewStatus === "RETURNED"),
  );

  const toggleRow = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleGroup = (rows: PersonalKpiBoardRow[]) => {
    const ids = rows.map((row) => row._id);
    const allOn = ids.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (allOn) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  };

  const afterAction = async () => {
    setSelected(new Set());
    await mutate();
  };

  const doApprove = async () => {
    if (!selectedPending.length) return;
    setBusy(true);
    try {
      const result = await reviewPersonalKpi({
        itemIds: selectedPending.map((row) => row._id),
        decision: "APPROVE",
      });
      toast.success(`Đã duyệt ${result.count} nhiệm vụ.`);
      await afterAction();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không duyệt được."));
    } finally {
      setBusy(false);
    }
  };

  const doReturn = async () => {
    const reason = returnReason.trim();
    if (!reason) {
      toast.error("Lý do trả lại là bắt buộc.");
      return;
    }
    setBusy(true);
    try {
      const result = await reviewPersonalKpi({
        itemIds: selectedPending.map((row) => row._id),
        decision: "RETURN",
        reason,
      });
      toast.success(`Đã trả lại ${result.count} nhiệm vụ.`);
      setReturnOpen(false);
      setReturnReason("");
      await afterAction();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không trả lại được."));
    } finally {
      setBusy(false);
    }
  };

  const doForward = async (payload: { recipientId: string; note: string }) => {
    setBusy(true);
    try {
      const result = await forwardPersonalKpi({
        itemIds: selectedForwardable.map((row) => row._id),
        recipientId: payload.recipientId,
        note: payload.note,
      });
      toast.success(
        `Đã gửi ${result.sentCount} nhiệm vụ lên ${result.recipientName}.`,
      );
      setForwardOpen(false);
      await afterAction();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không gửi lên được."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          Duyệt KPI cấp dưới
        </h1>
        <p className="text-sm text-muted-foreground">
          Nhiệm vụ cấp dưới gửi lên, xếp đúng vị trí trong bảng của từng trục.
          Tích chọn để duyệt, trả lại, hoặc gửi tiếp lên cấp trên.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-3 pt-6">
          <div className="grid gap-3 md:grid-cols-[1fr_200px_220px]">
            <div className="space-y-1.5">
              <Label>Tìm nhiệm vụ</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-8"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Tên nhiệm vụ..."
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Ngày báo cáo</Label>
              <Input
                type="date"
                value={reportDate}
                onChange={(e) => setReportDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Trạng thái</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
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

          <div className="flex flex-wrap items-center gap-2 border-t pt-3">
            <span className="text-sm text-muted-foreground">
              Đã chọn <b className="text-foreground">{selected.size}</b> nhiệm vụ
            </span>
            <div className="ml-auto flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() => void doApprove()}
                disabled={busy || selectedPending.length === 0}
              >
                <Check className="size-4" />
                Duyệt ({selectedPending.length})
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setReturnOpen(true)}
                disabled={busy || selectedPending.length === 0}
              >
                <Undo2 className="size-4" />
                Trả lại ({selectedPending.length})
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setForwardOpen(true)}
                disabled={busy || selectedForwardable.length === 0}
                title={
                  selectedForwardable.length === 0
                    ? "Phải duyệt trước khi gửi lên cấp trên"
                    : undefined
                }
              >
                <Send className="size-4" />
                Gửi lên cấp trên ({selectedForwardable.length})
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Đang tải bảng tổng...
          </CardContent>
        </Card>
      ) : axes.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-14 text-muted-foreground">
            <Inbox className="size-10 opacity-40" />
            <p className="text-sm">Không có nhiệm vụ nào ở trạng thái này.</p>
          </CardContent>
        </Card>
      ) : (
        axes.map((axis) => (
          <AxisBoardBlock
            key={`${axis.axisId}-${axis.template?.version ?? "live"}`}
            axis={axis}
            selected={selected}
            onToggleRow={toggleRow}
            onToggleGroup={toggleGroup}
          />
        ))
      )}

      {data?.truncated ? (
        <p className="text-center text-xs text-muted-foreground">
          Danh sách đang bị cắt bớt vì quá nhiều dòng - lọc theo ngày báo cáo để
          xem đủ.
        </p>
      ) : null}

      <Dialog open={returnOpen} onOpenChange={setReturnOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Trả lại nhiệm vụ</DialogTitle>
            <DialogDescription>
              {selectedPending.length} nhiệm vụ sẽ quay về chỗ người đã gửi để
              sửa lại.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="return-reason">
              Lý do trả lại <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="return-reason"
              rows={4}
              value={returnReason}
              onChange={(e) => setReturnReason(e.target.value)}
              placeholder="Nêu rõ chỗ cần sửa..."
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setReturnOpen(false)}
              disabled={busy}
            >
              Hủy
            </Button>
            <Button onClick={() => void doReturn()} disabled={busy}>
              {busy ? "Đang trả lại..." : "Trả lại"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SendRecipientDialog
        open={forwardOpen}
        onOpenChange={(open) => {
          if (!open && !busy) setForwardOpen(false);
        }}
        title={`Gửi lên cấp trên (${selectedForwardable.length} nhiệm vụ)`}
        submitting={busy}
        onConfirm={doForward}
      />
    </div>
  );
}

function AxisBoardBlock({
  axis,
  selected,
  onToggleRow,
  onToggleGroup,
}: {
  axis: PersonalKpiBoardAxis;
  selected: Set<string>;
  onToggleRow: (id: string) => void;
  onToggleGroup: (rows: PersonalKpiBoardRow[]) => void;
}) {
  const template = axis.template;

  if (!template?.columns?.length) {
    const count = axis.groups.reduce(
      (sum, group) => sum + group.rows.length,
      0,
    );
    return (
      <Card>
        <CardContent className="space-y-2 pt-6">
          <p className="text-sm font-semibold">
            Trục: {axis.axisName || axis.axisCode}
          </p>
          <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-amber-500/40 bg-amber-500/5 p-6 text-center">
            <TriangleAlert className="size-6 text-amber-600 dark:text-amber-500" />
            <p className="text-sm font-medium">Trục này chưa gán mẫu bảng</p>
            <p className="max-w-md text-xs text-muted-foreground">
              {count} nhiệm vụ đang chờ nhưng chưa dựng được bảng. Gán mẫu tại
              Cấu hình form KPI › Mẫu bảng KPI rồi mở lại trang này.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const visible = template.columns.filter((column) => column.visible);
  const leading = [
    { key: "pick", label: "", width: 44 },
    { key: "sender", label: "Người gửi", width: 190 },
  ];
  const totalCols = visible.length + leading.length + 1;
  const minWidth =
    visible.reduce((sum, column) => sum + column.width, 0) + 380;

  return (
    <Card>
      <CardContent className="space-y-2 pt-6">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold">
            Trục: {axis.axisName || axis.axisCode}
          </p>
          <Badge variant="outline" className="gap-1.5 font-normal">
            <LayoutTemplate className="size-3.5" />
            Mẫu: {template.code} · {template.name} · v{template.version}
          </Badge>
        </div>

        <div className="overflow-auto rounded-md border bg-card">
          <Table style={{ minWidth }}>
            <TaskTableHeader
              columns={template.columns}
              headerGroups={template.headerGroups}
              leadingColumns={leading}
              actionLabel="Trạng thái"
            />
            <TableBody>
              {axis.groups.map((group) => {
                const allOn =
                  group.rows.length > 0 &&
                  group.rows.every((row) => selected.has(row._id));
                return (
                  <>
                    <TableRow
                      key={`grp-${group.workContentId}`}
                      className="bg-muted/40 hover:bg-muted/40"
                    >
                      <TableCell colSpan={totalCols} className="py-2">
                        <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
                          <Checkbox
                            checked={allOn}
                            onCheckedChange={() => onToggleGroup(group.rows)}
                          />
                          {group.workContentName || group.workContentCode}
                          <span className="font-normal text-muted-foreground">
                            · {group.rows.length} nhiệm vụ
                          </span>
                        </label>
                      </TableCell>
                    </TableRow>

                    {group.rows.map((row) => (
                      <TableRow key={row._id}>
                        <TableCell className="align-middle">
                          <Checkbox
                            checked={selected.has(row._id)}
                            onCheckedChange={() => onToggleRow(row._id)}
                            aria-label={`Chọn ${row.title}`}
                          />
                        </TableCell>
                        <TableCell className="align-middle text-sm">
                          <div className="font-medium">
                            {refLabel(row.lastSenderId) ||
                              refLabel(row.ownerId) ||
                              "-"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {refLabel(row.lastSenderDepartmentId) ||
                              refLabel(row.ownerDepartmentId) ||
                              ""}
                          </div>
                        </TableCell>

                        {visible.map((column) => {
                          if (column.dataType === "boolean") {
                            return (
                              <TableCell
                                key={column.id}
                                className="text-center align-middle"
                              >
                                {isTickedCell(row, column) ? (
                                  <Check className="mx-auto size-4 text-emerald-600" />
                                ) : (
                                  <span className="text-muted-foreground">
                                    -
                                  </span>
                                )}
                              </TableCell>
                            );
                          }
                          return (
                            <TableCell
                              key={column.id}
                              className="align-middle text-sm"
                              style={{ minWidth: column.width }}
                            >
                              {cellText(row, column) || (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                          );
                        })}

                        <TableCell className="align-middle text-center">
                          <Badge
                            variant="secondary"
                            className={cn(
                              personalKpiStatusBadgeClass(row.reviewStatus),
                            )}
                          >
                            {PERSONAL_KPI_STATUS_LABEL[row.reviewStatus] ??
                              row.reviewStatus}
                          </Badge>
                          {row.returnReason ? (
                            <p className="mt-1 max-w-[180px] text-xs text-rose-600">
                              {row.returnReason}
                            </p>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))}
                  </>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
