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
  activeBadgeClass,
  inactiveBadgeClass,
} from "@/features/organization/badge-styles";
import {
  deleteWorkTask,
  fetchWorkContentsAll,
  fetchWorkTasksPage,
  workTaskKeys,
} from "@/features/mission-form-config/api";
import { WorkTaskFormDialog } from "@/features/mission-form-config/components/work-task-form-dialog";
import type { WorkTask } from "@/features/mission-form-config/types";
import { entityId } from "@/features/mission-form-config/types";
import { formatScoreGroupRange } from "@/features/mission-form-config/score-group.constants";
import { useListPagination } from "@/hooks/use-list-pagination";
import { getApiErrorMessage } from "@/lib/api-client";
import { emptyPaginationMeta, rowIndex } from "@/lib/pagination";

const ALL_CONTENTS = "ALL";

/**
 * Danh mục nhiệm vụ khai sẵn theo nội dung công việc.
 *
 * Trục nào có nhiệm vụ do văn bản quy định (như trục 2) thì khai ở đây, form
 * nhập của cán bộ chỉ còn là dropdown chọn - không ai gõ sai nguyên văn nữa.
 */
export function WorkTasksView() {
  const contentLabel = (item: WorkTask) => {
    const content = item.workContentId;
    if (!content || typeof content === "string") return "";
    return `${content.name} (${content.code})`;
  };
  const scoreGroupLabel = (item: WorkTask) => {
    const group = item.scoreGroupId;
    if (!group || typeof group === "string") return "";
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
  const [contentFilter, setContentFilter] = useState(ALL_CONTENTS);

  const { data: contents = [] } = useSWR(
    ["work-contents", "all", "for-work-tasks"],
    fetchWorkContentsAll,
  );

  const listParams = {
    page,
    limit,
    q: debouncedQuery,
    workContentId: contentFilter === ALL_CONTENTS ? undefined : contentFilter,
  };
  const { data, isLoading, mutate } = useSWR(
    workTaskKeys.list(listParams),
    () => fetchWorkTasksPage(listParams),
  );

  const items = data?.data ?? [];
  const meta = data?.meta ?? emptyPaginationMeta(limit);

  const [formOpen, setFormOpen] = useState(false);
  const [edit, setEdit] = useState<WorkTask | null>(null);
  const [deleting, setDeleting] = useState<WorkTask | null>(null);

  const openCreate = () => {
    setEdit(null);
    setFormOpen(true);
  };

  const openEdit = (item: WorkTask) => {
    setEdit(item);
    setFormOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await deleteWorkTask(entityId(deleting));
      toast.success("Đã xoá nhiệm vụ.");
      setDeleting(null);
      await mutate();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không xoá được nhiệm vụ."));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            Nhiệm vụ
          </h1>
          <p className="text-sm text-muted-foreground">
            Nhiệm vụ khai sẵn theo từng nội dung công việc - cán bộ chọn từ
            dropdown khi nhập nhiệm vụ, không tự gõ.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Thêm nhiệm vụ
        </Button>
      </div>

      <Card>
        <CardContent className="space-y-4 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Tìm theo mã, nội dung nhiệm vụ..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <Select
              value={contentFilter}
              onValueChange={(value) => {
                setContentFilter(value);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[280px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_CONTENTS}>
                  Mọi nội dung công việc
                </SelectItem>
                {contents.map((content) => (
                  <SelectItem key={entityId(content)} value={entityId(content)}>
                    {content.name}
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
                  <TableHead className="w-[110px]">Mã</TableHead>
                  <TableHead>Nội dung nhiệm vụ</TableHead>
                  <TableHead className="w-[240px]">
                    Nội dung công việc
                  </TableHead>
                  <TableHead className="w-[200px]">Điểm chuẩn riêng</TableHead>
                  <TableHead className="w-[90px]">Thứ tự</TableHead>
                  <TableHead className="w-[110px]">Trạng thái</TableHead>
                  <TableHead className="w-[100px] text-right">
                    Thao tác
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="h-24 text-center text-muted-foreground"
                    >
                      Đang tải...
                    </TableCell>
                  </TableRow>
                ) : items.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="h-24 text-center text-muted-foreground"
                    >
                      <div className="inline-flex flex-col items-center gap-2">
                        <ClipboardList className="h-8 w-8 opacity-40" />
                        <span>Chưa khai nhiệm vụ nào.</span>
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
                      <TableCell className="max-w-[520px]">
                        <div className="whitespace-normal break-words text-sm">
                          {item.name}
                        </div>
                        {item.note ? (
                          <div className="mt-0.5 text-xs text-muted-foreground">
                            Ghi chú: {item.note}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {contentLabel(item) || "-"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {/* Bỏ trống là cố ý: nhiệm vụ lấy điểm chuẩn của nội
                            dung công việc, không phải quên khai. */}
                        {scoreGroupLabel(item) || (
                          <span className="text-xs text-muted-foreground">
                            Theo nội dung công việc
                          </span>
                        )}
                      </TableCell>
                      <TableCell>{item.sortOrder}</TableCell>
                      <TableCell>
                        {item.isActive ? (
                          <Badge variant="outline" className={activeBadgeClass}>
                            Hoạt động
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className={inactiveBadgeClass}
                          >
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

      <WorkTaskFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        edit={edit}
        onSuccess={() => void mutate()}
      />

      <AlertDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xoá nhiệm vụ?</AlertDialogTitle>
            <AlertDialogDescription>
              Nhiệm vụ &quot;{deleting?.name}&quot; sẽ bị xoá khỏi danh mục.
              Nhiệm vụ cán bộ đã khai trước đó vẫn giữ nguyên nội dung đã lưu.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Huỷ</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDelete()}>
              Xoá
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
