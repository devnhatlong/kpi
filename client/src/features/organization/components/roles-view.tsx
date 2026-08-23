"use client";

import { useState } from "react";
import { Pencil, Plus, Search, Shield, Trash2 } from "lucide-react";
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
import { TablePagination } from "@/components/common/table-pagination";
import {
  activeBadgeClass,
  codeBadgeClass,
  inactiveBadgeClass,
  systemBadgeClass,
} from "@/features/organization/badge-styles";
import { deleteRole, fetchRolesPage, roleKeys } from "@/features/organization/api";
import { RoleFormDialog } from "@/features/organization/components/role-form-dialog";
import type { Role } from "@/features/organization/types";
import { entityId } from "@/features/organization/types";
import { useListPagination } from "@/hooks/use-list-pagination";
import { getApiErrorMessage } from "@/lib/api-client";
import { emptyPaginationMeta, rowIndex } from "@/lib/pagination";

export function RolesView() {
  const { page, setPage, limit, setLimit, query, setQuery, debouncedQuery } =
    useListPagination();

  const listParams = { page, limit, q: debouncedQuery };
  const { data, isLoading, mutate } = useSWR(roleKeys.list(listParams), () =>
    fetchRolesPage(listParams),
  );

  const roles = data?.data ?? [];
  const meta = data?.meta ?? emptyPaginationMeta(limit);

  const [formOpen, setFormOpen] = useState(false);
  const [edit, setEdit] = useState<Role | null>(null);
  const [deleting, setDeleting] = useState<Role | null>(null);

  const openCreate = () => {
    setEdit(null);
    setFormOpen(true);
  };

  const openEdit = (role: Role) => {
    setEdit(role);
    setFormOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await deleteRole(entityId(deleting));
      toast.success("Đã xoá vai trò.");
      setDeleting(null);
      await mutate();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không xoá được vai trò."));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-semibold tracking-tight">Vai trò</h1>
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <span>Tổ chức</span>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Vai trò</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Thêm vai trò
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
                  <TableHead className="w-[140px]">Mã</TableHead>
                  <TableHead>Tên vai trò</TableHead>
                  <TableHead className="w-[100px]">Quyền</TableHead>
                  <TableHead className="w-[80px]">Thứ tự</TableHead>
                  <TableHead className="w-[110px]">Loại</TableHead>
                  <TableHead className="w-[120px]">Trạng thái</TableHead>
                  <TableHead className="w-[100px] text-right">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                      Đang tải...
                    </TableCell>
                  </TableRow>
                ) : roles.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                      <div className="inline-flex flex-col items-center gap-2">
                        <Shield className="h-8 w-8 opacity-40" />
                        <span>Chưa có vai trò nào.</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  roles.map((role, index) => (
                    <TableRow key={entityId(role)}>
                      <TableCell className="text-muted-foreground">
                        {rowIndex(meta.page, meta.limit, index)}
                      </TableCell>
                      <TableCell>
                        <Badge className={`font-mono ${codeBadgeClass(role.code)}`}>
                          {role.code}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">{role.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{role.permissions?.length ?? 0}</Badge>
                      </TableCell>
                      <TableCell>{role.sortOrder ?? 0}</TableCell>
                      <TableCell>
                        {role.isSystem ? (
                          <Badge className={systemBadgeClass}>Hệ thống</Badge>
                        ) : (
                          <Badge variant="outline">Tuỳ chỉnh</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {role.isActive ? (
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
                            onClick={() => openEdit(role)}
                            aria-label="Sửa"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setDeleting(role)}
                            disabled={role.isSystem}
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

      <RoleFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        edit={edit}
        onSuccess={() => mutate()}
      />

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xoá vai trò?</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn sắp xoá vai trò{" "}
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
