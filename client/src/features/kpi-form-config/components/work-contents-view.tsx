"use client";

import { useState } from "react";
import { ClipboardList, Pencil, Plus, Search, Trash2 } from "lucide-react";
import useSWR from "swr";
import { toast } from "sonner";

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
  activeBadgeClass,
  inactiveBadgeClass,
} from "@/features/organization/badge-styles";
import {
  deleteWorkContent,
  fetchWorkContentsPage,
  workContentKeys,
} from "@/features/kpi-form-config/api";
import { WorkContentFormDialog } from "@/features/kpi-form-config/components/work-content-form-dialog";
import type { WorkContent } from "@/features/kpi-form-config/types";
import { entityId } from "@/features/kpi-form-config/types";
import { formatScoreGroupRange } from "@/features/kpi-form-config/score-group.constants";
import { useListPagination } from "@/hooks/use-list-pagination";
import { getApiErrorMessage } from "@/lib/api-client";
import { emptyPaginationMeta, rowIndex } from "@/lib/pagination";

export function WorkContentsView() {
  const contentGroupLabel = (item: WorkContent) => {
    const group = item.contentGroupId;
    if (!group || typeof group === "string") return "";
    return `${group.name} (${group.code})`;
  };
  const axisLabel = (item: WorkContent) => {
    const axis = item.axisId;
    if (!axis || typeof axis === "string") return "";
    return `${axis.name} (${axis.code})`;
  };
  const scoreGroupLabel = (item: WorkContent) => {
    const group = item.scoreGroupId;
    if (!group || typeof group === "string") return "";
    // Dải điểm chỉ có khi server populate đủ trường; thiếu thì hiện tên suông.
    if (group.minScore === undefined || group.maxScore === undefined) {
      return group.name;
    }
    return `${group.name} (${formatScoreGroupRange(
      group.minScore,
      group.maxScore,
      group.maxInclusive ?? true,
    )})`;
  };

  const { page, setPage, limit, setLimit, query, setQuery, debouncedQuery } =
    useListPagination();

  const listParams = { page, limit, q: debouncedQuery };
  const { data, isLoading, mutate } = useSWR(
    workContentKeys.list(listParams),
    () => fetchWorkContentsPage(listParams),
  );

  const items = data?.data ?? [];
  const meta = data?.meta ?? emptyPaginationMeta(limit);

  const [formOpen, setFormOpen] = useState(false);
  const [edit, setEdit] = useState<WorkContent | null>(null);
  const [deleting, setDeleting] = useState<WorkContent | null>(null);

  const openCreate = () => {
    setEdit(null);
    setFormOpen(true);
  };

  const openEdit = (item: WorkContent) => {
    setEdit(item);
    setFormOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await deleteWorkContent(entityId(deleting));
      toast.success("Đã xoá nội dung công việc.");
      setDeleting(null);
      await mutate();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không xoá được nội dung công việc."));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            Nội dung công việc
          </h1>
          <p className="text-sm text-muted-foreground">
            Danh mục dùng cho dropdown khi cán bộ nhập KPI cá nhân.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Thêm nội dung
        </Button>
      </div>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="relative max-w-sm">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Tìm theo mã hoặc tên..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14">STT</TableHead>
                  <TableHead className="w-[120px]">Mã</TableHead>
                  <TableHead>Tên nội dung</TableHead>
                  <TableHead className="w-[220px]">Nhóm nội dung</TableHead>
                  <TableHead className="w-[220px]">Trục</TableHead>
                  <TableHead className="w-[200px]">Nhóm điểm</TableHead>
                  <TableHead className="w-[100px]">Thứ tự</TableHead>
                  <TableHead className="w-[120px]">Trạng thái</TableHead>
                  <TableHead className="w-[100px] text-right">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                      Đang tải...
                    </TableCell>
                  </TableRow>
                ) : items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                      <div className="inline-flex flex-col items-center gap-2">
                        <ClipboardList className="h-8 w-8 opacity-40" />
                        <span>Chưa có nội dung công việc nào.</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((item, index) => (
                    <TableRow key={entityId(item)}>
                      <TableCell className="text-muted-foreground">
                        {rowIndex(meta.page, meta.limit, index)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono">
                          {item.code}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{item.name}</div>
                        {item.description ? (
                          <div className="text-xs text-muted-foreground line-clamp-2">
                            {item.description}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {contentGroupLabel(item) || "-"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {axisLabel(item) || "-"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {/* Bản ghi cũ chưa gán - tô hổ phách để còn biết đường
                            vào sửa, không lẫn với ô trống bình thường. */}
                        {scoreGroupLabel(item) || (
                          <Badge
                            variant="outline"
                            className="border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-400"
                          >
                            Chưa gán
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>{item.sortOrder}</TableCell>
                      <TableCell>
                        {item.isActive ? (
                          <Badge variant="outline" className={activeBadgeClass}>
                            Hoạt động
                          </Badge>
                        ) : (
                          <Badge variant="outline" className={inactiveBadgeClass}>
                            Ngừng
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => openEdit(item)}
                            aria-label="Sửa"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setDeleting(item)}
                            aria-label="Xoá"
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

      <WorkContentFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        edit={edit}
        onSuccess={() => mutate()}
      />

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xoá nội dung công việc?</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn sắp xoá{" "}
              <span className="font-medium text-foreground">
                {deleting?.code} - {deleting?.name}
              </span>
              . Thao tác này không thể hoàn tác.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Xoá</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
