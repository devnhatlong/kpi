"use client";

import { useState } from "react";
import {
  ChevronRight,
  FilePlus2,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Table2,
  Trash2,
} from "lucide-react";
import useSWR, { mutate as globalMutate } from "swr";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  deleteFormTemplate,
  fetchFormTemplatesPage,
  formTemplateKeys,
} from "@/features/kpi-form-config/api";
import { FormTemplateBuilderSheet } from "@/features/kpi-form-config/components/form-template-builder-sheet";
import type { AxisRef, FormTemplate } from "@/features/kpi-form-config/types";
import { entityId } from "@/features/kpi-form-config/types";
import { useListPagination } from "@/hooks/use-list-pagination";
import { getApiErrorMessage } from "@/lib/api-client";
import { emptyPaginationMeta, rowIndex } from "@/lib/pagination";

function axisLabel(axis: AxisRef | string) {
  return typeof axis === "string" ? axis : `${axis.code} · ${axis.name}`;
}

export function FormTemplatesView() {
  const { page, setPage, limit, setLimit, query, setQuery, debouncedQuery } =
    useListPagination();
  const listParams = { page, limit, q: debouncedQuery };
  const { data, isLoading, mutate } = useSWR(
    formTemplateKeys.list(listParams),
    () => fetchFormTemplatesPage(listParams),
  );

  const items = data?.data ?? [];
  const meta = data?.meta ?? emptyPaginationMeta(limit);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  const [startBlank, setStartBlank] = useState(false);
  const [edit, setEdit] = useState<FormTemplate | null>(null);
  const [deleting, setDeleting] = useState<FormTemplate | null>(null);

  /** Form nhập nhiệm vụ cache mẫu theo trục - sửa mẫu xong phải xoá cache đó. */
  const refresh = async () => {
    await mutate();
    await globalMutate(
      (key) => Array.isArray(key) && key[0] === "form-template-by-axis",
    );
  };

  const startCreate = (blank: boolean) => {
    setEdit(null);
    setStartBlank(blank);
    setStartOpen(false);
    setBuilderOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await deleteFormTemplate(entityId(deleting));
      toast.success("Đã xoá mẫu bảng.");
      setDeleting(null);
      await refresh();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không xoá được mẫu bảng."));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            Mẫu bảng KPI
          </h1>
          <p className="text-sm text-muted-foreground">
            Dựng header bảng riêng rồi gán cho trục. Khi nhập nhiệm vụ, chọn
            trục nào sẽ hiện đúng header của mẫu đó.
          </p>
        </div>
        <Button onClick={() => setStartOpen(true)}>
          <Plus className="h-4 w-4" />
          Tạo mẫu bảng
        </Button>
      </div>

      <Card>
        <CardContent className="space-y-4 pt-4">
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
                  <TableHead>Tên mẫu</TableHead>
                  <TableHead className="w-[90px]">Số cột</TableHead>
                  <TableHead className="min-w-[220px]">Trục áp dụng</TableHead>
                  <TableHead className="w-[120px]">Trạng thái</TableHead>
                  <TableHead className="w-[100px] text-right">
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
                        <Table2 className="h-8 w-8 opacity-40" />
                        <span>Chưa có mẫu bảng nào.</span>
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
                      <TableCell>{item.columns?.length ?? 0}</TableCell>
                      <TableCell>
                        {item.axisIds?.length ? (
                          <div className="flex flex-wrap gap-1">
                            {item.axisIds.map((axis) => (
                              <Badge
                                key={entityId(axis)}
                                variant="outline"
                                className="font-normal"
                              >
                                {axisLabel(axis)}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            Chưa gán trục
                          </span>
                        )}
                      </TableCell>
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
                            onClick={() => {
                              setEdit(item);
                              setBuilderOpen(true);
                            }}
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

      <Dialog open={startOpen} onOpenChange={setStartOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Bắt đầu mẫu bảng mới thế nào?</DialogTitle>
            <DialogDescription>
              Chọn xong vẫn sửa thoải mái - thêm, xoá, đổi thứ tự cột.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 py-2">
            <button
              type="button"
              onClick={() => startCreate(false)}
              className="flex items-start gap-3 rounded-lg border p-4 text-left transition-colors hover:border-primary hover:bg-accent"
            >
              <Sparkles className="mt-0.5 size-5 shrink-0 text-primary" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">
                  Điền sẵn bộ cột mặc định
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  13 cột đang dùng: STT, Nội dung công việc, Nhiệm vụ, Thời hạn,
                  Sản phẩm, Điểm chuẩn, Đơn vị thực hiện, nhóm Kết quả theo dõi,
                  Đề nghị khác, Tài liệu kiểm chứng. Sửa lại cho hợp trục là
                  xong.
                </span>
              </span>
              <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            </button>

            <button
              type="button"
              onClick={() => startCreate(true)}
              className="flex items-start gap-3 rounded-lg border p-4 text-left transition-colors hover:border-primary hover:bg-accent"
            >
              <FilePlus2 className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">
                  Bảng trắng - tự dựng từ đầu
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  Không cột nào, không nhóm header nào. Hợp khi bảng của trục
                  khác hẳn bảng mặc định.
                </span>
              </span>
              <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <FormTemplateBuilderSheet
        open={builderOpen}
        onOpenChange={setBuilderOpen}
        edit={edit}
        startBlank={startBlank}
        onSuccess={() => void refresh()}
      />

      <AlertDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xoá mẫu bảng?</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn sắp xoá{" "}
              <span className="font-medium text-foreground">
                {deleting?.code} - {deleting?.name}
              </span>
              . Các trục đang dùng mẫu này sẽ quay về bảng mặc định. Thao tác
              này không thể hoàn tác.
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
