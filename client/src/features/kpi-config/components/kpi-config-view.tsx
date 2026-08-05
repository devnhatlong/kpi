"use client";

import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { ClipboardList, Layers3, Pencil, Plus, Trash2 } from "lucide-react";
import useSWR from "swr";
import { toast } from "sonner";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  activeBadgeClass,
  inactiveBadgeClass,
} from "@/features/organization/badge-styles";
import { fetchRoles, fetchUsers } from "@/features/organization/api";
import { useAuth } from "@/features/auth/auth-provider";
import { isSuperAdmin, userHasAnyRole } from "@/features/auth/types";
import { entityId } from "@/features/organization/types";
import { getApiErrorMessage } from "@/lib/api-client";
import {
  createTaskAssignment,
  createWorkContent,
  createWorkGroup,
  deleteTaskAssignment,
  deleteWorkContent,
  deleteWorkGroup,
  fetchKpiTemplates,
  fetchTaskAssignments,
  fetchWorkContents,
  fetchWorkGroups,
  kpiConfigKeys,
  updateTaskAssignment,
  updateWorkContent,
  updateWorkGroup,
} from "../api";
import {
  TASK_STATUSES,
  resolveTemplateWorkflowRules,
  type CatalogScope,
  type KpiTemplate,
  type TaskAssignment,
  type TaskAssignmentInput,
  type TaskStatus,
  type WorkContent,
  type WorkGroup,
} from "../types";
import { TaskAssignmentGrid } from "./task-assignment-grid";
import { TemplateConfigView } from "./template-config-view";
import { CatalogScopeBadge } from "./catalog-scope-badge";
import { CatalogScopeFields } from "./catalog-scope-fields";
import {
  canUserMutateCatalogItem,
  groupsForCatalogScope,
  isDepartmentCatalog,
  ownerDepartmentIdString,
} from "../catalog-scope-utils";
import {
  buildFieldValuesFromTemplate,
  canEditDialogColumn,
  getAssignmentDialogColumns,
  getColumnSemanticField,
  getTemplateColumnValue,
  getTemporalInputKind,
  isNumericTemplateColumn,
  isTemplateColumnRequired,
  parseTemporalForApi,
  readFieldValueBySemantic,
  taskValueSourceFromAssignment,
  temporalInputValue,
  toDateInputValue,
  type TaskValueSource,
} from "../template-column-utils";

type TabValue = "tasks" | "contents" | "groups" | "template";

const SELECTED_TEMPLATE_KEY = "kpi-selected-template-id";

function relationId(value: object | string): string {
  return entityId(value as { _id?: string; id?: string } | string);
}

function groupOf(content: WorkContent | null): WorkGroup | null {
  return !content || typeof content.groupId === "string"
    ? null
    : content.groupId;
}

function Field({
  label,
  children,
  required,
  className,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
  className?: string;
}) {
  return (
    <div className={className ? `space-y-2 ${className}` : "space-y-2"}>
      <Label>
        {label}
        {required ? <span className="ml-1 text-destructive">*</span> : null}
      </Label>
      {children}
    </div>
  );
}

export function KpiConfigView() {
  const { user } = useAuth();
  const canManageCatalog = userHasAnyRole(user, [
    "SUPER_ADMIN",
    "UNIT_ADMIN",
  ]);
  const canManageTemplate = isSuperAdmin(user);
  const canManageDepartmentTemplate =
    userHasAnyRole(user, ["UNIT_ADMIN"]) && !canManageTemplate;
  const canAccessTemplateTab =
    canManageTemplate || canManageDepartmentTemplate;
  const templateCatalogScope = canManageTemplate ? undefined : "DEPARTMENT";
  const [tab, setTab] = useState<TabValue>("tasks");
  const [templateConfigTab, setTemplateConfigTab] = useState<
    "columns" | "contents" | "formula" | "workflow"
  >("columns");
  const catalogGroupsQuery = useSWR(kpiConfigKeys.groups(), () => fetchWorkGroups());
  const catalogContentsQuery = useSWR(kpiConfigKeys.contents(), () =>
    fetchWorkContents(),
  );
  const systemGroupsQuery = useSWR(kpiConfigKeys.groups("SYSTEM"), () =>
    fetchWorkGroups("SYSTEM"),
  );
  const systemTemplatesQuery = useSWR(kpiConfigKeys.templates("SYSTEM"), () =>
    fetchKpiTemplates("SYSTEM"),
  );
  const systemContentsQuery = useSWR(kpiConfigKeys.contents("SYSTEM"), () =>
    fetchWorkContents("SYSTEM"),
  );
  const tasksQuery = useSWR(kpiConfigKeys.tasks, fetchTaskAssignments);
  const usersQuery = useSWR(["organization", "users", "all"], fetchUsers);
  const rolesQuery = useSWR(["organization", "roles", "all"], fetchRoles);

  const [selectedTemplateId, setSelectedTemplateId] = useState("");

  const [groupDialog, setGroupDialog] = useState(false);
  const [contentDialog, setContentDialog] = useState(false);
  const [taskDialog, setTaskDialog] = useState(false);
  const [editingGroup, setEditingGroup] = useState<WorkGroup | null>(null);
  const [editingContent, setEditingContent] = useState<WorkContent | null>(
    null,
  );
  const [editingTask, setEditingTask] = useState<TaskAssignment | null>(null);
  const [creatingForContent, setCreatingForContent] =
    useState<WorkContent | null>(null);

  const catalogGroups = catalogGroupsQuery.data ?? [];
  const catalogContents = catalogContentsQuery.data ?? [];
  const systemGroups = systemGroupsQuery.data ?? [];
  const systemContents = systemContentsQuery.data ?? [];
  const tasks = tasksQuery.data ?? [];
  const templates = systemTemplatesQuery.data ?? [];
  const userRoleCodes =
    user?.roleAssignments.map((item) => item.roleCode) ?? [];
  const users = usersQuery.data?.filter((item) => item.isActive) ?? [];
  const roles = rolesQuery.data?.filter((role) => role.isActive) ?? [];

  useEffect(() => {
    if (tab === "template" && !canAccessTemplateTab) setTab("tasks");
    if ((tab === "groups" || tab === "contents") && !canManageCatalog) {
      setTab("tasks");
    }
  }, [tab, canAccessTemplateTab, canManageCatalog]);

  useEffect(() => {
    if (!templates.length || selectedTemplateId) return;
    const saved = localStorage.getItem(SELECTED_TEMPLATE_KEY);
    if (saved && templates.some((item) => entityId(item) === saved)) {
      setSelectedTemplateId(saved);
      return;
    }
    const preferred =
      templates.find((item) => item.isActive) ?? templates[0] ?? null;
    if (preferred) setSelectedTemplateId(entityId(preferred));
  }, [templates, selectedTemplateId]);

  const selectedTemplate =
    templates.find((item) => entityId(item) === selectedTemplateId) ?? null;
  const selectedWorkflowRules = resolveTemplateWorkflowRules(
    selectedTemplate?.workflowRules,
  );
  const allowAddTaskOnPreview =
    selectedWorkflowRules.publishMode === "MANY_TASKS" &&
    userHasAnyRole(user, selectedWorkflowRules.taskCreators);

  const scopedContents = useMemo(() => {
    if (!selectedTemplate) return [];
    const includedIds = (selectedTemplate.includedContentIds ?? []).map(String);
    // Rỗng = không cho chọn nội dung nào (Super Admin phải tick trong biểu mẫu).
    if (!includedIds.length) return [];
    const allowed = new Set(includedIds);
    return systemContents.filter(
      (item) => item.isActive && allowed.has(entityId(item)),
    );
  }, [systemContents, selectedTemplate]);

  const scopedTasks = useMemo(() => {
    const contentIds = new Set(scopedContents.map((item) => entityId(item)));
    return tasks.filter((item) => contentIds.has(relationId(item.contentId)));
  }, [tasks, scopedContents]);

  const taskDialogContents = useMemo(() => {
    if (!editingTask) return scopedContents;
    const currentId = relationId(editingTask.contentId);
    if (scopedContents.some((item) => entityId(item) === currentId)) {
      return scopedContents;
    }
    const current = systemContents.find((item) => entityId(item) === currentId);
    return current ? [...scopedContents, current] : scopedContents;
  }, [systemContents, editingTask, scopedContents]);

  const selectTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId);
    localStorage.setItem(SELECTED_TEMPLATE_KEY, templateId);
  };

  const openCreate = () => {
    if (tab === "template") return;
    if (tab === "groups") {
      setEditingGroup(null);
      setGroupDialog(true);
    } else if (tab === "contents") {
      if (!catalogGroups.length) {
        toast.error("Hãy tạo nhóm công việc trước.");
        return;
      }
      setEditingContent(null);
      setContentDialog(true);
    } else {
      if (!selectedTemplate) {
        toast.error("Hãy chọn biểu mẫu KPI trước.");
        return;
      }
      if (!scopedContents.length) {
        toast.error(
          canManageTemplate
            ? "Biểu mẫu chưa có nội dung công việc. Hãy chọn nội dung trong tab Cấu hình biểu mẫu."
            : "Biểu mẫu chưa có nội dung công việc. Liên hệ quản trị hệ thống để cấu hình biểu mẫu.",
        );
        return;
      }
      setEditingTask(null);
      setCreatingForContent(null);
      setTaskDialog(true);
    }
  };

  const remove = async (kind: TabValue, id: string, name: string) => {
    if (!window.confirm(`Xoá “${name}”? Thao tác này không thể hoàn tác.`))
      return;
    try {
      if (kind === "groups") {
        await deleteWorkGroup(id);
        await catalogGroupsQuery.mutate();
      } else if (kind === "contents") {
        await deleteWorkContent(id);
        await catalogContentsQuery.mutate();
      } else {
        await deleteTaskAssignment(id);
        await tasksQuery.mutate();
      }
      toast.success("Đã xoá dữ liệu.");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không thể xoá dữ liệu."));
    }
  };

  const buttonLabel =
    tab === "groups"
      ? "Thêm nhóm công việc"
      : tab === "contents"
        ? "Thêm nội dung"
        : "Giao nhiệm vụ";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            Cấu hình và giao KPI
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Quản lý danh mục công việc, giao nhiệm vụ và kết quả đánh giá.
          </p>
        </div>
        {tab !== "template" ? (
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            {buttonLabel}
          </Button>
        ) : null}
      </div>

      <Tabs
        value={tab}
        onValueChange={(value) => {
          const next = value as TabValue;
          setTab(next);
          if (next === "tasks") {
            void systemTemplatesQuery.mutate();
            void systemContentsQuery.mutate();
          }
        }}
        className="flex min-h-0 flex-1 flex-col"
      >
        <TabsList className="h-auto w-fit flex-wrap">
          <TabsTrigger value="tasks">Nhiệm vụ được giao</TabsTrigger>
          {canManageCatalog ? (
            <TabsTrigger value="contents">
              {canManageTemplate ? "Nội dung công việc" : "Nội dung nội bộ"}
            </TabsTrigger>
          ) : null}
          {canManageCatalog ? (
            <TabsTrigger value="groups">
              {canManageTemplate ? "Nhóm công việc" : "Nhóm nội bộ"}
            </TabsTrigger>
          ) : null}
          {canAccessTemplateTab ? (
            <TabsTrigger value="template">
              {canManageTemplate ? "Cấu hình biểu mẫu" : "Biểu mẫu nội bộ"}
            </TabsTrigger>
          ) : null}
        </TabsList>

        <TabsContent value="tasks" className="mt-4 space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3 rounded-md border bg-muted/20 px-4 py-3">
            <div className="space-y-2">
              <Label>Biểu mẫu KPI</Label>
              <Select
                value={selectedTemplateId}
                onValueChange={selectTemplate}
              >
                <SelectTrigger className="w-[280px]">
                  <SelectValue placeholder="Chọn biểu mẫu" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((template) => (
                    <SelectItem key={entityId(template)} value={entityId(template)}>
                      {template.name} ({template.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedTemplate ? (
                <p className="text-xs text-muted-foreground">
                  {scopedContents.length} nội dung công việc ·{" "}
                  {selectedTemplate.columns.filter((item) => item.visible).length}{" "}
                  cột hiển thị
                  {!selectedTemplate.includedContentIds.length
                    ? " · chưa chọn nội dung trong biểu mẫu"
                    : ""}
                </p>
              ) : null}
            </div>
            {systemTemplatesQuery.isLoading ? (
              <span className="text-sm text-muted-foreground">
                Đang tải biểu mẫu...
              </span>
            ) : !templates.length ? (
              <Button variant="outline" onClick={() => setTab("template")}>
                Tạo biểu mẫu đầu tiên
              </Button>
            ) : null}
          </div>

          {selectedTemplate && !scopedContents.length ? (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100">
              <p className="font-medium">
                Biểu mẫu chưa gắn nội dung công việc - chưa có dòng để thao tác.
              </p>
              <p className="mt-1 text-amber-900/80 dark:text-amber-100/80">
                Super Admin cần vào{" "}
                <strong>Cấu hình biểu mẫu → Nội dung công việc</strong>, bật nội
                dung muốn dùng, rồi bấm <strong>Lưu cấu hình</strong>.
              </p>
              {canManageTemplate ? (
                <Button
                  className="mt-3"
                  size="sm"
                  onClick={() => {
                    setTemplateConfigTab("contents");
                    setTab("template");
                  }}
                >
                  Chọn nội dung cho biểu mẫu
                </Button>
              ) : null}
            </div>
          ) : null}

          <Card>
            <CardContent className="pt-6">
              <TaskAssignmentGrid
                template={selectedTemplate}
                groups={systemGroups}
                contents={scopedContents}
                tasks={scopedTasks}
                loading={
                  tasksQuery.isLoading ||
                  systemContentsQuery.isLoading ||
                  systemTemplatesQuery.isLoading
                }
                allowAddTask={allowAddTaskOnPreview}
                onAddTask={(content) => {
                  setEditingTask(null);
                  setCreatingForContent(content);
                  setTaskDialog(true);
                }}
                onEditTask={(task) => {
                  setCreatingForContent(null);
                  setEditingTask(task);
                  setTaskDialog(true);
                }}
                onDeleteTask={(task) =>
                  remove("tasks", entityId(task), task.title)
                }
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="contents" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-32">Mã</TableHead>
                      <TableHead className="w-36">Phạm vi</TableHead>
                      <TableHead>Nội dung công việc</TableHead>
                      <TableHead>Nhóm công việc</TableHead>
                      <TableHead className="w-28">Trạng thái</TableHead>
                      <TableHead className="w-24 text-right">
                        Thao tác
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {catalogContentsQuery.isLoading ? (
                      <EmptyRow colSpan={6} text="Đang tải nội dung..." />
                    ) : catalogContents.length === 0 ? (
                      <EmptyRow
                        colSpan={6}
                        text={
                          canManageTemplate
                            ? "Chưa có nội dung công việc hệ thống."
                            : "Chưa có nội dung nội bộ của phòng."
                        }
                      />
                    ) : (
                      catalogContents.map((content) => (
                        <TableRow key={entityId(content)}>
                          <TableCell>
                            <Badge variant="outline" className="font-mono">
                              {content.code}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <CatalogScopeBadge
                              scope={content.scope}
                              ownerDepartmentId={content.ownerDepartmentId}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="font-medium">{content.name}</div>
                            {content.description ? (
                              <div className="text-xs text-muted-foreground">
                                {content.description}
                              </div>
                            ) : null}
                          </TableCell>
                          <TableCell>{groupOf(content)?.name ?? "-"}</TableCell>
                          <TableCell>
                            <ActiveBadge active={content.isActive} />
                          </TableCell>
                          <TableCell className="text-right">
                            {canUserMutateCatalogItem(
                              canManageTemplate,
                              content,
                            ) ? (
                              <RowActions
                                onEdit={() => {
                                  setEditingContent(content);
                                  setContentDialog(true);
                                }}
                                onDelete={() =>
                                  remove(
                                    "contents",
                                    entityId(content),
                                    content.name,
                                  )
                                }
                              />
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                Chỉ xem
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="groups" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-32">Mã</TableHead>
                      <TableHead className="w-36">Phạm vi</TableHead>
                      <TableHead>Nhóm công việc</TableHead>
                      <TableHead className="w-24 text-center">Thứ tự</TableHead>
                      <TableHead className="w-28">Trạng thái</TableHead>
                      <TableHead className="w-24 text-right">
                        Thao tác
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {catalogGroupsQuery.isLoading ? (
                      <EmptyRow colSpan={6} text="Đang tải nhóm..." />
                    ) : catalogGroups.length === 0 ? (
                      <EmptyRow colSpan={6} text="Chưa có nhóm công việc." />
                    ) : (
                      catalogGroups.map((group) => (
                        <TableRow key={entityId(group)}>
                          <TableCell>
                            <Badge variant="outline" className="font-mono">
                              {group.code}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <CatalogScopeBadge
                              scope={group.scope}
                              ownerDepartmentId={group.ownerDepartmentId}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="font-medium">{group.name}</div>
                            {group.description ? (
                              <div className="text-xs text-muted-foreground">
                                {group.description}
                              </div>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-center">
                            {group.sortOrder}
                          </TableCell>
                          <TableCell>
                            <ActiveBadge active={group.isActive} />
                          </TableCell>
                          <TableCell className="text-right">
                            {canUserMutateCatalogItem(
                              canManageTemplate,
                              group,
                            ) ? (
                              <RowActions
                                onEdit={() => {
                                  setEditingGroup(group);
                                  setGroupDialog(true);
                                }}
                                onDelete={() =>
                                  remove("groups", entityId(group), group.name)
                                }
                              />
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                Chỉ xem
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent
          value="template"
          className="mt-4 flex min-h-0 flex-1 flex-col"
        >
          <TemplateConfigView
            catalogScope={templateCatalogScope}
            allowMutateScope={canManageTemplate ? "SYSTEM" : "DEPARTMENT"}
            canMutateAllCatalog={canManageTemplate}
            contents={catalogContents}
            roles={roles}
            users={users}
            initialTemplateId={selectedTemplateId}
            initialConfigTab={templateConfigTab}
            onTemplatesChange={() => systemTemplatesQuery.mutate()}
          />
        </TabsContent>
      </Tabs>

      {groupDialog ? (
        <GroupDialog
          open
          onOpenChange={setGroupDialog}
          edit={editingGroup}
          allowSelectScope={canManageTemplate}
          onSuccess={() => catalogGroupsQuery.mutate()}
        />
      ) : null}
      {contentDialog ? (
        <ContentDialog
          open
          onOpenChange={setContentDialog}
          edit={editingContent}
          groups={catalogGroups}
          allowSelectScope={canManageTemplate}
          onSuccess={async () => {
            await catalogContentsQuery.mutate();
            await tasksQuery.mutate();
          }}
        />
      ) : null}
      {taskDialog ? (
        <TaskDialog
          open
          onOpenChange={setTaskDialog}
          edit={editingTask}
          initialContent={creatingForContent}
          template={selectedTemplate}
          contents={taskDialogContents}
          users={users}
          userRoleCodes={userRoleCodes}
          onSuccess={() => tasksQuery.mutate()}
        />
      ) : null}
    </div>
  );
}

function EmptyRow({ colSpan, text }: { colSpan: number; text: string }) {
  return (
    <TableRow>
      <TableCell
        colSpan={colSpan}
        className="h-28 text-center text-muted-foreground"
      >
        <ClipboardList className="mx-auto mb-2 h-7 w-7 opacity-40" />
        {text}
      </TableCell>
    </TableRow>
  );
}

function RowActions({
  onEdit,
  onDelete,
}: {
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="inline-flex gap-1">
      <Button size="icon" variant="ghost" onClick={onEdit} aria-label="Sửa">
        <Pencil className="h-4 w-4" />
      </Button>
      <Button size="icon" variant="ghost" onClick={onDelete} aria-label="Xoá">
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
    </div>
  );
}

function ActiveBadge({ active }: { active: boolean }) {
  return (
    <Badge
      variant="outline"
      className={active ? activeBadgeClass : inactiveBadgeClass}
    >
      {active ? "Hoạt động" : "Ngừng"}
    </Badge>
  );
}

type GroupDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  edit: WorkGroup | null;
  allowSelectScope: boolean;
  onSuccess: () => void;
};

function GroupDialog({
  open,
  onOpenChange,
  edit,
  allowSelectScope,
  onSuccess,
}: GroupDialogProps) {
  const [code, setCode] = useState(edit?.code ?? "");
  const [name, setName] = useState(edit?.name ?? "");
  const [description, setDescription] = useState(edit?.description ?? "");
  const [sortOrder, setSortOrder] = useState(String(edit?.sortOrder ?? 0));
  const [isActive, setIsActive] = useState(edit?.isActive ?? true);
  const [scope, setScope] = useState<CatalogScope>(edit?.scope ?? "SYSTEM");
  const [ownerDepartmentId, setOwnerDepartmentId] = useState(
    ownerDepartmentIdString(edit?.ownerDepartmentId),
  );
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!code.trim() || !name.trim()) {
      toast.error("Vui lòng nhập mã và tên nhóm công việc.");
      return;
    }
    if (!edit && allowSelectScope && scope === "DEPARTMENT" && !ownerDepartmentId) {
      toast.error("Vui lòng chọn đơn vị cho phạm vi Đơn vị.");
      return;
    }
    setSaving(true);
    try {
      const input = {
        code: code.trim().toUpperCase(),
        name: name.trim(),
        description: description.trim(),
        sortOrder: Number(sortOrder) || 0,
        isActive,
        ...(!edit && allowSelectScope
          ? {
            scope,
            ...(scope === "DEPARTMENT" ? { ownerDepartmentId } : {}),
          }
          : {}),
      };
      if (edit) await updateWorkGroup(entityId(edit), input);
      else await createWorkGroup(input);
      toast.success(
        edit ? "Đã cập nhật nhóm công việc." : "Đã tạo nhóm công việc.",
      );
      onOpenChange(false);
      onSuccess();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không lưu được nhóm công việc."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {edit ? "Sửa nhóm công việc" : "Thêm nhóm công việc"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <CatalogScopeFields
            allowSelectScope={allowSelectScope}
            scope={scope}
            ownerDepartmentId={ownerDepartmentId}
            onScopeChange={setScope}
            onOwnerDepartmentIdChange={setOwnerDepartmentId}
            readOnly={!!edit}
            readOnlyOwnerDepartmentId={edit ?? undefined}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Mã nhóm" required>
              <Input
                value={code}
                onChange={(event) => setCode(event.target.value)}
              />
            </Field>
            <Field label="Tên nhóm" required>
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
          </div>
          <Field label="Mô tả">
            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </Field>
          <Field label="Thứ tự hiển thị">
            <Input
              type="number"
              min={0}
              value={sortOrder}
              onChange={(event) => setSortOrder(event.target.value)}
            />
          </Field>
          <div className="flex items-center justify-between rounded-md border p-3">
            <Label>Đang hoạt động</Label>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Đang lưu..." : "Lưu"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type ContentDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  edit: WorkContent | null;
  groups: WorkGroup[];
  allowSelectScope: boolean;
  onSuccess: () => void;
};

function ContentDialog({
  open,
  onOpenChange,
  edit,
  groups,
  allowSelectScope,
  onSuccess,
}: ContentDialogProps) {
  const code = edit?.code ?? "";
  const [name, setName] = useState(edit?.name ?? "");
  const [scope, setScope] = useState<CatalogScope>(edit?.scope ?? "SYSTEM");
  const [ownerDepartmentId, setOwnerDepartmentId] = useState(
    ownerDepartmentIdString(edit?.ownerDepartmentId),
  );
  const scopedGroups = useMemo(
    () =>
      allowSelectScope && !edit
        ? groupsForCatalogScope(groups, scope, ownerDepartmentId)
        : edit
          ? groups.filter(
            (group) =>
              entityId(group) === entityId(edit.groupId) ||
              (!isDepartmentCatalog(edit)
                ? !isDepartmentCatalog(group)
                : isDepartmentCatalog(group) &&
                ownerDepartmentIdString(group.ownerDepartmentId) ===
                ownerDepartmentIdString(edit.ownerDepartmentId)),
          )
          : groups.filter((group) => isDepartmentCatalog(group)),
    [allowSelectScope, edit, groups, ownerDepartmentId, scope],
  );
  const [groupId, setGroupId] = useState(
    edit ? entityId(edit.groupId) : entityId(scopedGroups[0]),
  );
  const [description, setDescription] = useState(edit?.description ?? "");
  const [sortOrder, setSortOrder] = useState(String(edit?.sortOrder ?? 0));
  const [isActive, setIsActive] = useState(edit?.isActive ?? true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (edit) return;
    if (!scopedGroups.some((group) => entityId(group) === groupId)) {
      setGroupId(entityId(scopedGroups[0]));
    }
  }, [edit, groupId, scopedGroups]);

  const submit = async () => {
    if (!name.trim() || !groupId) {
      toast.error("Vui lòng nhập tên và chọn nhóm công việc.");
      return;
    }
    if (!edit && allowSelectScope && scope === "DEPARTMENT" && !ownerDepartmentId) {
      toast.error("Vui lòng chọn đơn vị cho phạm vi Đơn vị.");
      return;
    }
    setSaving(true);
    try {
      const input = {
        name: name.trim(),
        groupId,
        description: description.trim(),
        sortOrder: Number(sortOrder) || 0,
        isActive,
        ...(edit ? { code: code.trim().toUpperCase() || edit.code } : {}),
        ...(!edit && allowSelectScope
          ? {
            scope,
            ...(scope === "DEPARTMENT" ? { ownerDepartmentId } : {}),
          }
          : {}),
      };
      if (edit) await updateWorkContent(entityId(edit), input);
      else await createWorkContent(input);
      toast.success(
        edit ? "Đã cập nhật nội dung." : "Đã tạo nội dung công việc.",
      );
      onOpenChange(false);
      onSuccess();
    } catch (error) {
      toast.error(
        getApiErrorMessage(error, "Không lưu được nội dung công việc."),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {edit ? "Sửa nội dung công việc" : "Thêm nội dung công việc"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <CatalogScopeFields
            allowSelectScope={allowSelectScope}
            scope={scope}
            ownerDepartmentId={ownerDepartmentId}
            onScopeChange={setScope}
            onOwnerDepartmentIdChange={setOwnerDepartmentId}
            readOnly={!!edit}
            readOnlyOwnerDepartmentId={edit ?? undefined}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Mã nội dung">
              <Input
                value={edit ? code : ""}
                placeholder="Tự sinh khi lưu (ND-0001…)"
                disabled
                readOnly
              />
            </Field>
            <Field label="Nhóm công việc" required>
              <Select value={groupId} onValueChange={setGroupId}>
                <SelectTrigger>
                  <SelectValue placeholder="Chọn nhóm" />
                </SelectTrigger>
                <SelectContent>
                  {scopedGroups.map((group) => (
                    <SelectItem key={entityId(group)} value={entityId(group)}>
                      {group.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Tên nội dung công việc" required>
            <Textarea
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field label="Mô tả">
            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Thứ tự hiển thị">
              <Input
                type="number"
                min={0}
                value={sortOrder}
                onChange={(event) => setSortOrder(event.target.value)}
              />
            </Field>
            <div className="flex items-end">
              <div className="flex h-9 w-full items-center justify-between rounded-md border px-3">
                <Label>Đang hoạt động</Label>
                <Switch checked={isActive} onCheckedChange={setIsActive} />
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Đang lưu..." : "Lưu"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type TaskDialogForm = {
  contentId: string;
  assigneeId: string;
  status: TaskStatus;
  fieldValues: Record<string, string>;
};

function taskDialogFormFrom(
  edit: TaskAssignment | null,
  contents: WorkContent[],
  initialContent: WorkContent | null,
  template: KpiTemplate | null,
  userRoleCodes: readonly string[] = [],
): TaskDialogForm {
  const contentId = edit
    ? entityId(edit.contentId)
    : entityId(initialContent) ||
    entityId(contents.find((content) => content.isActive));
  const contentName =
    contents.find((item) => entityId(item) === contentId)?.name ?? "";

  const seeded = edit
    ? buildFieldValuesFromTemplate(
      template,
      taskValueSourceFromAssignment(edit, contentName),
      edit.fieldValues ?? {},
    )
    : {};

  const fieldValues: Record<string, string> = {};
  for (const column of getAssignmentDialogColumns(template, userRoleCodes)) {
    const raw =
      seeded[column.key] ??
      edit?.fieldValues?.[column.key] ??
      (edit
        ? getTemplateColumnValue(column, edit, 0, template, contentName)
        : "");
    fieldValues[column.key] = raw == null ? "" : String(raw);
  }

  return {
    contentId,
    assigneeId: edit?.assigneeId ? entityId(edit.assigneeId) : "",
    status: edit?.status ?? "ASSIGNED",
    fieldValues,
  };
}

type TaskDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  edit: TaskAssignment | null;
  initialContent: WorkContent | null;
  template: KpiTemplate | null;
  contents: WorkContent[];
  users: Awaited<ReturnType<typeof fetchUsers>>;
  userRoleCodes: string[];
  onSuccess: () => void;
};

function TaskDialog({
  open,
  onOpenChange,
  edit,
  initialContent,
  template,
  contents,
  users,
  userRoleCodes,
  onSuccess,
}: TaskDialogProps) {
  const [form, setForm] = useState<TaskDialogForm>(() =>
    taskDialogFormFrom(edit, contents, initialContent, template, userRoleCodes),
  );
  const [saving, setSaving] = useState(false);

  const dialogColumns = useMemo(
    () => getAssignmentDialogColumns(template, userRoleCodes),
    [template, userRoleCodes],
  );

  const editableColumns = useMemo(
    () =>
      dialogColumns.filter((column) =>
        canEditDialogColumn(column, userRoleCodes),
      ),
    [dialogColumns, userRoleCodes],
  );

  useEffect(() => {
    if (!open) return;
    setForm(
      taskDialogFormFrom(
        edit,
        contents,
        initialContent,
        template,
        userRoleCodes,
      ),
    );
  }, [open, edit, contents, initialContent, template, userRoleCodes]);

  const activeContents = useMemo(
    () =>
      contents.filter(
        (content) => content.isActive || entityId(content) === form.contentId,
      ),
    [contents, form.contentId],
  );

  const setFieldValue = (key: string, value: string) => {
    setForm((current) => ({
      ...current,
      fieldValues: { ...current.fieldValues, [key]: value },
    }));
  };

  const submit = async () => {
    const contentColumn = editableColumns.find(
      (column) =>
        getColumnSemanticField(column, template) === "content_name",
    );
    const assigneeColumn = editableColumns.find(
      (column) => getColumnSemanticField(column, template) === "assignee",
    );

    if (contentColumn && isTemplateColumnRequired(contentColumn) && !form.contentId) {
      toast.error("Vui lòng chọn nội dung công việc.");
      return;
    }
    if (assigneeColumn && isTemplateColumnRequired(assigneeColumn) && !form.assigneeId) {
      toast.error("Vui lòng chọn người thực hiện.");
      return;
    }
    if (!form.contentId) {
      toast.error(
        "Thiếu nội dung công việc. Hãy gán ROLE NHẬP cột “Nội dung công việc” cho role của bạn.",
      );
      return;
    }
    if (!template || !dialogColumns.length) {
      toast.error(
        "Không có cột nào thuộc ROLE NHẬP của bạn trên biểu mẫu. Kiểm tra cấu hình ROLE NHẬP.",
      );
      return;
    }

    for (const column of editableColumns) {
      const semantic = getColumnSemanticField(column, template);
      if (
        semantic === "content_name" ||
        semantic === "assignee" ||
        isAutoIncrementLike(column) ||
        !isTemplateColumnRequired(column)
      ) {
        continue;
      }
      if (!form.fieldValues[column.key]?.trim()) {
        toast.error(`Vui lòng nhập “${column.title}”.`);
        return;
      }
    }

    const title =
      readFieldValueBySemantic(template, form.fieldValues, "task_title") ||
      firstTextFieldValue(dialogColumns, form.fieldValues, template) ||
      "Nhiệm vụ mới";
    const dueDateColumn = editableColumns.find(
      (column) => getColumnSemanticField(column, template) === "due_date",
    );
    const dueDateRaw = readFieldValueBySemantic(
      template,
      form.fieldValues,
      "due_date",
    );
    const dueDateFromForm = dueDateColumn
      ? parseTemporalForApi(dueDateColumn, dueDateRaw)
      : toIsoDate(dueDateRaw) || undefined;
    if (
      dueDateColumn &&
      isTemplateColumnRequired(dueDateColumn) &&
      !dueDateFromForm
    ) {
      toast.error("Vui lòng chọn thời hạn hoàn thành.");
      return;
    }
    // Chỉ lưu ngày khi user nhập, hoặc giữ ngày cũ khi sửa (không tự gán hôm nay).
    const dueDate =
      dueDateFromForm ||
      (edit?.dueDate
        ? dueDateColumn
          ? parseTemporalForApi(dueDateColumn, String(edit.dueDate))
          : toIsoDate(String(edit.dueDate))
        : undefined) ||
      undefined;
    const reportDueColumn = dialogColumns.find(
      (column) =>
        getColumnSemanticField(column, template) === "report_due_date",
    );
    const reportDueRaw = readFieldValueBySemantic(
      template,
      form.fieldValues,
      "report_due_date",
    );
    const reportDueDate = reportDueColumn
      ? parseTemporalForApi(reportDueColumn, reportDueRaw)
      : toIsoDate(reportDueRaw) || undefined;
    const product =
      readFieldValueBySemantic(template, form.fieldValues, "product") || "-";
    const standardRaw = readFieldValueBySemantic(
      template,
      form.fieldValues,
      "standard_score",
    );
    const standardScore = standardRaw.trim()
      ? Number(standardRaw)
      : (edit?.standardScore ?? 0);
    if (!Number.isFinite(standardScore) || standardScore < 0) {
      toast.error("Điểm chuẩn không hợp lệ.");
      return;
    }

    const selectedContent = contents.find(
      (item) => entityId(item) === form.contentId,
    );
    const selectedUser = users.find(
      (item) => entityId(item) === form.assigneeId,
    );
    const numericFieldValues: Record<string, string | number> = {
      ...(edit?.fieldValues ?? {}),
    };
    for (const column of dialogColumns) {
      const raw = form.fieldValues[column.key]?.trim() ?? "";
      if (!raw) {
        delete numericFieldValues[column.key];
        continue;
      }
      numericFieldValues[column.key] = isNumericTemplateColumn(
        column,
        template,
      )
        ? Number(raw)
        : raw;
      if (
        isNumericTemplateColumn(column, template) &&
        !Number.isFinite(Number(raw))
      ) {
        toast.error(`“${column.title}” phải là số.`);
        return;
      }
    }

    const payload: TaskAssignmentInput = {
      contentId: form.contentId,
      title,
      description: edit?.description ?? "",
      assigneeId: form.assigneeId || undefined,
      dueDate,
      reportDueDate,
      product,
      actualProduct: edit?.actualProduct ?? "",
      standardScore,
      status: form.status,
      fieldValues: numericFieldValues,
    };

    const valueSource: TaskValueSource = {
      contentName: selectedContent?.name ?? "",
      assigneeName:
        selectedUser?.fullName?.trim() ||
        selectedUser?.username ||
        (typeof edit?.assigneeId === "object" && edit?.assigneeId
          ? edit.assigneeId.fullName || edit.assigneeId.username
          : "") ||
        "",
      title: payload.title,
      description: payload.description ?? "",
      dueDate: payload.dueDate,
      reportDueDate: payload.reportDueDate,
      product: payload.product,
      actualProduct: payload.actualProduct,
      // Chỉ đưa điểm chuẩn vào fieldValues khi user đã nhập.
      standardScore: standardRaw.trim() ? standardScore : undefined,
      note: edit?.note,
    };
    payload.fieldValues = buildFieldValuesFromTemplate(
      template,
      valueSource,
      numericFieldValues,
    );

    setSaving(true);
    try {
      if (edit) await updateTaskAssignment(entityId(edit), payload);
      else await createTaskAssignment(payload);
      toast.success(edit ? "Đã cập nhật nhiệm vụ." : "Đã giao nhiệm vụ.");
      onOpenChange(false);
      onSuccess();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không lưu được nhiệm vụ."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {edit ? "Cập nhật nhiệm vụ" : "Giao nhiệm vụ KPI"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-2">
          <FormSection title="Thông tin giao nhiệm vụ">
            {!template ? (
              <p className="text-sm text-muted-foreground">
                Hãy chọn biểu mẫu trước khi giao nhiệm vụ.
              </p>
            ) : !dialogColumns.length ? (
              <p className="text-sm text-muted-foreground">
                Không có cột nào gán ROLE NHẬP khớp role hiện tại (
                {userRoleCodes.join(", ") || "không có role"}). Chỉ hiện field
                đúng role - hãy cấu hình lại ROLE NHẬP ở tab Cấu hình biểu mẫu.
              </p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {dialogColumns.map((column) => {
                  const semantic = getColumnSemanticField(column, template);
                  const label = column.title;
                  const fieldRequired = isTemplateColumnRequired(column);
                  const editable = canEditDialogColumn(
                    column,
                    userRoleCodes,
                  );
                  // Chỉ hiện field đúng ROLE NHẬP (đã lọc ở dialogColumns)

                  if (semantic === "content_name") {
                    return (
                      <Field key={column.id} label={label} required={fieldRequired}>
                        <Select
                          value={form.contentId}
                          onValueChange={(value) =>
                            setForm((current) => ({
                              ...current,
                              contentId: value,
                            }))
                          }
                          disabled={!editable && !!edit}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Chọn nội dung" />
                          </SelectTrigger>
                          <SelectContent>
                            {activeContents.map((content) => (
                              <SelectItem
                                key={entityId(content)}
                                value={entityId(content)}
                              >
                                {content.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                    );
                  }

                  if (semantic === "assignee") {
                    return (
                      <Field key={column.id} label={label} required={fieldRequired}>
                        <Select
                          value={form.assigneeId}
                          onValueChange={(value) =>
                            setForm((current) => ({
                              ...current,
                              assigneeId: value,
                            }))
                          }
                          disabled={!editable && !!edit}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Chọn người thực hiện" />
                          </SelectTrigger>
                          <SelectContent>
                            {users.map((user) => (
                              <SelectItem
                                key={entityId(user)}
                                value={entityId(user)}
                              >
                                {user.fullName || user.username} ({user.username})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                    );
                  }

                  const temporalKind = getTemporalInputKind(column);
                  if (temporalKind) {
                    const inputType =
                      temporalKind === "datetime"
                        ? "datetime-local"
                        : temporalKind;
                    return (
                      <Field
                        key={column.id}
                        label={label}
                        required={fieldRequired}
                      >
                        <Input
                          type={inputType}
                          value={temporalInputValue(
                            column,
                            form.fieldValues[column.key] ?? "",
                          )}
                          onChange={(event) =>
                            setFieldValue(column.key, event.target.value)
                          }
                          disabled={!editable && !!edit}
                        />
                      </Field>
                    );
                  }

                  if (isNumericTemplateColumn(column, template)) {
                    return (
                      <Field key={column.id} label={label} required={fieldRequired}>
                        <Input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          className="text-right"
                          value={form.fieldValues[column.key] ?? ""}
                          onChange={(event) =>
                            setFieldValue(column.key, event.target.value)
                          }
                          disabled={!editable && !!edit}
                        />
                      </Field>
                    );
                  }

                  return (
                    <Field
                      key={column.id}
                      label={label}
                      required={fieldRequired}
                      className={
                        semantic === "task_title" ? "sm:col-span-2" : undefined
                      }
                    >
                      {semantic === "task_title" ? (
                        <Textarea
                          value={form.fieldValues[column.key] ?? ""}
                          onChange={(event) =>
                            setFieldValue(column.key, event.target.value)
                          }
                          placeholder={`Nhập ${label.toLowerCase()}...`}
                          disabled={!editable && !!edit}
                        />
                      ) : (
                        <Input
                          value={form.fieldValues[column.key] ?? ""}
                          onChange={(event) =>
                            setFieldValue(column.key, event.target.value)
                          }
                          disabled={!editable && !!edit}
                        />
                      )}
                    </Field>
                  );
                })}

                {!dialogColumns.some(
                  (column) =>
                    getColumnSemanticField(column, template) === "content_name",
                ) &&
                  (userRoleCodes.includes("UNIT_ADMIN") ||
                    userRoleCodes.includes("MANAGER") ||
                    userRoleCodes.includes("SUPER_ADMIN")) ? (
                  <Field label="Nội dung công việc">
                    <Select
                      value={form.contentId}
                      onValueChange={(value) =>
                        setForm((current) => ({
                          ...current,
                          contentId: value,
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Chọn nội dung" />
                      </SelectTrigger>
                      <SelectContent>
                        {activeContents.map((content) => (
                          <SelectItem
                            key={entityId(content)}
                            value={entityId(content)}
                          >
                            {content.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                ) : null}

                {!dialogColumns.some(
                  (column) =>
                    getColumnSemanticField(column, template) === "assignee",
                ) &&
                  (userRoleCodes.includes("UNIT_ADMIN") ||
                    userRoleCodes.includes("MANAGER")) ? (
                  <Field label="Người thực hiện">
                    <Select
                      value={form.assigneeId}
                      onValueChange={(value) =>
                        setForm((current) => ({
                          ...current,
                          assigneeId: value,
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Chọn người thực hiện" />
                      </SelectTrigger>
                      <SelectContent>
                        {users.map((user) => (
                          <SelectItem
                            key={entityId(user)}
                            value={entityId(user)}
                          >
                            {user.fullName || user.username} ({user.username})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                ) : null}

                <Field label="Trạng thái">
                  <Select
                    value={form.status}
                    onValueChange={(value) =>
                      setForm((current) => ({
                        ...current,
                        status: value as TaskStatus,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(TASK_STATUSES).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            )}
          </FormSection>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Đang lưu..." : edit ? "Cập nhật" : "Giao nhiệm vụ"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function isAutoIncrementLike(column: { dataType: string }) {
  return column.dataType === "auto_increment";
}

function firstTextFieldValue(
  columns: { key: string; dataType: string }[],
  fieldValues: Record<string, string>,
  template: KpiTemplate,
): string {
  for (const column of columns) {
    const full = template.columns.find((item) => item.key === column.key);
    if (!full) continue;
    const semantic = getColumnSemanticField(full, template);
    if (semantic === "content_name" || semantic === "assignee") continue;
    if (column.dataType === "number" || column.dataType === "auto_increment") {
      continue;
    }
    const value = fieldValues[column.key]?.trim();
    if (value) return value;
  }
  return "";
}

function toIsoDate(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const slash = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    const [, day, month, year] = slash;
    return `${year}-${month!.padStart(2, "0")}-${day!.padStart(2, "0")}`;
  }
  const parsed = dayjs(trimmed);
  return parsed.isValid() ? parsed.format("YYYY-MM-DD") : "";
}

function FormSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-lg border p-4">
      <div className="flex items-center gap-2 font-semibold">
        <Layers3 className="h-4 w-4 text-primary" />
        {title}
      </div>
      {children}
    </section>
  );
}
