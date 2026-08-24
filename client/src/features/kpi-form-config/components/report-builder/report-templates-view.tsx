"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  CircleCheck,
  FileSpreadsheet,
  Pencil,
  Plus,
  Search,
  Settings2,
  Trash2,
  Undo2,
} from "lucide-react";
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
  applyReportTemplate,
  criterionKeys,
  deleteReportTemplate,
  fetchCriteriaSummary,
  fetchReportTemplatesPage,
  reportTemplateKeys,
  unapplyReportTemplate,
} from "@/features/kpi-form-config/api";
import { ReportTemplateFormDialog } from "@/features/kpi-form-config/components/report-builder/report-template-form-dialog";
import { scopeSummary } from "@/features/kpi-form-config/components/report-builder/report-scope";
import {
  entityId,
  REPORT_SCOPE_TYPE_LABEL,
  type ReportTemplate,
} from "@/features/kpi-form-config/types";
import { useListPagination } from "@/hooks/use-list-pagination";
import { getApiErrorMessage } from "@/lib/api-client";
import { emptyPaginationMeta, rowIndex } from "@/lib/pagination";

function builderHref(template: ReportTemplate) {
  return `/kpi/form-config/builder/${entityId(template)}`;
}

/** Tổng điểm tối đa của mẫu = điểm các trục + bảng tiêu chí nếu có dùng. */
function totalScore(template: ReportTemplate, criteriaMaxScore: number) {
  const axisScore = (template.axisIds ?? []).reduce(
    (sum, axis) =>
      sum + (typeof axis === "string" ? 0 : ((axis as { maxScore?: number }).maxScore ?? 0)),
    0,
  );
  return axisScore + (template.includeCriteria ? criteriaMaxScore : 0);
}

/**
 * Danh sách mẫu báo cáo - mỗi năm và mỗi phạm vi đơn vị có thể một mẫu riêng.
 *
 * Bấm vào mẫu là mở màn ghép trục và thiết kế form của mẫu đó; áp dụng / gỡ áp
 * dụng làm ngay tại đây để nhìn được cả năm cùng lúc.
 */
export function ReportTemplatesView() {
  const router = useRouter();
  const { page, setPage, limit, setLimit, query, setQuery, debouncedQuery } =
    useListPagination();
  const listParams = { page, limit, q: debouncedQuery };
  const { data, isLoading, mutate } = useSWR(
    reportTemplateKeys.list(listParams),
    () => fetchReportTemplatesPage(listParams),
  );
  const criteria = useSWR(criterionKeys.summary, fetchCriteriaSummary);

  const items = data?.data ?? [];
  const meta = data?.meta ?? emptyPaginationMeta(limit);
  const criteriaMaxScore = criteria.data?.totalMaxScore ?? 0;

  const [formOpen, setFormOpen] = useState(false);
  const [edit, setEdit] = useState<ReportTemplate | null>(null);
  const [deleting, setDeleting] = useState<ReportTemplate | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const toggleApply = async (template: ReportTemplate) => {
    const id = entityId(template);
    setBusyId(id);
    try {
      if (template.status === "applied") {
        await unapplyReportTemplate(id);
        toast.success("Đã gỡ áp dụng mẫu báo cáo.");
      } else {
        await applyReportTemplate(id);
        toast.success(`Đã áp dụng mẫu cho năm ${template.year}.`);
      }
      await mutate();
    } catch (error) {
      toast.error(
        getApiErrorMessage(error, "Không đổi được trạng thái áp dụng."),
      );
    } finally {
      setBusyId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await deleteReportTemplate(entityId(deleting));
      toast.success("Đã xoá mẫu báo cáo.");
      setDeleting(null);
      await mutate();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không xoá được mẫu báo cáo."));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            Mẫu báo cáo KPI
          </h1>
          <p className="text-sm text-muted-foreground">
            Mỗi mẫu là một bộ khối nội dung áp dụng cho một năm và một nhóm đơn
            vị. Đơn vị khớp nhiều mẫu thì lấy mẫu hẹp nhất.
          </p>
        </div>
        <Button
          onClick={() => {
            setEdit(null);
            setFormOpen(true);
          }}
        >
          <Plus className="size-4" />
          Tạo mẫu báo cáo
        </Button>
      </div>

      <Card>
        <CardContent className="space-y-4 pt-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Tìm theo mã hoặc tên mẫu..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <div className="overflow-x-auto rounded-md border">
            <Table className="min-w-[980px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14">STT</TableHead>
                  <TableHead className="w-[110px]">Mã</TableHead>
                  <TableHead className="min-w-[220px]">Tên mẫu</TableHead>
                  <TableHead className="w-[80px]">Năm</TableHead>
                  <TableHead className="min-w-[220px]">Phạm vi áp dụng</TableHead>
                  <TableHead className="w-[90px]">Khối</TableHead>
                  <TableHead className="w-[110px]">Tổng điểm</TableHead>
                  <TableHead className="w-[130px]">Trạng thái</TableHead>
                  <TableHead className="w-[150px] text-right">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell
                      colSpan={9}
                      className="h-24 text-center text-muted-foreground"
                    >
                      Đang tải...
                    </TableCell>
                  </TableRow>
                ) : items.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={9}
                      className="h-32 text-center text-muted-foreground"
                    >
                      <div className="inline-flex flex-col items-center gap-2">
                        <FileSpreadsheet className="size-8 opacity-40" />
                        <span>Chưa có mẫu báo cáo nào.</span>
                        <span className="text-xs">
                          Tạo mẫu đầu tiên để ghép trục và thiết kế form.
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((item, index) => {
                    const id = entityId(item);
                    const blockCount =
                      (item.axisIds?.length ?? 0) + (item.includeCriteria ? 1 : 0);
                    const applied = item.status === "applied";
                    return (
                      <TableRow key={id}>
                        <TableCell className="text-muted-foreground">
                          {rowIndex(meta.page, meta.limit, index)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-mono">
                            {item.code}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Link
                            href={builderHref(item)}
                            className="font-medium hover:underline"
                          >
                            {item.name}
                          </Link>
                          {item.description ? (
                            <div className="line-clamp-1 text-xs text-muted-foreground">
                              {item.description}
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell className="tabular-nums">{item.year}</TableCell>
                        <TableCell>
                          <div className="text-sm">{scopeSummary(item)}</div>
                          <div className="text-xs text-muted-foreground">
                            {REPORT_SCOPE_TYPE_LABEL[item.scopeType ?? "all"]}
                          </div>
                        </TableCell>
                        <TableCell>
                          {blockCount ? (
                            <span className="tabular-nums">{blockCount}</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              Chưa ghép
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {totalScore(item, criteriaMaxScore)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={applied ? activeBadgeClass : inactiveBadgeClass}
                          >
                            {applied ? "Đã áp dụng" : "Đang cấu hình"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => toggleApply(item)}
                              disabled={busyId === id}
                              aria-label={applied ? "Gỡ áp dụng" : "Áp dụng"}
                              title={applied ? "Gỡ áp dụng" : "Áp dụng"}
                            >
                              {applied ? (
                                <Undo2 className="size-4" />
                              ) : (
                                <CircleCheck className="size-4" />
                              )}
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => router.push(builderHref(item))}
                              aria-label="Cấu hình khối và form"
                              title="Cấu hình khối và form"
                            >
                              <Settings2 className="size-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => {
                                setEdit(item);
                                setFormOpen(true);
                              }}
                              aria-label="Sửa tên và phạm vi"
                              title="Sửa tên và phạm vi"
                            >
                              <Pencil className="size-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => setDeleting(item)}
                              aria-label="Xoá"
                            >
                              <Trash2 className="size-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
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

      <ReportTemplateFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        edit={edit}
        onSaved={async (saved) => {
          await mutate();
          // Mẫu vừa tạo thì đi thẳng sang màn ghép trục - tạo xong mà vẫn đứng ở
          // danh sách thì bước tiếp theo bị giấu đi.
          if (!edit) router.push(builderHref(saved));
        }}
      />

      <AlertDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xoá mẫu báo cáo?</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn sắp xoá{" "}
              <span className="font-medium text-foreground">
                {deleting?.code} - {deleting?.name}
              </span>
              . Form của từng trục vẫn giữ nguyên, chỉ mất bản ghép khối này.
              Thao tác không thể hoàn tác.
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
