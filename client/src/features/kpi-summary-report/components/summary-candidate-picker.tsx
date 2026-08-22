"use client";

import { useMemo, useState } from "react";
import {
  Building2,
  Inbox,
  Layers,
  Loader2,
  Search,
  TriangleAlert,
  X,
} from "lucide-react";
import useSWR from "swr";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useQualityLevelMap } from "@/features/kpi-form-config/use-quality-levels";
import { useScoreGroupMap } from "@/features/kpi-form-config/use-score-groups";
import {
  fetchSummaryCandidates,
  summaryReportKeys,
} from "@/features/kpi-summary-report/api";
import {
  buildReportContent,
  type ReportEntry,
} from "@/features/kpi-summary-report/report-entries";
import { formatScoreNumber } from "@/features/personal-kpi/board-cell";
import { kpiTone } from "@/features/personal-kpi/status-styles";
import { getApiErrorMessage } from "@/lib/api-client";
import { cn } from "@/lib/utils";

const ALL = "__all__";

type Chip = { value: string; label: string; count: number };

/** Hàng chip lọc - bấm là đổi, bấm lại "Tất cả" là bỏ lọc. */
function ChipRow({
  icon: Icon,
  label,
  chips,
  value,
  onChange,
}: {
  icon: typeof Layers;
  label: string;
  chips: Chip[];
  value: string;
  onChange: (next: string) => void;
}) {
  if (chips.length <= 1) return null;

  return (
    <div className="space-y-1.5">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {chips.map((chip) => {
          const active = chip.value === value;
          return (
            <button
              key={chip.value}
              type="button"
              onClick={() => onChange(chip.value)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs transition-colors",
                active
                  ? "border-primary/40 bg-primary/10 font-medium text-primary"
                  : "border-border bg-background text-muted-foreground hover:text-foreground",
              )}
            >
              {chip.label}
              <span className="text-muted-foreground"> · {chip.count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export type SummaryCandidatePickerProps = {
  /** Báo cáo đang biên tập - việc của chính nó vẫn phải hiện ra. */
  reportId?: string;
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  /** Chiều cao vùng cuộn của bảng. */
  listClassName?: string;
};

/**
 * Kho nhiệm vụ ĐÃ HOÀN THÀNH trong nhánh đơn vị của người lập.
 *
 * Dùng chung cho hộp thoại "Chọn nhiệm vụ hoàn thành" và bước 2 của trình tạo
 * báo cáo - hai chỗ chỉ khác cái khung bọc ngoài, còn cách lọc và cách tính
 * điểm phải y hệt nhau.
 */
export function SummaryCandidatePicker({
  reportId,
  selected,
  onChange,
  listClassName = "max-h-[320px]",
}: SummaryCandidatePickerProps) {
  const [q, setQ] = useState("");
  const [axisId, setAxisId] = useState(ALL);
  const [departmentKey, setDepartmentKey] = useState(ALL);

  const params = { excludeUsed: true, reportId };
  const { data, error, isLoading } = useSWR(
    summaryReportKeys.candidates(params),
    () => fetchSummaryCandidates(params),
  );

  const scoreGroupById = useScoreGroupMap();
  const qualityLevelById = useQualityLevelMap();

  const entries = useMemo(
    () =>
      buildReportContent(data?.axes ?? [], [], {
        scoreGroups: scoreGroupById,
        qualityLevels: qualityLevelById,
      }).entries,
    [data, scoreGroupById, qualityLevelById],
  );

  /** Lọc chữ trước, để hai hàng chip đếm đúng những gì đang tìm. */
  const searched = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return entries;
    return entries.filter((entry) =>
      [
        entry.title,
        entry.subtitle,
        entry.ownerName,
        entry.departmentName,
        entry.axisName,
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [entries, q]);

  const axisChips = useMemo(() => {
    const map = new Map<string, Chip>();
    for (const entry of searched) {
      const key = entry.axisId || "__none__";
      const chip = map.get(key) ?? {
        value: key,
        label: entry.axisName || "Chưa gắn trục",
        count: 0,
      };
      chip.count += 1;
      map.set(key, chip);
    }
    return [
      { value: ALL, label: "Tất cả", count: searched.length },
      ...[...map.values()].sort((a, b) => a.label.localeCompare(b.label, "vi")),
    ];
  }, [searched]);

  const departmentChips = useMemo(() => {
    const map = new Map<string, Chip>();
    for (const entry of searched) {
      const key = entry.departmentKey || "__none__";
      const chip = map.get(key) ?? {
        value: key,
        label: entry.departmentName || "Chưa gắn đơn vị",
        count: 0,
      };
      chip.count += 1;
      map.set(key, chip);
    }
    return [
      { value: ALL, label: "Tất cả", count: searched.length },
      ...[...map.values()].sort((a, b) => a.label.localeCompare(b.label, "vi")),
    ];
  }, [searched]);

  const visible = useMemo(
    () =>
      searched.filter((entry) => {
        if (axisId !== ALL && (entry.axisId || "__none__") !== axisId) {
          return false;
        }
        if (
          departmentKey !== ALL &&
          (entry.departmentKey || "__none__") !== departmentKey
        ) {
          return false;
        }
        return true;
      }),
    [searched, axisId, departmentKey],
  );

  const visibleIds = visible.map((entry) => entry.key);
  const allVisibleOn =
    visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const selectedScore = entries
    .filter((entry) => selected.has(entry.key))
    .reduce((sum, entry) => sum + (entry.score ?? 0), 0);

  const toggle = (entry: ReportEntry) => {
    const next = new Set(selected);
    if (next.has(entry.key)) next.delete(entry.key);
    else next.add(entry.key);
    onChange(next);
  };

  const toggleVisible = () => {
    const next = new Set(selected);
    if (allVisibleOn) for (const id of visibleIds) next.delete(id);
    else for (const id of visibleIds) next.add(id);
    onChange(next);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Tìm nhiệm vụ, cán bộ, đơn vị..."
          />
        </div>
        <Button
          type="button"
          variant="outline"
          className="bg-background"
          disabled={visibleIds.length === 0}
          onClick={toggleVisible}
        >
          {allVisibleOn
            ? "Bỏ chọn hiển thị"
            : `Chọn tất cả (${visibleIds.length})`}
        </Button>
      </div>

      <ChipRow
        icon={Layers}
        label="Trục"
        chips={axisChips}
        value={axisId}
        onChange={setAxisId}
      />
      <ChipRow
        icon={Building2}
        label="Đơn vị"
        chips={departmentChips}
        value={departmentKey}
        onChange={setDepartmentKey}
      />

      {data?.truncated ? (
        <div
          className={cn(
            "flex items-start gap-2 rounded-lg border p-2.5 text-xs",
            kpiTone.warning.soft,
          )}
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          Kho nhiệm vụ đang chạm trần {data.rowCount} dòng - thu hẹp tìm kiếm để
          chắc chắn không sót việc.
        </div>
      ) : null}

      <div className={cn("overflow-auto rounded-lg border", listClassName)}>
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-muted/60">
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[44px]">
                <Checkbox
                  checked={allVisibleOn}
                  disabled={visibleIds.length === 0}
                  onCheckedChange={toggleVisible}
                  aria-label="Chọn tất cả nhiệm vụ đang hiện"
                />
              </TableHead>
              <TableHead>Nhiệm vụ đã hoàn thành</TableHead>
              <TableHead className="w-[180px]">Cán bộ</TableHead>
              <TableHead className="w-[110px] text-right">Điểm chốt</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  <Loader2 className="mx-auto mb-2 size-4 animate-spin" />
                  Đang tải kho nhiệm vụ...
                </TableCell>
              </TableRow>
            ) : null}

            {error ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="py-10 text-center text-sm text-destructive"
                >
                  {getApiErrorMessage(error, "Không tải được kho nhiệm vụ.")}
                </TableCell>
              </TableRow>
            ) : null}

            {!isLoading && !error && visible.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-12 text-center">
                  <Inbox className="mx-auto size-8 text-muted-foreground" />
                  <p className="mt-2 text-sm text-muted-foreground">
                    Không có nhiệm vụ hoàn thành phù hợp
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Chỉ những việc chỉ huy đã xác nhận hoàn thành và chưa nằm
                    trong báo cáo khác mới hiện ở đây.
                  </p>
                </TableCell>
              </TableRow>
            ) : null}

            {visible.map((entry) => {
              const checked = selected.has(entry.key);
              return (
                <TableRow
                  key={entry.key}
                  data-state={checked ? "selected" : undefined}
                  className="cursor-pointer"
                  onClick={() => toggle(entry)}
                >
                  <TableCell
                    className="align-middle"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggle(entry)}
                      aria-label="Chọn nhiệm vụ"
                    />
                  </TableCell>
                  <TableCell className="align-middle">
                    <p className="font-medium">{entry.title}</p>
                    {entry.subtitle ? (
                      <p className="text-xs text-muted-foreground">
                        {entry.subtitle}
                      </p>
                    ) : null}
                    {entry.axisName ? (
                      <Badge
                        variant="secondary"
                        className={cn("mt-1 font-normal", kpiTone.neutral.soft)}
                      >
                        {entry.axisName}
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell className="align-middle text-sm">
                    <p>{entry.ownerName || "-"}</p>
                    {entry.departmentName ? (
                      <p className="text-xs text-muted-foreground">
                        {entry.departmentName}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right align-middle text-sm font-medium tabular-nums">
                    {entry.score === null
                      ? "-"
                      : formatScoreNumber(entry.score)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
        <span className="flex items-center gap-2">
          <span className="size-1.5 rounded-full bg-primary" />
          Đã chọn <span className="font-semibold">{selected.size}</span> nhiệm
          vụ
          <span className="text-muted-foreground">
            Tổng điểm chốt{" "}
            <span className={cn("font-semibold", kpiTone.success.text)}>
              {formatScoreNumber(selectedScore)}
            </span>
          </span>
        </span>
        {selected.size > 0 ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => onChange(new Set())}
          >
            <X className="size-3.5" />
            Xoá chọn
          </Button>
        ) : null}
      </div>
    </div>
  );
}
