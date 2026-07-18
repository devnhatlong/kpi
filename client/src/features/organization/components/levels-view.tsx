"use client";

import { useMemo, useState } from "react";
import { Layers, Pencil, Plus, Search, Trash2 } from "lucide-react";
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
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
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
import {
  deleteDepartmentLevel,
  departmentKeys,
  fetchDepartmentLevels,
} from "@/features/organization/api";
import { LevelFormDialog } from "@/features/organization/components/level-form-dialog";
import type { DepartmentLevel } from "@/features/organization/types";
import { entityId } from "@/features/organization/types";
import { getApiErrorMessage } from "@/lib/api-client";

export function LevelsView() {
  const { data: levels = [], isLoading, mutate } = useSWR(
    departmentKeys.levels,
    fetchDepartmentLevels,
  );

  const [query, setQuery] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [edit, setEdit] = useState<DepartmentLevel | null>(null);
  const [deleting, setDeleting] = useState<DepartmentLevel | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = [...levels].sort((a, b) => a.rank - b.rank || a.code.localeCompare(b.code));
    if (!q) return list;
    return list.filter(
      (level) =>
        level.code.toLowerCase().includes(q) || level.name.toLowerCase().includes(q),
    );
  }, [levels, query]);

  const openCreate = () => {
    setEdit(null);
    setFormOpen(true);
  };

  const openEdit = (level: DepartmentLevel) => {
    setEdit(level);
    setFormOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await deleteDepartmentLevel(entityId(deleting));
      toast.success("Đã xoá cấp đơn vị.");
      setDeleting(null);
      await mutate();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không xoá được cấp đơn vị."));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-semibold tracking-tight">Cấp đơn vị</h1>
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <span>Tổ chức</span>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Cấp đơn vị</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <p className="text-sm text-muted-foreground">
            Danh mục cấp dùng trong form đơn vị và các dropdown liên quan.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Thêm cấp
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
                  <TableHead className="w-[120px]">Mã</TableHead>
                  <TableHead>Tên cấp</TableHead>
                  <TableHead className="w-[100px]">Thứ tự</TableHead>
                  <TableHead className="w-[120px]">Trạng thái</TableHead>
                  <TableHead className="w-[100px] text-right">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                      Đang tải...
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                      <div className="inline-flex flex-col items-center gap-2">
                        <Layers className="h-8 w-8 opacity-40" />
                        <span>Chưa có cấp đơn vị nào.</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((level) => (
                    <TableRow key={entityId(level)}>
                      <TableCell>
                        <Badge variant="secondary" className="font-mono">
                          {level.code}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">{level.name}</TableCell>
                      <TableCell>{level.rank}</TableCell>
                      <TableCell>
                        {level.isActive ? (
                          <Badge className="bg-emerald-600 text-white border-transparent">
                            Hoạt động
                          </Badge>
                        ) : (
                          <Badge variant="outline">Ngừng</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => openEdit(level)}
                            aria-label="Sửa"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setDeleting(level)}
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
        </CardContent>
      </Card>

      <LevelFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        edit={edit}
        onSuccess={() => mutate()}
      />

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xoá cấp đơn vị?</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn sắp xoá cấp{" "}
              <span className="font-medium text-foreground">
                {deleting?.code} – {deleting?.name}
              </span>
              . Thao tác này không thể hoàn tác.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Huỷ</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Xoá</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
