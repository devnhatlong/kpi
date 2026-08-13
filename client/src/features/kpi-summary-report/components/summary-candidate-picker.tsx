"use client";

import { useMemo, useState } from "react";
import { FilePlus2, Inbox, Search, TriangleAlert } from "lucide-react";
import useSWR from "swr";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { SearchableSelect } from "@/components/common/searchable-select";
import {
  fetchAxesAll,
  fetchWorkContentsAll,
} from "@/features/kpi-form-config/api";
import { entityId } from "@/features/kpi-form-config/types";
import { fetchDepartments } from "@/features/organization/api";
import {
  addSummaryReportItems,
  createSummaryReport,
  fetchSummaryCandidates,
  summaryReportKeys,
} from "@/features/kpi-summary-report/api";
import {
  AddToReportDialog,
  type AddToReportPayload,
} from "@/features/kpi-summary-report/components/add-to-report-dialog";
import { SummaryAxisTable } from "@/features/kpi-summary-report/components/summary-axis-table";
import {
  countAxisRows,
  type SummaryCandidatesQuery,
  type SummaryRow,
} from "@/features/kpi-summary-report/types";
import { getApiErrorMessage } from "@/lib/api-client";

const ALL = "ALL";

type SummaryCandidatePickerProps = {
  /** Gọi sau khi nhặt xong, để danh sách báo cáo bên tab kia làm mới theo. */
  onChanged?: () => void;
};

/**
 * Kho nhiệm vụ ĐÃ HOÀN THÀNH trong nhánh đơn vị của người lập, gom theo trục.
 * Tích chọn rồi đưa vào báo cáo tổng - báo cáo mới hoặc báo cáo nháp đang có.
 */
export function SummaryCandidatePicker({
  onChanged,
}: SummaryCandidatePickerProps) {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [q, setQ] = useState("");
  const [axisId, setAxisId] = useState(ALL);
  const [workContentId, setWorkContentId] = useState(ALL);
  const [departmentId, setDepartmentId] = useState(ALL);
  const [excludeUsed, setExcludeUsed] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const { data: axes4Filter = [] } = useSWR(
    ["axes", "all", "kpi-summary"],
    fetchAxesAll,
  );
  const { data: contents4Filter = [] } = useSWR(
    ["work-contents", "all", "kpi-summary"],
    fetchWorkContentsAll,
  );
  const { data: departments4Filter = [] } = useSWR(
    ["departments", "all", "kpi-summary"],
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

  const params: SummaryCandidatesQuery = useMemo(
    () => ({
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
      q: q.trim() || undefined,
      axisId: axisId === ALL ? undefined : axisId,
      workContentId: workContentId === ALL ? undefined : workContentId,
      departmentId: departmentId === ALL ? undefined : departmentId,
      excludeUsed,
    }),
    [fromDate, toDate, q, axisId, workContentId, departmentId, excludeUsed],
  );

  const { data, error, isLoading, mutate } = useSWR(
    summaryReportKeys.candidates(params),
    () => fetchSummaryCandidates(params),
  );

  const axes = useMemo(() => data?.axes ?? [], [data]);
  const total = countAxisRows(axes);

  const hasFilter =
    Boolean(fromDate) ||
    Boolean(toDate) ||
    Boolean(q.trim()) ||
    axisId !== ALL ||
    workContentId !== ALL ||
    departmentId !== ALL;

  const resetFilters = () => {
    setFromDate("");
    setToDate("");
    setQ("");
    setAxisId(ALL);
    setWorkContentId(ALL);
    setDepartmentId(ALL);
  };

  const toggleRow = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleGroup = (rows: SummaryRow[]) => {
    const ids = rows.map((row) => row._id);
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

  /** Tích hết mọi dòng đang hiện - bộ lọc đã thu hẹp thì đây là thao tác hay dùng. */
  const selectAllVisible = () => {
    const ids = axes.flatMap((axis) =>
      axis.groups.flatMap((group) => group.rows.map((row) => row._id)),
    );
    setSelected(new Set(ids));
  };

  const doAdd = async (payload: AddToReportPayload) => {
    const itemIds = [...selected];
    if (!itemIds.length) return;

    setBusy(true);
    try {
      if (payload.mode === "new") {
        const report = await createSummaryReport({
          title: payload.title,
          fromDate: payload.fromDate || undefined,
          toDate: payload.toDate || undefined,
          note: payload.note || undefined,
          itemIds,
        });
        toast.success(
          `Đã tạo "${report.title}" với ${report.itemCount} nhiệm vụ.`,
        );
      } else {
        const result = await addSummaryReportItems(payload.reportId, itemIds);
        toast.success(
          result.added > 0
            ? `Đã thêm ${result.added} nhiệm vụ, báo cáo đang có ${result.itemCount} nhiệm vụ.`
            : "Các nhiệm vụ này đã có trong báo cáo.",
        );
      }
      setDialogOpen(false);
      setSelected(new Set());
      await mutate();
      onChanged?.();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không đưa vào báo cáo được."));
    } finally {
      setBusy(false);
    }
  };

  /** Offset số thứ tự để TT chạy liên tục qua các trục, không reset về 1. */
  const axisOffsets = useMemo(() => {
    const offsets: number[] = [];
    let running = 0;
    for (const axis of axes) {
      offsets.push(running);
      running += axis.groups.reduce(
        (sum, group) => sum + group.rows.length,
        0,
      );
    }
    return offsets;
  }, [axes]);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 pt-6">
          <div className="grid gap-3 md:grid-cols-[1fr_180px_180px]">
            <div className="space-y-1.5">
              <Label>Tìm nhiệm vụ</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-8"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Nội dung nhiệm vụ..."
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Từ ngày</Label>
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Đến ngày</Label>
              <Input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
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
                  { value: ALL, label: "Toàn bộ nhánh của tôi" },
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

          <div className="flex flex-wrap items-center gap-3 border-t pt-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Switch
                checked={excludeUsed}
                onCheckedChange={setExcludeUsed}
                aria-label="Ẩn nhiệm vụ đã đưa vào báo cáo khác"
              />
              Ẩn nhiệm vụ đã nằm trong báo cáo khác của tôi
            </label>
            {hasFilter ? (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={resetFilters}
              >
                Xoá bộ lọc
              </Button>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t pt-3">
            <span className="text-sm text-muted-foreground">
              Đã chọn <b className="text-foreground">{selected.size}</b> /{" "}
              {total} nhiệm vụ đã hoàn thành
            </span>
            <div className="ml-auto flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={selectAllVisible}
                disabled={busy || total === 0}
              >
                Chọn hết đang hiện
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelected(new Set())}
                disabled={busy || selected.size === 0}
              >
                Bỏ chọn
              </Button>
              <Button
                size="sm"
                onClick={() => setDialogOpen(true)}
                disabled={busy || selected.size === 0}
              >
                <FilePlus2 className="size-3.5" />
                Đưa vào báo cáo tổng
              </Button>
            </div>
          </div>

          {data?.truncated ? (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-500" />
              <span>
                Chỉ hiện {data.rowCount} nhiệm vụ đầu tiên. Thu hẹp kỳ hoặc lọc
                theo đơn vị / trục để thấy hết.
              </span>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {error ? (
        <Card>
          <CardContent className="pt-6 text-sm text-destructive">
            {getApiErrorMessage(error, "Không tải được danh sách nhiệm vụ.")}
          </CardContent>
        </Card>
      ) : null}

      {isLoading ? (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            Đang tải nhiệm vụ đã hoàn thành...
          </CardContent>
        </Card>
      ) : null}

      {!isLoading && !error && axes.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Inbox className="size-8 text-muted-foreground" />
            <p className="text-sm font-medium">
              Chưa có nhiệm vụ hoàn thành nào để đưa vào báo cáo
            </p>
            <p className="max-w-md text-xs text-muted-foreground">
              Nhiệm vụ chỉ vào đây sau khi được chốt &quot;Hoàn thành&quot; ở màn
              Duyệt KPI cấp dưới.
              {excludeUsed
                ? " Hoặc tắt bộ lọc ẩn nhiệm vụ đã nằm trong báo cáo khác."
                : ""}
            </p>
          </CardContent>
        </Card>
      ) : null}

      {axes.map((axis, index) => (
        <SummaryAxisTable
          key={`${axis.axisId}-${axis.template?.version ?? "live"}`}
          axis={axis}
          selectable
          selected={selected}
          onToggleRow={toggleRow}
          onToggleGroup={toggleGroup}
          startIndex={axisOffsets[index] ?? 0}
        />
      ))}

      <AddToReportDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        count={selected.size}
        defaultFromDate={fromDate}
        defaultToDate={toDate}
        submitting={busy}
        onConfirm={doAdd}
      />
    </div>
  );
}
