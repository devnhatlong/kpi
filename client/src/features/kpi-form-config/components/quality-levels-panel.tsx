"use client";

import { useEffect, useState } from "react";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
  systemBadgeClass,
} from "@/features/organization/badge-styles";
import {
  createQualityLevel,
  deleteQualityLevel,
  fetchQualityLevelsPage,
  qualityLevelKeys,
  updateQualityLevel,
} from "@/features/kpi-form-config/api";
import { entityId, type QualityLevel } from "@/features/kpi-form-config/types";
import { useListPagination } from "@/hooks/use-list-pagination";
import { getApiErrorMessage } from "@/lib/api-client";
import { emptyPaginationMeta, rowIndex } from "@/lib/pagination";

export function QualityLevelsPanel() {
  const { page, setPage, limit, setLimit, query, setQuery, debouncedQuery } =
    useListPagination();

  const listParams = { page, limit, q: debouncedQuery };
  const { data, isLoading, mutate } = useSWR(
    qualityLevelKeys.list(listParams),
    () => fetchQualityLevelsPage(listParams),
  );

  const items = data?.data ?? [];
  const meta = data?.meta ?? emptyPaginationMeta(limit);

  const [formOpen, setFormOpen] = useState(false);
  const [edit, setEdit] = useState<QualityLevel | null>(null);
  const [deleting, setDeleting] = useState<QualityLevel | null>(null);

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await deleteQualityLevel(entityId(deleting));
      toast.success("Đã xoá mức chất lượng.");
      setDeleting(null);
      await mutate();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không xoá được mức chất lượng."));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Các mức chọn khi chấm chất lượng thực hiện nhiệm vụ. Mặc định 5 mức:
          100%, 75%, 50%, 25% và 0%.
        </p>
        <Button
          size="sm"
          onClick={() => {
            setEdit(null);
            setFormOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
          Thêm mức
        </Button>
      </div>

      <Card>
        <CardContent className="space-y-4 pt-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm theo mã hoặc tên..."
            />
          </div>

          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14">STT</TableHead>
                  <TableHead className="w-28">Mã</TableHead>
                  <TableHead>Tên mức</TableHead>
                  <TableHead className="w-32">Chất lượng</TableHead>
                  <TableHead className="w-24">Thứ tự</TableHead>
                  <TableHead className="w-28">Trạng thái</TableHead>
                  <TableHead className="w-24 text-right">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center">
                      Đang tải...
                    </TableCell>
                  </TableRow>
                ) : items.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="h-24 text-center text-muted-foreground"
                    >
                      Chưa có mức chất lượng nào.
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((item, index) => (
                    <TableRow key={entityId(item)}>
                      <TableCell className="text-muted-foreground">
                        {rowIndex(page, limit, index)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono text-xs">
                          {item.code}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{item.name}</div>
                        {item.description ? (
                          <div className="text-xs text-muted-foreground">
                            {item.description}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className="font-semibold">
                        {item.percent}%
                      </TableCell>
                      <TableCell>{item.sortOrder}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          <Badge
                            variant="outline"
                            className={
                              item.isActive
                                ? activeBadgeClass
                                : inactiveBadgeClass
                            }
                          >
                            {item.isActive ? "Hoạt động" : "Ngưng"}
                          </Badge>
                          {item.isSystem ? (
                            <Badge className={systemBadgeClass}>Hệ thống</Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setEdit(item);
                            setFormOpen(true);
                          }}
                          aria-label="Sửa"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleting(item)}
                          disabled={item.isSystem}
                          title={
                            item.isSystem
                              ? "Mức hệ thống không xoá được - hãy tắt hoạt động"
                              : undefined
                          }
                          aria-label="Xoá"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <TablePagination
            page={page}
            limit={limit}
            total={meta.total}
            totalPages={meta.totalPages}
            onPageChange={setPage}
            onLimitChange={(next) => {
              setLimit(next);
              setPage(1);
            }}
          />
        </CardContent>
      </Card>

      <QualityLevelFormDialog
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
            <AlertDialogTitle>Xoá mức chất lượng?</AlertDialogTitle>
            <AlertDialogDescription>
              Xoá &quot;{deleting?.name}&quot; ({deleting?.percent}%). Nhiệm vụ
              đã chấm theo mức này vẫn giữ nguyên số liệu.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void confirmDelete();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Xoá
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function QualityLevelFormDialog({
  open,
  onOpenChange,
  edit,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  edit: QualityLevel | null;
  onSuccess: () => void;
}) {
  const [name, setName] = useState("");
  const [percent, setPercent] = useState("");
  const [description, setDescription] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(edit?.name ?? "");
    setPercent(edit ? String(edit.percent) : "");
    setDescription(edit?.description ?? "");
    setSortOrder(String(edit?.sortOrder ?? 0));
    setIsActive(edit?.isActive ?? true);
  }, [open, edit]);

  const submit = async () => {
    const value = Number(percent);
    if (!name.trim()) {
      toast.error("Vui lòng nhập tên mức.");
      return;
    }
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      toast.error("Chất lượng phải là số từ 0 đến 100.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || undefined,
        percent: value,
        sortOrder: Number(sortOrder) || 0,
        isActive,
      };
      if (edit) await updateQualityLevel(entityId(edit), payload);
      else await createQualityLevel(payload);
      toast.success(edit ? "Đã cập nhật mức." : "Đã thêm mức.");
      onOpenChange(false);
      onSuccess();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không lưu được mức chất lượng."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {edit ? "Sửa mức chất lượng" : "Thêm mức chất lượng"}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="ql-name">Tên mức</Label>
              <Input
                id="ql-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="VD: 75%"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ql-percent">Chất lượng (%)</Label>
              <Input
                id="ql-percent"
                type="number"
                min={0}
                max={100}
                value={percent}
                onChange={(e) => setPercent(e.target.value)}
                placeholder="0 - 100"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ql-desc">Mô tả</Label>
            <Input
              id="ql-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Diễn giải mức này áp dụng khi nào"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="ql-sort">Thứ tự</Label>
              <Input
                id="ql-sort"
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
              />
            </div>
            <div className="flex h-full items-end">
              <div className="flex h-9 w-full items-center justify-between rounded-lg border px-3">
                <Label htmlFor="ql-active">Hoạt động</Label>
                <Switch
                  id="ql-active"
                  checked={isActive}
                  onCheckedChange={setIsActive}
                />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Hủy
          </Button>
          <Button onClick={() => void submit()} disabled={saving}>
            {saving ? "Đang lưu..." : "Lưu"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
