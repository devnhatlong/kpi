"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Expand,
  FolderTree,
  MinusSquare,
  Network,
  Pencil,
  Plus,
  PlusSquare,
  Search,
  Shrink,
  Trash2,
  Upload,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TablePagination } from "@/components/common/table-pagination";
import {
  deleteDepartment,
  departmentKeys,
  fetchDepartmentLevels,
  fetchDepartments,
  fetchUsers,
} from "@/features/organization/api";
import { ImportUnitsDialog } from "@/features/organization/components/import-units-dialog";
import { UnitFormDialog } from "@/features/organization/components/unit-form-dialog";
import {
  breadcrumbPath,
  buildUnitTree,
  collectIds,
  filterTree,
  type UnitTreeNode,
} from "@/features/organization/tree-utils";
import type { Department } from "@/features/organization/types";
import { entityId, levelOf } from "@/features/organization/types";
import { getApiErrorMessage } from "@/lib/api-client";
import { DEFAULT_PAGE_SIZE, rowIndex } from "@/lib/pagination";
import { cn } from "@/lib/utils";

function levelBadgeClass(rank?: number) {
  if (rank == null) return "bg-slate-600 text-white border-transparent";
  switch (rank) {
    case 1:
      return "bg-[#0f4c9c] text-white border-transparent"; // CAT
    case 2:
      return "bg-blue-600 text-white border-transparent"; // PHONG
    case 3:
      return "bg-slate-800 text-white border-transparent"; // DOI
    case 4:
      return "bg-emerald-700 text-white border-transparent"; // XA
    case 5:
      return "bg-teal-600 text-white border-transparent"; // PHUONG
    case 6:
      return "bg-amber-700 text-white border-transparent"; // DON
    case 7:
      return "bg-violet-700 text-white border-transparent"; // DK
    default:
      return "bg-slate-500 text-white border-transparent";
  }
}

/** Cột indent cố định — đường dọc neo tại left = 10px (giữa ô 20px) */
const TREE_COL = "relative w-5 shrink-0 self-stretch";
const TREE_LINE = "pointer-events-none absolute left-[10px] w-px bg-muted-foreground/35";

function TreeItem({
  node,
  depth,
  isLast,
  guides,
  selectedId,
  expanded,
  onToggle,
  onSelect,
}: {
  node: UnitTreeNode;
  depth: number;
  isLast: boolean;
  /** Cột hướng dẫn: true = còn vẽ đường dọc xuống các anh/em sau */
  guides: boolean[];
  selectedId: string;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
}) {
  const hasChildren = node.children.length > 0;
  const isOpen = expanded.has(node.id);
  const level = levelOf(node.department);
  const selected = selectedId === node.id;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => onSelect(node.id)}
        className={cn(
          "flex w-max min-w-full items-stretch rounded-md py-0.5 pr-2 text-left text-sm transition-colors",
          selected ? "bg-primary/10 text-foreground" : "hover:bg-muted/80",
        )}
      >
        {/* Indent + đường nối: gap-0 để các cột thẳng hàng tuyệt đối */}
        <span className="flex shrink-0 items-stretch">
          {guides.map((continueLine, i) => (
            <span key={i} className={TREE_COL}>
              {continueLine ? <span className={cn(TREE_LINE, "inset-y-0")} /> : null}
            </span>
          ))}

          {depth > 0 ? (
            <span className={TREE_COL}>
              <span
                className={cn(TREE_LINE, "top-0", isLast ? "h-1/2" : "bottom-0")}
              />
              <span className="pointer-events-none absolute top-1/2 left-[10px] h-px w-2.5 bg-muted-foreground/35" />
            </span>
          ) : null}

          {/* Luôn giữ slot icon để badge các hàng thẳng cột */}
          <span className="flex w-5 shrink-0 items-center justify-center self-stretch">
            {hasChildren ? (
              <span
                role="button"
                tabIndex={-1}
                className="inline-flex size-4 items-center justify-center text-muted-foreground hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggle(node.id);
                }}
              >
                {isOpen ? (
                  <MinusSquare className="size-3.5" strokeWidth={1.75} />
                ) : (
                  <PlusSquare className="size-3.5" strokeWidth={1.75} />
                )}
              </span>
            ) : null}
          </span>
        </span>

        <span className="flex min-h-7 items-center gap-1.5 pl-0.5">
          <Badge
            className={cn(
              "min-w-[2.75rem] shrink-0 justify-center rounded px-1.5 py-0 text-[10px] font-bold tracking-wide",
              levelBadgeClass(level?.rank),
            )}
          >
            {node.department.code}
          </Badge>
          <span className="whitespace-nowrap">{node.department.name}</span>
        </span>
      </button>

      {hasChildren && isOpen
        ? node.children.map((child, index) => (
            <TreeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              isLast={index === node.children.length - 1}
              guides={depth === 0 ? [] : [...guides, !isLast]}
              selectedId={selectedId}
              expanded={expanded}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))
        : null}
    </div>
  );
}

export function UnitsView() {
  const {
    data: departments = [],
    error: deptError,
    isLoading: deptLoading,
    mutate: mutateDepts,
  } = useSWR(departmentKeys.all, fetchDepartments, { revalidateOnFocus: false });

  const { data: levels = [] } = useSWR(departmentKeys.levels, fetchDepartmentLevels, {
    revalidateOnFocus: false,
  });

  const { data: users = [] } = useSWR(departmentKeys.users, fetchUsers, {
    revalidateOnFocus: false,
  });

  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [formOpen, setFormOpen] = useState(false);
  const [formEdit, setFormEdit] = useState<Department | null>(null);
  const [formParentId, setFormParentId] = useState<string | undefined>();
  const [importOpen, setImportOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Department | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [childrenPage, setChildrenPage] = useState(1);
  const [childrenLimit, setChildrenLimit] = useState(DEFAULT_PAGE_SIZE);
  const [usersPage, setUsersPage] = useState(1);
  const [usersLimit, setUsersLimit] = useState(DEFAULT_PAGE_SIZE);

  const tree = useMemo(() => buildUnitTree(departments), [departments]);
  const filteredTree = useMemo(() => filterTree(tree, query), [tree, query]);
  const allIds = useMemo(() => collectIds(tree), [tree]);

  const effectiveSelectedId = useMemo(() => {
    if (selectedId && departments.some((d) => entityId(d) === selectedId)) {
      return selectedId;
    }
    return departments[0] ? entityId(departments[0]) : "";
  }, [selectedId, departments]);

  const selected = departments.find((d) => entityId(d) === effectiveSelectedId);
  const children = departments.filter((d) => {
    const parentId =
      typeof d.parentId === "string"
        ? d.parentId
        : entityId(d.parentId as { _id?: string; id?: string } | null);
    return parentId === effectiveSelectedId;
  });
  const unitUsers = users.filter((u) => String(u.departmentId ?? "") === effectiveSelectedId);

  const childrenTotalPages = Math.max(1, Math.ceil(children.length / childrenLimit));
  const usersTotalPages = Math.max(1, Math.ceil(unitUsers.length / usersLimit));
  const pagedChildren = children.slice(
    (childrenPage - 1) * childrenLimit,
    childrenPage * childrenLimit,
  );
  const pagedUsers = unitUsers.slice((usersPage - 1) * usersLimit, usersPage * usersLimit);

  const selectedLevel = selected ? levelOf(selected) : null;
  const crumb = selected ? breadcrumbPath(departments, effectiveSelectedId) : "";

  useEffect(() => {
    setChildrenPage(1);
    setUsersPage(1);
  }, [effectiveSelectedId]);

  useEffect(() => {
    if (childrenPage > childrenTotalPages) setChildrenPage(childrenTotalPages);
  }, [childrenPage, childrenTotalPages]);

  useEffect(() => {
    if (usersPage > usersTotalPages) setUsersPage(usersTotalPages);
  }, [usersPage, usersTotalPages]);

  const openCreate = (parentId?: string) => {
    setFormEdit(null);
    setFormParentId(parentId);
    setFormOpen(true);
  };

  const openEdit = (dept: Department) => {
    setFormEdit(dept);
    setFormParentId(undefined);
    setFormOpen(true);
  };

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteDepartment(entityId(deleteTarget));
      toast.success("Đã xoá đơn vị.");
      if (entityId(deleteTarget) === effectiveSelectedId) setSelectedId("");
      setDeleteTarget(null);
      await mutateDepts();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không xoá được đơn vị."));
    } finally {
      setDeleting(false);
    }
  };

  const refresh = () => mutateDepts();

  useEffect(() => {
    if (tree.length === 0) return;
    setExpanded((prev) => {
      if (prev.size > 0) return prev;
      const seed = new Set<string>();
      for (const root of tree) {
        seed.add(root.id);
        for (const child of root.children) seed.add(child.id);
      }
      return seed;
    });
  }, [tree]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-semibold tracking-tight">Đơn vị</h1>
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <span>Tổ chức</span>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Đơn vị</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload />
            Import Excel
          </Button>
          <Button onClick={() => openCreate()}>
            <Plus />
            Thêm đơn vị gốc
          </Button>
        </div>
      </div>

      {deptError ? (
        <Card className="border-destructive/40">
          <CardContent className="py-4 text-sm text-destructive">
            {getApiErrorMessage(
              deptError,
              "Không tải được danh sách đơn vị. Kiểm tra đăng nhập và API.",
            )}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(260px,320px)_1fr] lg:grid-rows-[minmax(0,1fr)]">
        {/* Tree — cuộn dọc/ngang trong panel, không kéo cả trang */}
        <Card className="flex h-full min-h-0 max-h-full flex-col overflow-hidden border-border/80 shadow-sm">
          <div className="space-y-2 border-b bg-muted/30 p-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Tìm đơn vị..."
                className="pl-8"
              />
            </div>
            <div className="flex gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="flex-1"
                onClick={() => setExpanded(new Set(allIds))}
              >
                <Expand className="h-3.5 w-3.5" />
                Mở rộng
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="flex-1"
                onClick={() => setExpanded(new Set())}
              >
                <Shrink className="h-3.5 w-3.5" />
                Thu gọn
              </Button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-2">
            {deptLoading ? (
              <p className="p-4 text-sm text-muted-foreground">Đang tải...</p>
            ) : filteredTree.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">Chưa có đơn vị.</p>
            ) : (
              <div className="min-w-max">
                {filteredTree.map((node, index) => (
                  <TreeItem
                    key={node.id}
                    node={node}
                    depth={0}
                    isLast={index === filteredTree.length - 1}
                    guides={[]}
                    selectedId={effectiveSelectedId}
                    expanded={expanded}
                    onToggle={toggleExpand}
                    onSelect={setSelectedId}
                  />
                ))}
              </div>
            )}
          </div>
        </Card>

        {/* Detail */}
        <Card className="flex h-full min-h-0 max-h-full flex-col overflow-hidden border-border/80 shadow-sm">
          <CardContent className="min-h-0 flex-1 overflow-auto p-5 md:p-6">
            {!selected ? (
              <div className="flex flex-col items-center justify-center gap-2 py-20 text-muted-foreground">
                <FolderTree className="h-10 w-10 opacity-40" />
                <p className="text-sm">Chọn một đơn vị để xem chi tiết</p>
              </div>
            ) : (
              <>
                <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      {selectedLevel ? (
                        <Badge className={levelBadgeClass(selectedLevel.rank)}>
                          {selectedLevel.name}
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Chưa gán cấp</Badge>
                      )}
                      <h2 className="font-display text-xl font-semibold tracking-tight md:text-2xl">
                        {selected.name}
                      </h2>
                    </div>
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                      <Network className="h-3.5 w-3.5 shrink-0" />
                      <span>{crumb}</span>
                      <span>·</span>
                      <span>
                        Mã: <span className="font-medium text-foreground">{selected.code}</span>
                      </span>
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => openEdit(selected)}>
                      <Pencil />
                      Sửa
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => setDeleteTarget(selected)}
                    >
                      <Trash2 />
                      Xoá
                    </Button>
                  </div>
                </div>

                <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3">
                  <StatBox
                    icon={<Network className="h-4 w-4" />}
                    label="Đơn vị con"
                    value={String(children.length)}
                    className="bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200"
                  />
                  <StatBox
                    icon={<Users className="h-4 w-4" />}
                    label="Tài khoản"
                    value={String(unitUsers.length)}
                    className="bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
                  />
                  <StatBox
                    icon={<FolderTree className="h-4 w-4" />}
                    label="Trạng thái"
                    value={selected.isActive ? "Hoạt động" : "Ngưng"}
                    className="bg-violet-50 text-violet-800 dark:bg-violet-950/40 dark:text-violet-200"
                  />
                </div>

                <Tabs defaultValue="children">
                  <TabsList>
                    <TabsTrigger value="children">
                      Đơn vị con
                      <Badge variant="secondary" className="ml-1.5 h-5 px-1.5">
                        {children.length}
                      </Badge>
                    </TabsTrigger>
                    <TabsTrigger value="accounts">
                      Tài khoản
                      <Badge variant="secondary" className="ml-1.5 h-5 px-1.5">
                        {unitUsers.length}
                      </Badge>
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="children" className="space-y-3 pt-3">
                    <div className="flex justify-end">
                      <Button size="sm" onClick={() => openCreate(effectiveSelectedId)}>
                        <Plus />
                        Thêm đơn vị con
                      </Button>
                    </div>
                    <div className="rounded-lg border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-14">STT</TableHead>
                            <TableHead className="w-28">Mã</TableHead>
                            <TableHead>Tên</TableHead>
                            <TableHead className="w-32">Cấp</TableHead>
                            <TableHead className="w-28">Trạng thái</TableHead>
                            <TableHead className="w-24 text-right">Thao tác</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {children.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                                Chưa có đơn vị con. Bấm &quot;Thêm đơn vị con&quot;.
                              </TableCell>
                            </TableRow>
                          ) : (
                            pagedChildren.map((child, i) => {
                              const childLevel = levelOf(child);
                              return (
                                <TableRow key={entityId(child)}>
                                  <TableCell className="text-muted-foreground">
                                    {rowIndex(childrenPage, childrenLimit, i)}
                                  </TableCell>
                                  <TableCell>
                                    <Badge className={levelBadgeClass(childLevel?.rank)}>
                                      {child.code}
                                    </Badge>
                                  </TableCell>
                                  <TableCell>
                                    <button
                                      type="button"
                                      className="font-medium text-primary hover:underline"
                                      onClick={() => setSelectedId(entityId(child))}
                                    >
                                      {child.name}
                                    </button>
                                  </TableCell>
                                  <TableCell>{childLevel?.name ?? "-"}</TableCell>
                                  <TableCell>
                                    {child.isActive ? (
                                      <Badge variant="secondary">Hoạt động</Badge>
                                    ) : (
                                      <Badge variant="outline">Ngưng</Badge>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => openEdit(child)}
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => setDeleteTarget(child)}
                                    >
                                      <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              );
                            })
                          )}
                        </TableBody>
                      </Table>
                    </div>
                    {children.length > 0 ? (
                      <TablePagination
                        page={childrenPage}
                        limit={childrenLimit}
                        total={children.length}
                        totalPages={childrenTotalPages}
                        onPageChange={setChildrenPage}
                        onLimitChange={(next) => {
                          setChildrenLimit(next);
                          setChildrenPage(1);
                        }}
                      />
                    ) : null}
                  </TabsContent>

                  <TabsContent value="accounts" className="space-y-3 pt-3">
                    <div className="rounded-lg border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-14">STT</TableHead>
                            <TableHead>Họ tên</TableHead>
                            <TableHead>Tên đăng nhập</TableHead>
                            <TableHead>Email</TableHead>
                            <TableHead>Vai trò</TableHead>
                            <TableHead className="w-28">Trạng thái</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {unitUsers.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                                Chưa có tài khoản thuộc đơn vị này.
                              </TableCell>
                            </TableRow>
                          ) : (
                            pagedUsers.map((user, i) => (
                              <TableRow key={user.id}>
                                <TableCell className="text-muted-foreground">
                                  {rowIndex(usersPage, usersLimit, i)}
                                </TableCell>
                                <TableCell className="font-medium">
                                  {user.fullName || "-"}
                                </TableCell>
                                <TableCell>{user.username}</TableCell>
                                <TableCell>{user.email || "-"}</TableCell>
                                <TableCell>
                                  <div className="flex flex-wrap gap-1">
                                    {(user.roleAssignments ?? []).length === 0 ? (
                                      <span className="text-muted-foreground">-</span>
                                    ) : (
                                      user.roleAssignments.map((r) => (
                                        <Badge key={`${user.id}-${r.roleCode}`} variant="outline">
                                          {r.roleCode}
                                        </Badge>
                                      ))
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  {user.isActive ? (
                                    <Badge variant="secondary">Hoạt động</Badge>
                                  ) : (
                                    <Badge variant="outline">Ngưng</Badge>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                    {unitUsers.length > 0 ? (
                      <TablePagination
                        page={usersPage}
                        limit={usersLimit}
                        total={unitUsers.length}
                        totalPages={usersTotalPages}
                        onPageChange={setUsersPage}
                        onLimitChange={(next) => {
                          setUsersLimit(next);
                          setUsersPage(1);
                        }}
                      />
                    ) : null}
                  </TabsContent>
                </Tabs>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <UnitFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        departments={departments}
        levels={levels}
        edit={formEdit}
        defaultParentId={formParentId}
        onSuccess={refresh}
      />

      <ImportUnitsDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onSuccess={refresh}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xoá đơn vị?</AlertDialogTitle>
            <AlertDialogDescription>
              Xoá &quot;{deleteTarget?.name}&quot; ({deleteTarget?.code}). Chỉ xoá được khi không
              còn đơn vị con.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Huỷ</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void confirmDelete();
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Đang xoá..." : "Xoá"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StatBox({
  icon,
  label,
  value,
  className,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-md border border-black/5 px-4 py-3 dark:border-white/10",
        className,
      )}
    >
      {icon}
      <div>
        <div className="text-xs font-medium opacity-80">{label}</div>
        <div className="font-display text-lg font-bold leading-tight">{value}</div>
      </div>
    </div>
  );
}
