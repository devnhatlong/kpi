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
import { SegmentedTabs } from "@/components/common/segmented-tabs";
import { TablePagination } from "@/components/common/table-pagination";
import {
  activeBadgeClass,
  inactiveBadgeClass,
} from "@/features/organization/badge-styles";
import {
  adjustmentKeys,
  deleteAdjustmentItem,
  fetchAdjustmentSummary,
  fetchAdjustmentsPage,
} from "@/features/mission-form-config/api";
import { AdjustmentItemFormDialog } from "@/features/mission-form-config/components/adjustment-item-form-dialog";
import {
  ADJUSTMENT_SECTIONS,
  ADJUSTMENT_SECTION_META,
  entityId,
  type AdjustmentItem,
  type AdjustmentSection,
} from "@/features/mission-form-config/types";
import { useListPagination } from "@/hooks/use-list-pagination";
import { getApiErrorMessage } from "@/lib/api-client";
import { emptyPaginationMeta, rowIndex } from "@/lib/pagination";

/**
 * Danh mục "Bảng đề xuất điểm cộng, điểm trừ và điều chỉnh, khống chế mức xếp
 * loại" - ba phần I / II / III, mỗi phần một tab.
 *
 * Chỉ nửa trái của bảng (nội dung để soi chiếu) do quản trị khai ở đây. Nửa
 * phải (kết quả cụ thể, điểm đề xuất) là phần đơn vị điền theo tháng, dựng ở
 * màn báo cáo.
 */
export function AdjustmentsView() {
  const [section, setSection] = useState<AdjustmentSection>("BONUS");
  const { page, setPage, limit, setLimit, query, setQuery, debouncedQuery } =
    useListPagination();
  const listParams = { page, limit, q: debouncedQuery, section };

  const { data, isLoading, mutate } = useSWR(
    adjustmentKeys.list(listParams),
    () => fetchAdjustmentsPage(listParams),
  );
  const summary = useSWR(adjustmentKeys.summary, fetchAdjustmentSummary);

  const items = data?.data ?? [];
  const meta = data?.meta ?? emptyPaginationMeta(limit);
  const sectionMeta = ADJUSTMENT_SECTION_META[section];

  const [formOpen, setFormOpen] = useState(false);
  const [edit, setEdit] = useState<AdjustmentItem | null>(null);
  const [deleting, setDeleting] = useState<AdjustmentItem | null>(null);

  const refresh = async () => {
    await Promise.all([mutate(), summary.mutate()]);
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await deleteAdjustmentItem(entityId(deleting));
      toast.success("Đã xoá dòng.");
      setDeleting(null);
      await refresh();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không xoá được."));
    }
  };

  const colCount = section === "BONUS" ? 8 : 7;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            Điểm cộng, điểm trừ &amp; xếp loại
          </h1>
          <p className="text-sm text-muted-foreground">
            Nội dung để soi chiếu của bảng đề xuất điểm cộng, điểm trừ và điều
            chỉnh, khống chế mức xếp loại - khai sẵn một lần, đơn vị chỉ điền
            kết quả theo tháng.
          </p>
        </div>
        <Button
          onClick={() => {
            setEdit(null);
            setFormOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
          Thêm dòng
        </Button>
      </div>

      <Card>
        <CardContent className="space-y-4 pt-4">
          <SegmentedTabs
            ariaLabel="Phần"
            value={section}
            onChange={(next) => {
              setSection(next);
              setPage(1);
            }}
            items={ADJUSTMENT_SECTIONS.map((value) => ({
              value,
              label: `${ADJUSTMENT_SECTION_META[value].numeral}. ${ADJUSTMENT_SECTION_META[value].title} (${summary.data?.counts[value] ?? 0})`,
            }))}
            className="flex-wrap"
          />

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
            {/* Dòng "TỔNG ĐIỂM CỘNG TỐI ĐA" của bảng I - mẫu giấy ghi 10 điểm;
                tính trên mọi dòng đang hoạt động, không phải trang đang xem. */}
            {section === "BONUS" ? (
              <Badge variant="outline" className="font-normal">
                Tổng điểm cộng tối đa{" "}
                <span className="ml-1 font-semibold">
                  {summary.data?.bonusMaxTotal ?? 0}
                </span>
              </Badge>
            ) : null}
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14">STT</TableHead>
                  <TableHead className="w-[110px]">Mã</TableHead>
                  <TableHead className="min-w-[16rem]">
                    {sectionMeta.nameLabel}
                  </TableHead>
                  <TableHead className="min-w-[24rem]">
                    {sectionMeta.ruleLabel}
                  </TableHead>
                  {section === "BONUS" ? (
                    <TableHead className="w-[90px] text-center">
                      Tối đa
                    </TableHead>
                  ) : null}
                  <TableHead className="w-[80px]">Thứ tự</TableHead>
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
                      colSpan={colCount}
                      className="h-24 text-center text-muted-foreground"
                    >
                      Đang tải...
                    </TableCell>
                  </TableRow>
                ) : items.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={colCount}
                      className="h-24 text-center text-muted-foreground"
                    >
                      <div className="inline-flex flex-col items-center gap-2">
                        <ListChecks className="h-8 w-8 opacity-40" />
                        <span>
                          Phần {sectionMeta.numeral} chưa có dòng nào.
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((item, index) => (
                    <TableRow key={entityId(item)}>
                      <TableCell className="align-top text-muted-foreground">
                        {rowIndex(meta.page, meta.limit, index)}
                      </TableCell>
                      <TableCell className="align-top">
                        <Badge variant="outline" className="font-mono">
                          {item.code}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-normal align-top font-medium">
                        {item.name}
                      </TableCell>
                      {/* Đoạn dài chép nguyên văn bản - để nguyên, không cắt
                          dòng: cắt đi là mất chính mức điểm cần tra. */}
                      <TableCell className="whitespace-normal align-top text-sm text-muted-foreground">
                        {item.rule || "-"}
                      </TableCell>
                      {section === "BONUS" ? (
                        <TableCell className="align-top text-center">
                          {item.maxScore === null ? (
                            <span className="text-xs text-muted-foreground">
                              Chưa đặt
                            </span>
                          ) : (
                            <span className="font-medium">{item.maxScore}</span>
                          )}
                        </TableCell>
                      ) : null}
                      <TableCell className="align-top">
                        {item.sortOrder}
                      </TableCell>
                      <TableCell className="align-top">
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
                      <TableCell className="align-top text-right">
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

      <AdjustmentItemFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        edit={edit}
        defaultSection={section}
        onSuccess={refresh}
      />

      <AlertDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xoá dòng?</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn sắp xoá{" "}
              <span className="font-medium text-foreground">
                {deleting?.code} - {deleting?.name}
              </span>
              . Thao tác này không thể hoàn tác. Nếu dòng đã từng được đơn vị
              chấm, hãy chuyển sang &quot;Ngừng&quot; thay vì xoá.
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
