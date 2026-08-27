"use client";

import { useMemo, useState } from "react";
import {
  Download,
  FileSpreadsheet,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
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
} from "@/features/organization/badge-styles";
import {
  deleteUser,
  fetchDepartments,
  fetchUsersPage,
  userKeys,
} from "@/features/organization/api";
import { ImportUsersDialog } from "@/features/organization/components/import-users-dialog";
import { UserFormDialog } from "@/features/organization/components/user-form-dialog";
import { downloadUsersImportTemplate } from "@/features/organization/excel";
import type { UserAccount } from "@/features/organization/types";
import { entityId } from "@/features/organization/types";
import { useListPagination } from "@/hooks/use-list-pagination";
import { getApiErrorMessage } from "@/lib/api-client";
import { emptyPaginationMeta, rowIndex } from "@/lib/pagination";

export function EmployeesView() {
  const { page, setPage, limit, setLimit, query, setQuery, debouncedQuery } =
    useListPagination();

  const listParams = { page, limit, q: debouncedQuery };
  const { data, isLoading, mutate } = useSWR(userKeys.list(listParams), () =>
    fetchUsersPage(listParams),
  );
  const { data: departments = [] } = useSWR(
    "departments-for-employees",
    fetchDepartments,
  );

  const users = data?.data ?? [];
  const meta = data?.meta ?? emptyPaginationMeta(limit);

  const deptNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of departments) {
      map.set(entityId(d), `${d.code} - ${d.name}`);
    }
    return map;
  }, [departments]);

  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [edit, setEdit] = useState<UserAccount | null>(null);
  const [deleting, setDeleting] = useState<UserAccount | null>(null);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);

  const downloadTemplate = async () => {
    setDownloadingTemplate(true);
    try {
      await downloadUsersImportTemplate();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không tải được file mẫu."));
    } finally {
      setDownloadingTemplate(false);
    }
  };

  const openCreate = () => {
    setEdit(null);
    setFormOpen(true);
  };

  const openEdit = (user: UserAccount) => {
    setEdit(user);
    setFormOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await deleteUser(entityId(deleting));
      toast.success("Đã xoá người dùng.");
      setDeleting(null);
      await mutate();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không xoá được người dùng."));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            Người dùng
          </h1>
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <span>Tổ chức</span>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Người dùng</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={downloadingTemplate}
            onClick={downloadTemplate}
          >
            <Download className="h-4 w-4" />
            {downloadingTemplate ? "Đang tải..." : "Tải mẫu Excel"}
          </Button>
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <FileSpreadsheet className="h-4 w-4" />
            Import Excel
          </Button>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Thêm người dùng
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="space-y-4 pt-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Tìm theo tên đăng nhập, họ tên, email..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14">STT</TableHead>
                  <TableHead className="w-[140px]">Tên đăng nhập</TableHead>
                  <TableHead>Họ tên</TableHead>
                  <TableHead className="w-[110px]">Cấp bậc</TableHead>
                  <TableHead>Chức vụ</TableHead>
                  <TableHead>Đơn vị</TableHead>
                  <TableHead>Vai trò</TableHead>
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
                      colSpan={9}
                      className="h-24 text-center text-muted-foreground"
                    >
                      Đang tải...
                    </TableCell>
                  </TableRow>
                ) : users.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={9}
                      className="h-24 text-center text-muted-foreground"
                    >
                      <div className="inline-flex flex-col items-center gap-2">
                        <Users className="h-8 w-8 opacity-40" />
                        <span>Chưa có người dùng nào.</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  users.map((user, index) => {
                    const deptId = entityId(user.departmentId);
                    return (
                      <TableRow key={entityId(user)}>
                        <TableCell className="text-muted-foreground">
                          {rowIndex(meta.page, meta.limit, index)}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {user.username}
                        </TableCell>
                        <TableCell className="font-medium">
                          {user.fullName || "-"}
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap text-muted-foreground">
                          {user.rank || "-"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {user.position || "-"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {deptId ? deptNameById.get(deptId) || "-" : "-"}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {(user.roleAssignments ?? []).length === 0 ? (
                              <span className="text-muted-foreground">-</span>
                            ) : (
                              user.roleAssignments.map((r) => (
                                <Badge
                                  key={`${entityId(user)}-${r.roleCode}`}
                                  className={`font-mono text-xs ${codeBadgeClass(r.roleCode)}`}
                                >
                                  {r.roleCode}
                                </Badge>
                              ))
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {user.isActive ? (
                            <Badge
                              variant="outline"
                              className={activeBadgeClass}
                            >
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
                              onClick={() => openEdit(user)}
                              aria-label="Sửa"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => setDeleting(user)}
                              aria-label="Xoá"
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
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

      <UserFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        edit={edit}
        onSuccess={() => mutate()}
      />

      <ImportUsersDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onSuccess={() => mutate()}
      />

      <AlertDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xoá người dùng?</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn sắp xoá tài khoản{" "}
              <span className="font-medium text-foreground">
                {deleting?.username}
                {deleting?.fullName ? ` - ${deleting.fullName}` : ""}
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
