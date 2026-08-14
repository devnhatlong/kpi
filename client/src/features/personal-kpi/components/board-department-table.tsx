"use client";

import { Building2, ChevronRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  PersonalKpiBoardAxis,
  PersonalKpiBoardRow,
} from "@/features/personal-kpi/api";
import {
  refLabel,
  rowDepartmentRef,
} from "@/features/personal-kpi/board-cell";
import { cn } from "@/lib/utils";

/** Một dòng của bảng đơn vị - gộp mọi nhiệm vụ cùng đơn vị lại. */
export type BoardDepartmentSummary = {
  /** Id đơn vị; rỗng = nhóm "chưa rõ đơn vị". */
  key: string;
  name: string;
  code: string;
  total: number;
  pending: number;
  approved: number;
  returned: number;
  completed: number;
  /** Số người gửi khác nhau trong đơn vị. */
  senderCount: number;
  axisCount: number;
};

const NO_DEPARTMENT_LABEL = "Chưa rõ đơn vị";

/**
 * Gom bảng theo trục thành danh sách đơn vị.
 * Đếm trên đúng dữ liệu đang hiển thị, nên tab trạng thái nào thì bảng đơn vị
 * nói về tab đó - không lấy counts tổng của server để khỏi lệch với danh sách.
 */
export function summarizeByDepartment(
  axes: PersonalKpiBoardAxis[],
): BoardDepartmentSummary[] {
  const map = new Map<
    string,
    BoardDepartmentSummary & { senders: Set<string>; axes: Set<string> }
  >();

  for (const axis of axes) {
    for (const group of axis.groups) {
      for (const row of group.rows) {
        const dept = rowDepartmentRef(row);
        let entry = map.get(dept.id);
        if (!entry) {
          entry = {
            key: dept.id,
            name: dept.name || NO_DEPARTMENT_LABEL,
            code: dept.code,
            total: 0,
            pending: 0,
            approved: 0,
            returned: 0,
            completed: 0,
            senderCount: 0,
            axisCount: 0,
            senders: new Set<string>(),
            axes: new Set<string>(),
          };
          map.set(dept.id, entry);
        }
        entry.total += 1;
        if (row.reviewStatus === "PENDING") entry.pending += 1;
        else if (row.reviewStatus === "APPROVED") entry.approved += 1;
        else if (row.reviewStatus === "RETURNED") entry.returned += 1;
        else if (row.reviewStatus === "COMPLETED") entry.completed += 1;

        const sender =
          refLabel(row.lastSenderId) || refLabel(row.ownerId) || "";
        if (sender) entry.senders.add(sender);
        entry.axes.add(axis.axisId);
      }
    }
  }

  return [...map.values()]
    .map(({ senders, axes: axisIds, ...rest }) => ({
      ...rest,
      senderCount: senders.size,
      axisCount: axisIds.size,
    }))
    // Đơn vị còn việc chờ duyệt nổi lên trước, đó là thứ phải xử lý hôm nay.
    .sort(
      (a, b) =>
        b.pending - a.pending ||
        b.total - a.total ||
        a.name.localeCompare(b.name, "vi"),
    );
}

/** Lọc bảng theo trục xuống còn nhiệm vụ của một đơn vị, bỏ trục/nhóm rỗng. */
export function filterAxesByDepartment(
  axes: PersonalKpiBoardAxis[],
  departmentKey: string,
): PersonalKpiBoardAxis[] {
  const keep = (row: PersonalKpiBoardRow) =>
    rowDepartmentRef(row).id === departmentKey;
  return axes
    .map((axis) => ({
      ...axis,
      groups: axis.groups
        .map((group) => ({ ...group, rows: group.rows.filter(keep) }))
        .filter((group) => group.rows.length > 0),
    }))
    .filter((axis) => axis.groups.length > 0);
}

function CountCell({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  // 0 để mờ: mắt chỉ cần bắt được ô nào còn số.
  if (!value) {
    return (
      <TableCell className="text-center text-sm text-muted-foreground/50">
        0
      </TableCell>
    );
  }
  return (
    <TableCell className="text-center">
      <Badge variant="secondary" className={cn("px-2", className)}>
        {value}
      </Badge>
    </TableCell>
  );
}

export function BoardDepartmentTable({
  rows,
  onOpen,
}: {
  rows: BoardDepartmentSummary[];
  onOpen: (key: string) => void;
}) {
  return (
    <div className="overflow-auto rounded-md border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="bg-muted/50 text-sm font-medium">
              Đơn vị
            </TableHead>
            <TableHead className="bg-muted/50 text-center text-sm font-medium">
              Người gửi
            </TableHead>
            <TableHead className="bg-muted/50 text-center text-sm font-medium">
              Trục
            </TableHead>
            <TableHead className="bg-muted/50 text-center text-sm font-medium">
              Nhiệm vụ
            </TableHead>
            <TableHead className="bg-muted/50 text-center text-sm font-medium">
              Chờ duyệt
            </TableHead>
            <TableHead className="bg-muted/50 text-center text-sm font-medium">
              Trả lại
            </TableHead>
            <TableHead className="bg-muted/50 text-center text-sm font-medium">
              Hoàn thành
            </TableHead>
            <TableHead className="w-[130px] bg-muted/50" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow
              key={row.key || "no-department"}
              className="cursor-pointer"
              onClick={() => onOpen(row.key)}
            >
              <TableCell className="align-middle">
                <div className="flex items-center gap-2">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <Building2 className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {row.name}
                    </div>
                    {row.code ? (
                      <div className="text-xs text-muted-foreground">
                        {row.code}
                      </div>
                    ) : null}
                  </div>
                </div>
              </TableCell>
              <TableCell className="text-center text-sm">
                {row.senderCount}
              </TableCell>
              <TableCell className="text-center text-sm">
                {row.axisCount}
              </TableCell>
              <TableCell className="text-center text-sm font-medium">
                {row.total}
              </TableCell>
              <CountCell
                value={row.pending + row.approved}
                className="bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300"
              />
              <CountCell
                value={row.returned}
                className="bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300"
              />
              <CountCell
                value={row.completed}
                className="bg-teal-100 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300"
              />
              <TableCell className="text-right">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  onClick={(event) => {
                    // Ô này nằm trong dòng cũng bấm được - chặn để khỏi chạy hai lần.
                    event.stopPropagation();
                    onOpen(row.key);
                  }}
                >
                  Xem chi tiết
                  <ChevronRight className="size-3.5" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
