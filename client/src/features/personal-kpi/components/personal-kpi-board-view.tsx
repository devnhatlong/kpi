"use client";

import { Fragment, useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  CheckCheck,
  Inbox,
  Search,
  Send,
  TriangleAlert,
  Undo2,
} from "lucide-react";
import useSWR from "swr";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/common/searchable-select";
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
import {
  fetchAxesAll,
  fetchWorkContentsAll,
} from "@/features/kpi-form-config/api";
import { entityId } from "@/features/kpi-form-config/types";
import { fetchDepartments } from "@/features/organization/api";
import {
  fetchPersonalKpiBoard,
  forwardPersonalKpi,
  mapPersonalKpiFromApi,
  reviewPersonalKpi,
  type PersonalKpiBoardAxis,
  type PersonalKpiBoardRow,
  type PersonalKpiBoardQuery,
} from "@/features/personal-kpi/api";
import { summarizeTask } from "@/features/personal-kpi/task-summary";
import {
  cellText,
  computeAxisFooter,
  formatScoreNumber,
  isTickedCell,
  refLabel,
} from "@/features/personal-kpi/board-cell";
import { useQualityLevelMap } from "@/features/kpi-form-config/use-quality-levels";
import { useScoreGroupMap } from "@/features/kpi-form-config/use-score-groups";
import { AttachmentCell } from "@/features/personal-kpi/components/attachment-cell";
import {
  BoardDepartmentTable,
  filterAxesByDepartment,
  summarizeByDepartment,
} from "@/features/personal-kpi/components/board-department-table";
import { SendRecipientDialog } from "@/features/personal-kpi/components/send-recipient-dialog";
import { TaskTableHeader } from "@/features/personal-kpi/components/task-table-header";
import { personalKpiStatusBadgeClass } from "@/features/personal-kpi/status-styles";
import {
  PERSONAL_KPI_STATUS_LABEL,
  type PersonalKpiStatus,
} from "@/features/personal-kpi/types";
import { getApiErrorMessage } from "@/lib/api-client";
import { cn } from "@/lib/utils";

const ALL = "ALL";

const STATUS_FILTERS: Array<{ value: string; label: string }> = [
  { value: "PENDING", label: "Chờ tôi duyệt" },
  // Không có nhiệm vụ mới nào rơi vào đây nữa - giữ để dữ liệu cũ còn chỗ xử lý.
  { value: "APPROVED", label: "Duyệt tồn (cũ)" },
  { value: "RETURNED", label: "Tôi đã trả lại" },
  { value: "COMPLETED", label: "Đã hoàn thành" },
  { value: "ALL", label: "Tất cả đang ở chỗ tôi" },
];

export function PersonalKpiBoardView() {
  const [reportDate, setReportDate] = useState("");
  const [status, setStatus] = useState("PENDING");
  const [q, setQ] = useState("");
  const [axisId, setAxisId] = useState(ALL);
  const [workContentId, setWorkContentId] = useState(ALL);
  const [departmentId, setDepartmentId] = useState(ALL);
  /**
   * Đơn vị đang mở chi tiết; null = đang ở bảng danh sách đơn vị.
   * Chuỗi rỗng vẫn là một đơn vị hợp lệ (nhóm "chưa rõ đơn vị"), nên phải dùng
   * null làm mốc "chưa mở", không dùng falsy.
   */
  const [openDept, setOpenDept] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  /** Nhiệm vụ đang chờ nhập lý do để trả lại; rỗng = hộp thoại đóng. */
  const [returnIds, setReturnIds] = useState<string[]>([]);
  const [returnReason, setReturnReason] = useState("");
  const [forwardOpen, setForwardOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const { data: axes4Filter = [] } = useSWR(
    ["axes", "all", "kpi-board"],
    fetchAxesAll,
  );
  const { data: contents4Filter = [] } = useSWR(
    ["work-contents", "all", "kpi-board"],
    fetchWorkContentsAll,
  );
  const { data: departments4Filter = [] } = useSWR(
    ["departments", "all", "kpi-board"],
    fetchDepartments,
  );

  /** Nội dung công việc bám theo trục đang chọn, tránh danh sách dài vô nghĩa. */
  const contentOptions = useMemo(() => {
    const list =
      axisId === ALL
        ? contents4Filter
        : contents4Filter.filter(
          (item) => entityId(item.axisId as never) === axisId,
        );
    return [
      { value: ALL, label: "Tất cả nội dung" },
      ...list.map((item) => ({
        value: entityId(item),
        label: item.name,
        keywords: item.code,
      })),
    ];
  }, [contents4Filter, axisId]);

  const params: PersonalKpiBoardQuery = useMemo(
    () => ({
      reportDate: reportDate || undefined,
      status:
        status === "ALL" ? undefined : (status as PersonalKpiStatus),
      includeDecided: status === "ALL",
      q: q.trim() || undefined,
      axisId: axisId === ALL ? undefined : axisId,
      workContentId: workContentId === ALL ? undefined : workContentId,
      departmentId: departmentId === ALL ? undefined : departmentId,
    }),
    [reportDate, status, q, axisId, workContentId, departmentId],
  );

  const { data, error, isLoading, mutate } = useSWR(
    [
      "personal-kpi-board",
      params.reportDate ?? "",
      params.status ?? "",
      params.q ?? "",
      params.includeDecided ? "1" : "",
      params.axisId ?? "",
      params.workContentId ?? "",
      params.departmentId ?? "",
    ],
    () => fetchPersonalKpiBoard(params),
  );

  const hasFilter =
    Boolean(reportDate) ||
    Boolean(q.trim()) ||
    axisId !== ALL ||
    workContentId !== ALL ||
    departmentId !== ALL;

  const resetFilters = () => {
    setReportDate("");
    setQ("");
    setAxisId(ALL);
    setWorkContentId(ALL);
    setDepartmentId(ALL);
  };

  // Mảng rỗng mặc định phải ổn định, nếu không mọi useMemo bám vào nó chạy lại
  // sau từng lần render.
  const axes = useMemo(() => data?.axes ?? [], [data]);
  const counts = data?.counts ?? {
    pending: 0,
    approved: 0,
    returned: 0,
    completed: 0,
  };
  /** Không còn ai ở trên -> mời Hoàn thành thay vì Gửi lên cấp trên. */
  const canForwardUp = data?.canForwardUp ?? true;

  /** Bảng cấp 1: mỗi đơn vị một dòng, bấm vào mới ra bảng nhiệm vụ của đơn vị. */
  const departmentRows = useMemo(() => summarizeByDepartment(axes), [axes]);
  const openDeptRow = departmentRows.find((row) => row.key === openDept);
  /** Bảng cấp 2 chỉ chứa nhiệm vụ của đơn vị đang mở. */
  const visibleAxes = useMemo(
    () => (openDept === null ? [] : filterAxesByDepartment(axes, openDept)),
    [axes, openDept],
  );

  /** Đổi đơn vị thì bỏ hết ô đã tích - không thao tác lên dòng không còn thấy. */
  const openDepartment = (key: string | null) => {
    setOpenDept(key);
    setSelected(new Set());
  };

  const qualityLevelById = useQualityLevelMap();

  const allRows = useMemo(
    () => axes.flatMap((axis) => axis.groups.flatMap((group) => group.rows)),
    [axes],
  );
  const byId = useMemo(
    () => new Map(allRows.map((row) => [row._id, row])),
    [allRows],
  );

  /**
   * KPI tiến độ của từng dòng, đọc theo đúng mẫu đã chốt của trục chứa nó.
   * Dùng chung luật với màn cán bộ nên hai bên không bao giờ nói khác nhau.
   */
  const progressById = useMemo(() => {
    const map = new Map<string, number | null>();
    for (const axis of axes) {
      for (const group of axis.groups) {
        for (const row of group.rows) {
          const { task } = mapPersonalKpiFromApi(row);
          map.set(
            row._id,
            summarizeTask(task, axis.template, qualityLevelById).progressPercent,
          );
        }
      }
    }
    return map;
  }, [axes, qualityLevelById]);

  const selectedRows = [...selected]
    .map((id) => byId.get(id))
    .filter((row): row is PersonalKpiBoardRow => Boolean(row));
  /** Trả lại: chỉ việc đang chờ mình quyết. */
  const selectedPending = selectedRows.filter(
    (row) => row.reviewStatus === "PENDING",
  );
  /** Hoàn thành và Chuyển lên đều là quyết định duyệt - áp cho việc chưa chốt. */
  const selectedOpen = selectedRows.filter(
    (row) => row.reviewStatus !== "COMPLETED",
  );
  const selectedForwardable = selectedOpen.filter(
    (row) => (row.holderLevel ?? 0) >= 1,
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
    // Bỏ qua việc đã chốt: chọn cả nhóm không được kéo theo thứ không xử lý được.
    const ids = rows
      .filter((row) => row.reviewStatus !== "COMPLETED")
      .map((row) => row._id);
    if (!ids.length) return;
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

  /**
   * Chốt hoàn thành: điểm dừng của chuỗi, không gửi lên nữa.
   * Chỉ nhận việc đã đủ 100% KPI tiến độ - server chặn y hệt, đây chỉ là để
   * người duyệt biết ngay chứ không phải bấm xong mới thấy lỗi.
   */
  const doComplete = async (itemIds: string[]) => {
    if (!itemIds.length) return;

    const unfinished = itemIds.filter((id) => {
      const percent = progressById.get(id);
      return percent === undefined || percent === null || percent < 100;
    });
    if (unfinished.length) {
      toast.error(
        `${unfinished.length} nhiệm vụ chưa đạt 100% KPI tiến độ - trả lại để cán bộ cập nhật tiến độ trước khi chốt.`,
      );
      return;
    }
    setBusy(true);
    try {
      const result = await reviewPersonalKpi({ itemIds, decision: "COMPLETE" });
      toast.success(`Đã chốt hoàn thành ${result.count} nhiệm vụ.`);
      await afterAction();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không chốt được."));
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
        itemIds: returnIds,
        decision: "RETURN",
        reason,
      });
      toast.success(`Đã trả lại ${result.count} nhiệm vụ.`);
      setReturnIds([]);
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
          Nhiệm vụ cấp dưới gửi lên, gom theo đơn vị. Mở một đơn vị để xem bảng
          nhiệm vụ của từng trục rồi duyệt, trả lại, hoặc gửi tiếp lên cấp trên.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-3 pt-6">
          <div className="grid gap-3 md:grid-cols-[1fr_220px]">
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
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Đơn vị</Label>
              <SearchableSelect
                value={departmentId}
                onValueChange={setDepartmentId}
                searchPlaceholder="Tìm đơn vị..."
                emptyText="Không có đơn vị nào."
                options={[
                  { value: ALL, label: "Tất cả đơn vị" },
                  ...departments4Filter.map((item) => ({
                    value: entityId(item),
                    label: item.name,
                    keywords: item.code,
                  })),
                ]}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Trục</Label>
              <SearchableSelect
                value={axisId}
                onValueChange={(next) => {
                  setAxisId(next);
                  // Đổi trục thì nội dung cũ không còn thuộc trục đó nữa.
                  setWorkContentId(ALL);
                }}
                searchPlaceholder="Tìm trục..."
                emptyText="Không có trục nào."
                options={[
                  { value: ALL, label: "Tất cả trục" },
                  ...axes4Filter.map((item) => ({
                    value: entityId(item),
                    label: item.name,
                    keywords: item.code,
                  })),
                ]}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Nội dung công việc</Label>
              <SearchableSelect
                value={workContentId}
                onValueChange={setWorkContentId}
                searchPlaceholder="Tìm nội dung..."
                emptyText="Trục này chưa có nội dung nào."
                options={contentOptions}
              />
            </div>
          </div>

          {hasFilter ? (
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={resetFilters}
              >
                Xoá bộ lọc
              </Button>
            </div>
          ) : null}

          {/* Tab kèm số đếm: duyệt xong việc không biến mất, nó nằm ở tab kế bên. */}
          <div className="flex flex-wrap gap-1 border-t pt-3">
            {STATUS_FILTERS.map((item) => {
              const count =
                item.value === "PENDING"
                  ? counts.pending
                  : item.value === "APPROVED"
                    ? counts.approved
                    : item.value === "RETURNED"
                      ? counts.returned
                      : item.value === "COMPLETED"
                        ? counts.completed
                        : counts.pending +
                        counts.approved +
                        counts.returned +
                        counts.completed;
              const active = status === item.value;
              return (
                <Button
                  key={item.value}
                  type="button"
                  size="sm"
                  variant={active ? "default" : "ghost"}
                  onClick={() => {
                    setStatus(item.value);
                    // Ô đã tích thuộc tab cũ, đổi tab là chúng biến mất khỏi bảng.
                    setSelected(new Set());
                  }}
                >
                  {item.label}
                  <Badge
                    variant="secondary"
                    className={cn(
                      "ml-1 h-5 px-1.5",
                      active && "bg-white/20 text-white",
                    )}
                  >
                    {count}
                  </Badge>
                </Button>
              );
            })}
          </div>

          {/* Chỉ trong chi tiết đơn vị mới có dòng để tích, ngoài danh sách thì
              thanh thao tác chỉ tổ chiếm chỗ. */}
          {openDept !== null ? (
            <div className="flex flex-wrap items-center gap-2 border-t pt-3">
              <span className="text-sm text-muted-foreground">
                Đã chọn <b className="text-foreground">{selected.size}</b> nhiệm
                vụ
                {selected.size === 0 && counts.pending > 0 ? (
                  <>
                    {" "}
                    - tích chọn rồi chọn một trong ba: Trả lại, Chuyển lên, Hoàn
                    thành.
                  </>
                ) : null}
              </span>
              <div className="ml-auto flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="border-rose-400 text-rose-600 hover:border-rose-500 hover:bg-rose-50 hover:text-rose-700 dark:border-rose-800 dark:text-rose-400 dark:hover:border-rose-600 dark:hover:bg-rose-950/50 dark:hover:text-rose-300"
                  onClick={() =>
                    setReturnIds(selectedPending.map((row) => row._id))
                  }
                  disabled={busy || selectedPending.length === 0}
                >
                  <Undo2 className="size-4" />
                  Trả lại ({selectedPending.length})
                </Button>
                {canForwardUp ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setForwardOpen(true)}
                    disabled={busy || selectedForwardable.length === 0}
                    title="Duyệt rồi chuyển tiếp lên cấp trên"
                  >
                    <Send className="size-4" />
                    Duyệt &amp; chuyển lên ({selectedForwardable.length})
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  className="bg-teal-600 text-white hover:bg-teal-700 disabled:bg-muted disabled:text-muted-foreground"
                  onClick={() =>
                    void doComplete(selectedOpen.map((row) => row._id))
                  }
                  disabled={busy || selectedOpen.length === 0}
                  title="Duyệt và chốt tại cấp mình, không gửi lên nữa"
                >
                  <CheckCheck className="size-4" />
                  Hoàn thành ({selectedOpen.length})
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {error ? (
        <Card className="border-destructive/40">
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <TriangleAlert className="size-8 text-destructive" />
            <p className="text-sm font-medium text-destructive">
              Không tải được bảng tổng
            </p>
            <p className="max-w-lg text-xs text-muted-foreground">
              {getApiErrorMessage(error, "Lỗi không xác định.")}
            </p>
            <Button
              size="sm"
              variant="outline"
              className="mt-1"
              onClick={() => void mutate()}
            >
              Thử lại
            </Button>
          </CardContent>
        </Card>
      ) : isLoading ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Đang tải bảng tổng...
          </CardContent>
        </Card>
      ) : axes.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-14 text-muted-foreground">
            <Inbox className="size-10 opacity-40" />
            <p className="text-sm">
              {status === "PENDING" && counts.approved > 0
                ? "Hết việc chờ duyệt. Còn vài việc duyệt tồn từ trước chưa xử lý."
                : "Không có nhiệm vụ nào ở trạng thái này."}
            </p>
            {status === "PENDING" && counts.approved > 0 ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setStatus("APPROVED")}
              >
                Xem {counts.approved} việc duyệt tồn
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : openDept === null ? (
        <Card>
          <CardContent className="space-y-2 pt-6">
            <p className="text-sm font-semibold">
              Đơn vị gửi lên
              <span className="font-normal text-muted-foreground">
                {" · "}
                {departmentRows.length} đơn vị
              </span>
            </p>
            <BoardDepartmentTable
              rows={departmentRows}
              onOpen={openDepartment}
            />
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Thanh quay lại luôn có mặt, kể cả khi đổi bộ lọc làm đơn vị này
              rỗng - nếu không người dùng kẹt trong màn trống. */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => openDepartment(null)}
            >
              <ArrowLeft className="size-4" />
              Tất cả đơn vị
            </Button>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">
                {openDeptRow?.name || "Chưa rõ đơn vị"}
              </p>
              {openDeptRow ? (
                <p className="text-xs text-muted-foreground">
                  {openDeptRow.total} nhiệm vụ · {openDeptRow.senderCount} người
                  gửi
                  {openDeptRow.code ? ` · ${openDeptRow.code}` : ""}
                </p>
              ) : null}
            </div>
          </div>

          {visibleAxes.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-2 py-14 text-muted-foreground">
                <Inbox className="size-10 opacity-40" />
                <p className="text-sm">
                  Đơn vị này không có nhiệm vụ nào khớp bộ lọc đang chọn.
                </p>
              </CardContent>
            </Card>
          ) : (
            visibleAxes.map((axis) => (
              <AxisBoardBlock
                key={`${axis.axisId}-${axis.template?.version ?? "live"}`}
                axis={axis}
                selected={selected}
                busy={busy}
                onToggleRow={toggleRow}
                onToggleGroup={toggleGroup}
                canForwardUp={canForwardUp}
                onReturnRow={(id) => setReturnIds([id])}
                onForwardRow={(id) => {
                  setSelected(new Set([id]));
                  setForwardOpen(true);
                }}
                onCompleteRow={(id) => void doComplete([id])}
                progressById={progressById}
              />
            ))
          )}
        </>
      )}

      {data?.truncated ? (
        <p className="text-center text-xs text-muted-foreground">
          Danh sách đang bị cắt bớt vì quá nhiều dòng - lọc theo ngày báo cáo để
          xem đủ.
        </p>
      ) : null}

      <Dialog
        open={returnIds.length > 0}
        onOpenChange={(next) => {
          if (!next && !busy) setReturnIds([]);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Trả lại nhiệm vụ</DialogTitle>
            <DialogDescription>
              {returnIds.length} nhiệm vụ sẽ quay về chỗ người đã gửi để sửa
              lại.
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
              onClick={() => setReturnIds([])}
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
        title={`Duyệt & chuyển lên (${selectedForwardable.length} nhiệm vụ)`}
        submitting={busy}
        onConfirm={doForward}
      />
    </div>
  );
}

function AxisBoardBlock({
  axis,
  selected,
  busy,
  onToggleRow,
  onToggleGroup,
  canForwardUp,
  onReturnRow,
  onForwardRow,
  onCompleteRow,
  progressById,
}: {
  axis: PersonalKpiBoardAxis;
  selected: Set<string>;
  busy: boolean;
  onToggleRow: (id: string) => void;
  onToggleGroup: (rows: PersonalKpiBoardRow[]) => void;
  canForwardUp: boolean;
  onReturnRow: (id: string) => void;
  onForwardRow: (id: string) => void;
  onCompleteRow: (id: string) => void;
  /** KPI tiến độ từng dòng - chưa đủ 100% thì không cho chốt hoàn thành. */
  progressById: Map<string, number | null>;
}) {
  const template = axis.template;
  const footerConfig = template?.footer;

  /**
   * Cột trong công thức có thể là dropdown Nhóm điểm / Chất lượng thực hiện -
   * phải tra danh mục mới ra số. Chỉ nạp khi công thức thật sự dùng tới, và
   * SWR gộp khoá nên nhiều trục trên cùng màn chỉ gọi API một lần.
   */
  const formulaColumnKeys = footerConfig?.enabled
    ? [footerConfig.baseColumnKey, ...footerConfig.ratioColumnKeys].filter(
      (key): key is string => Boolean(key),
    )
    : [];
  const formulaCols = (template?.columns ?? []).filter((column) =>
    formulaColumnKeys.includes(column.key),
  );
  const scoreGroups = useScoreGroupMap(
    formulaCols.some((column) => column.semanticKey === "score_group"),
  );
  const qualityLevels = useQualityLevelMap(
    formulaCols.some((column) => column.semanticKey === "quality_level"),
  );

  if (!template?.columns?.length) {
    const count = axis.groups.reduce(
      (sum, group) => sum + group.rows.length,
      0,
    );
    return (
      <Card>
        <CardContent className="space-y-2 pt-6">
          <p className="text-sm font-semibold">
            {axis.axisName || axis.axisCode}
            {axis.axisDescription ? (
              <span className="font-normal text-muted-foreground">
                {" – "}
                {axis.axisDescription}
              </span>
            ) : null}
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

  // Ba dòng cuối tính trên mọi dòng của trục, không theo ô tích chọn - đây là
  // điểm của cả trục chứ không phải của phần đang chọn để thao tác.
  const footerTotals = computeAxisFooter(
    axis.groups.flatMap((group) => group.rows),
    template.columns,
    footerConfig,
    axis.axisMaxScore,
    { scoreGroups, qualityLevels },
  );
  const baseColumnTitle = footerConfig?.baseColumnKey
    ? (template.columns.find(
      (column) => column.key === footerConfig.baseColumnKey,
    )?.title ?? "")
    : "";

  return (
    <Card>
      <CardContent className="space-y-2 pt-6">
        <p className="text-sm font-semibold">
          {axis.axisName || axis.axisCode}
          {axis.axisDescription ? (
            <span className="font-normal text-muted-foreground">
              {" – "}
              {axis.axisDescription}
            </span>
          ) : null}
        </p>

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
                // Việc đã chốt không tính vào ô tích cả nhóm.
                const selectableRows = group.rows.filter(
                  (row) => row.reviewStatus !== "COMPLETED",
                );
                const allOn =
                  selectableRows.length > 0 &&
                  selectableRows.every((row) => selected.has(row._id));
                return (
                  // Fragment đầy đủ vì một group trả về nhiều <tr>; fragment
                  // rút gọn <> không nhận key.
                  <Fragment key={group.workContentId}>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableCell colSpan={totalCols} className="py-2">
                        {/* Nhóm toàn việc đã chốt thì không tích được, bỏ luôn
                            con trỏ bàn tay để khỏi mời gọi. */}
                        <label
                          className={cn(
                            "flex items-center gap-2 text-sm font-semibold",
                            selectableRows.length > 0
                              ? "cursor-pointer"
                              : "cursor-default",
                          )}
                        >
                          <Checkbox
                            checked={allOn}
                            disabled={selectableRows.length === 0}
                            onCheckedChange={() => onToggleGroup(group.rows)}
                          />
                          {group.workContentName || group.workContentCode}
                          {group.workContentDescription ? (
                            <span className="font-normal text-muted-foreground">
                              {" – "}
                              {group.workContentDescription}
                            </span>
                          ) : null}
                          <span className="font-normal text-muted-foreground">
                            · {group.rows.length} nhiệm vụ
                          </span>
                        </label>
                      </TableCell>
                    </TableRow>

                    {group.rows.map((row) => (
                      <TableRow
                        key={row._id}
                        // Dòng bị trả lại nhuộm hồng nhạt để lướt mắt là thấy.
                        className={cn(
                          row.reviewStatus === "RETURNED" &&
                          "bg-rose-50/70 hover:bg-rose-50 dark:bg-rose-950/25 dark:hover:bg-rose-950/40",
                          // Đã chốt thì không còn thao tác nào. Ép "!" để chắc
                          // chắn đè được hover:bg-muted/50 của TableRow, không
                          // phụ thuộc thứ tự gộp class.
                          row.reviewStatus === "COMPLETED" &&
                          "bg-teal-50 hover:!bg-teal-50 dark:bg-teal-950/40 dark:hover:!bg-teal-950/40",
                        )}
                      >
                        <TableCell className="align-middle">
                          {/* Đã chốt thì mọi thao tác đều loại nó ra, tích
                              chọn cũng vô nghĩa - khoá luôn ô tích. */}
                          <Checkbox
                            checked={selected.has(row._id)}
                            onCheckedChange={() => onToggleRow(row._id)}
                            disabled={row.reviewStatus === "COMPLETED"}
                            aria-label={`Chọn ${refLabel(row.workContentId) || "nhiệm vụ"}`}
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
                          if (column.dataType === "file") {
                            return (
                              <TableCell
                                key={column.id}
                                className="align-middle"
                                style={{ minWidth: column.width }}
                              >
                                <AttachmentCell
                                  files={row.attachments?.[column.key] ?? []}
                                  onChange={() => { }}
                                  readOnly
                                  label={column.title}
                                />
                              </TableCell>
                            );
                          }
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

                        {/* Bám phải cho khớp ô header cũng sticky, nếu không
                            cuộn ngang là hai bên lệch và chữ đè lên nhau. */}
                        <TableCell
                          className={cn(
                            "sticky right-0 z-10 space-y-1.5 text-center align-middle",
                            // Ô sticky phải tự tô nền, nếu không nó trong suốt
                            // và chữ bên dưới trôi qua khi cuộn ngang.
                            row.reviewStatus === "RETURNED"
                              ? "bg-rose-50 dark:bg-rose-950/60"
                              : row.reviewStatus === "COMPLETED"
                                ? "bg-teal-50 dark:bg-teal-950/40"
                                : "bg-background",
                          )}
                        >
                          <Badge
                            variant="secondary"
                            className={cn(
                              personalKpiStatusBadgeClass(row.reviewStatus),
                            )}
                          >
                            {PERSONAL_KPI_STATUS_LABEL[row.reviewStatus] ??
                              row.reviewStatus}
                          </Badge>

                          {/* Chưa chốt thì mỗi dòng có đúng ba lựa chọn, cái
                              nào cũng dứt điểm - không còn bước duyệt lửng. */}
                          {row.reviewStatus !== "COMPLETED" ? (
                            <div className="flex flex-wrap justify-center gap-1">
                              {row.reviewStatus === "PENDING" ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 border-rose-400 bg-background px-2 text-xs text-rose-600 hover:border-rose-500 hover:bg-rose-50 hover:text-rose-700 dark:border-rose-800 dark:text-rose-400 dark:hover:border-rose-600 dark:hover:bg-rose-950/50 dark:hover:text-rose-300"
                                  onClick={() => onReturnRow(row._id)}
                                  disabled={busy}
                                >
                                  <Undo2 className="size-3.5" />
                                  Trả lại
                                </Button>
                              ) : null}
                              {canForwardUp ? (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  className="h-7 px-2 text-xs"
                                  onClick={() => onForwardRow(row._id)}
                                  disabled={busy}
                                  title="Duyệt rồi chuyển tiếp lên cấp trên"
                                >
                                  <Send className="size-3.5" />
                                  Chuyển lên
                                </Button>
                              ) : null}
                              {/* Chốt hoàn thành đòi KPI tiến độ đủ 100% -
                                  server chặn, đây chỉ để thấy trước. */}
                              <Button
                                size="sm"
                                className="h-7 bg-teal-600 px-2 text-xs text-white hover:bg-teal-700 disabled:bg-muted disabled:text-muted-foreground"
                                onClick={() => onCompleteRow(row._id)}
                                disabled={
                                  busy || (progressById.get(row._id) ?? 0) < 100
                                }
                                title={
                                  (progressById.get(row._id) ?? 0) < 100
                                    ? `KPI tiến độ mới ${progressById.get(row._id) ?? 0}% - trả lại để cán bộ cập nhật trước`
                                    : "Duyệt và chốt tại cấp mình"
                                }
                              >
                                <CheckCheck className="size-3.5" />
                                Hoàn thành
                              </Button>
                            </div>
                          ) : null}

                          {row.returnReason ? (
                            <p className="mx-auto max-w-[180px] text-left text-[11px] leading-snug text-rose-600">
                              {row.returnReason}
                            </p>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))}
                  </Fragment>
                );
              })}

              {footerConfig?.enabled ? (
                <>
                  <TableRow className="border-t-2 bg-muted/60 font-medium hover:bg-muted/60">
                    <TableCell colSpan={leading.length} className="text-sm">
                      Tổng từng cột
                    </TableCell>
                    {visible.map((column) => {
                      const total = footerTotals.columnTotals[column.key];
                      return (
                        <TableCell
                          key={column.id}
                          className="align-middle text-sm"
                          style={{ minWidth: column.width }}
                        >
                          {/* Cột không phải số, hoặc chưa ai nhập, thì để trống
                              - hiện 0 là nhìn như đã chấm 0 điểm. */}
                          {total === undefined ? null : formatScoreNumber(total)}
                        </TableCell>
                      );
                    })}
                    <TableCell className="sticky right-0 z-10 bg-muted" />
                  </TableRow>

                  <TableRow className="bg-muted/60 font-medium hover:bg-muted/60">
                    <TableCell colSpan={leading.length} className="text-sm">
                      Tổng điểm trục
                    </TableCell>
                    <TableCell
                      colSpan={visible.length}
                      className="text-center text-sm"
                    >
                      {footerTotals.axisScore === null ? (
                        <span className="font-normal text-muted-foreground">
                          Chưa tính được
                          {baseColumnTitle
                            ? ` - cột "${baseColumnTitle}" chưa có số liệu`
                            : ""}
                          .
                        </span>
                      ) : (
                        formatScoreNumber(footerTotals.axisScore, 4)
                      )}
                    </TableCell>
                    <TableCell className="sticky right-0 z-10 bg-muted" />
                  </TableRow>

                  <TableRow className="bg-muted/60 font-semibold hover:bg-muted/60">
                    <TableCell colSpan={leading.length} className="text-sm">
                      Điểm quy đổi
                    </TableCell>
                    <TableCell
                      colSpan={visible.length}
                      className="text-center text-sm"
                    >
                      {footerTotals.convertedScore === null ? (
                        <span className="font-normal text-muted-foreground">
                          -
                        </span>
                      ) : axis.axisMaxScore ? (
                        <>
                          {formatScoreNumber(footerTotals.convertedScore)}
                          <span className="font-normal text-muted-foreground">
                            {" / "}
                            {formatScoreNumber(axis.axisMaxScore)}
                          </span>
                        </>
                      ) : (
                        // Điểm tối đa 0 thì quy đổi luôn ra 0 - nói rõ là thiếu
                        // cấu hình, đừng để người duyệt tưởng trục bị 0 điểm.
                        <span className="font-normal text-amber-600 dark:text-amber-500">
                          Trục chưa đặt điểm tối đa.
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="sticky right-0 z-10 bg-muted" />
                  </TableRow>
                </>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
