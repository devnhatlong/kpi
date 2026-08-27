"use client";

import { useState } from "react";
import { ListChecks, Pencil, Plus, Search, Trash2 } from "lucide-react";
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
  criterionKeys,
  deleteCriterion,
  fetchCriteriaPage,
  fetchCriteriaSummary,
  fetchFormTemplateForCriteria,
  formTemplateKeys,
} from "@/features/mission-form-config/api";
import { CriterionFormDialog } from "@/features/mission-form-config/components/criterion-form-dialog";
import type { Criterion } from "@/features/mission-form-config/types";
import { entityId } from "@/features/mission-form-config/types";
import { useListPagination } from "@/hooks/use-list-pagination";
import { getApiErrorMessage } from "@/lib/api-client";
import { emptyPaginationMeta, rowIndex } from "@/lib/pagination";

type CriteriaViewProps = {
  /**
   * Nhúng trong hộp thoại của màn cấu hình biểu mẫu - bỏ tiêu đề trang, vì
   * hộp thoại đã có tiêu đề riêng, hai dòng tiêu đề chồng nhau đọc rất rối.
   */
  embedded?: boolean;
};

/**
 * Danh mục tiêu chí chấm điểm chung - từng dòng của bảng "Danh mục điểm tiêu
 * chí chung". Danh mục phẳng, không thuộc trục nào; bộ cột của bảng chấm dựng
 * ở màn Cấu hình biểu mẫu báo cáo y như của một trục.
 */
export function CriteriaView({ embedded = false }: CriteriaViewProps = {}) {
  const { page, setPage, limit, setLimit, query, setQuery, debouncedQuery } =
    useListPagination();
  const listParams = { page, limit, q: debouncedQuery };
  const { data, isLoading, mutate } = useSWR(
    criterionKeys.list(listParams),
    () => fetchCriteriaPage(listParams),
  );
  /*
    Tổng điểm lấy từ server chứ không cộng trang đang xem: mở trang 2 mà thấy
    tổng tụt xuống thì con số đó vô nghĩa.
  */
  const summary = useSWR(criterionKeys.summary, fetchCriteriaSummary);
  /* Nhắc admin bảng chấm đang lấy bộ cột ở đâu - hoặc chưa có mẫu nào. */
  const template = useSWR(
    formTemplateKeys.forCriteria,
    fetchFormTemplateForCriteria,
  );

  const items = data?.data ?? [];
  const meta = data?.meta ?? emptyPaginationMeta(limit);
  const [formOpen, setFormOpen] = useState(false);
  const [edit, setEdit] = useState<Criterion | null>(null);
  const [deleting, setDeleting] = useState<Criterion | null>(null);

  const refresh = async () => {
    await Promise.all([mutate(), summary.mutate()]);
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await deleteCriterion(entityId(deleting));
      toast.success("Đã xoá tiêu chí.");
      setDeleting(null);
      await refresh();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không xoá được tiêu chí."));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          {embedded ? null : (
            <>
              <h1 className="font-display text-2xl font-semibold tracking-tight">
                Tiêu chí chấm điểm
              </h1>
              <p className="text-sm text-muted-foreground">
                Danh mục điểm tiêu chí chung - mỗi dòng là một tiêu chí kèm điểm
                tối đa, dùng chung cho mọi đơn vị được chấm.
              </p>
            </>
          )}
        </div>
        <Button
          onClick={() => {
            setEdit(null);
            setFormOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
          Thêm tiêu chí
        </Button>
      </div>

      <Card>
        <CardContent className="space-y-4 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Tìm theo mã hoặc nội dung..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="outline" className="font-normal">
                {summary.data?.activeCount ?? 0} tiêu chí đang dùng · Tổng điểm{" "}
                <span className="ml-1 font-semibold">
                  {summary.data?.totalMaxScore ?? 0}
                </span>
              </Badge>
              {/* Chưa gán mẫu thì bảng chấm không biết in cột nào - nói ngay ở
                  đây thay vì để admin tự mò sang mục Mẫu bảng nhiệm vụ. */}
              <Badge
                variant="outline"
                className={template.data ? "font-normal" : inactiveBadgeClass}
              >
                {template.data
                  ? `Mẫu bảng: ${template.data.name}`
                  : "Chưa gán mẫu bảng"}
              </Badge>
            </div>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14">TT</TableHead>
                  <TableHead className="w-[120px]">Mã</TableHead>
                  <TableHead>Tiêu chí / Nội dung</TableHead>
                  <TableHead className="w-[110px]">Điểm tối đa</TableHead>
                  <TableHead className="w-[100px]">Thứ tự</TableHead>
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
                        <ListChecks className="h-8 w-8 opacity-40" />
                        <span>Chưa có tiêu chí nào.</span>
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
                        {item.note ? (
                          <div className="text-xs text-muted-foreground line-clamp-2">
                            {item.note}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        {/* Chưa đặt điểm thì dòng đó không góp gì vào tổng -
                            nói thẳng thay vì hiện số 0 như đã khai xong. */}
                        {item.maxScore ? (
                          <span className="font-medium">{item.maxScore}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            Chưa đặt
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
                            onClick={() => {
                              setEdit(item);
                              setFormOpen(true);
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

      <CriterionFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        edit={edit}
        onSuccess={refresh}
      />

      <AlertDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xoá tiêu chí?</AlertDialogTitle>
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
