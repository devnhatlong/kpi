"use client";

import { useMemo, useState } from "react";
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
import { entityId } from "@/features/organization/types";
import { getApiErrorMessage } from "@/lib/api-client";
import {
  createTaskAssignment,
  createWorkContent,
  createWorkGroup,
  deleteTaskAssignment,
  deleteWorkContent,
  deleteWorkGroup,
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
  type TaskAssignment,
  type TaskAssignmentInput,
  type TaskStatus,
  type WorkContent,
  type WorkGroup,
} from "../types";
import { TaskAssignmentGrid } from "./task-assignment-grid";
import { TemplateConfigView } from "./template-config-view";

type TabValue = "tasks" | "contents" | "groups" | "template";

function groupOf(content: WorkContent | null): WorkGroup | null {
  return !content || typeof content.groupId === "string"
    ? null
    : content.groupId;
}

function numberOrUndefined(value: string): number | undefined {
  if (value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function Field({
  label,
  children,
  required,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label>
        {label}
        {required ? <span className="ml-1 text-destructive">*</span> : null}
      </Label>
      {children}
    </div>
  );
}

export function KpiConfigView() {
  const [tab, setTab] = useState<TabValue>("tasks");
  const groupsQuery = useSWR(kpiConfigKeys.groups, fetchWorkGroups);
  const contentsQuery = useSWR(kpiConfigKeys.contents, fetchWorkContents);
  const tasksQuery = useSWR(kpiConfigKeys.tasks, fetchTaskAssignments);
  const usersQuery = useSWR(["organization", "users", "all"], fetchUsers);
  const rolesQuery = useSWR(["organization", "roles", "all"], fetchRoles);

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

  const groups = groupsQuery.data ?? [];
  const contents = contentsQuery.data ?? [];
  const tasks = tasksQuery.data ?? [];
  const users = usersQuery.data?.filter((user) => user.isActive) ?? [];
  const roles = rolesQuery.data?.filter((role) => role.isActive) ?? [];

  const openCreate = () => {
    if (tab === "template") return;
    if (tab === "groups") {
      setEditingGroup(null);
      setGroupDialog(true);
    } else if (tab === "contents") {
      if (!groups.length) {
        toast.error("Hãy tạo nhóm công việc trước.");
        return;
      }
      setEditingContent(null);
      setContentDialog(true);
    } else {
      if (!contents.length) {
        toast.error("Hãy tạo nội dung công việc trước.");
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
        await groupsQuery.mutate();
      } else if (kind === "contents") {
        await deleteWorkContent(id);
        await contentsQuery.mutate();
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
        onValueChange={(value) => setTab(value as TabValue)}
        className="flex min-h-0 flex-1 flex-col"
      >
        <TabsList className="h-auto w-fit flex-wrap">
          <TabsTrigger value="tasks">Nhiệm vụ được giao</TabsTrigger>
          <TabsTrigger value="contents">Nội dung công việc</TabsTrigger>
          <TabsTrigger value="groups">Nhóm công việc</TabsTrigger>
          <TabsTrigger value="template">Cấu hình biểu mẫu</TabsTrigger>
        </TabsList>

        <TabsContent value="tasks" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              <TaskAssignmentGrid
                groups={groups}
                contents={contents}
                tasks={tasks}
                loading={tasksQuery.isLoading}
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
                onSaved={() => void tasksQuery.mutate()}
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
                      <TableHead>Nội dung công việc</TableHead>
                      <TableHead>Nhóm công việc</TableHead>
                      <TableHead className="w-28">Trạng thái</TableHead>
                      <TableHead className="w-24 text-right">
                        Thao tác
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contentsQuery.isLoading ? (
                      <EmptyRow colSpan={5} text="Đang tải nội dung..." />
                    ) : contents.length === 0 ? (
                      <EmptyRow
                        colSpan={5}
                        text="Chưa có nội dung công việc."
                      />
                    ) : (
                      contents.map((content) => (
                        <TableRow key={entityId(content)}>
                          <TableCell>
                            <Badge variant="outline" className="font-mono">
                              {content.code}
                            </Badge>
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
                      <TableHead>Nhóm công việc</TableHead>
                      <TableHead className="w-24 text-center">Thứ tự</TableHead>
                      <TableHead className="w-28">Trạng thái</TableHead>
                      <TableHead className="w-24 text-right">
                        Thao tác
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {groupsQuery.isLoading ? (
                      <EmptyRow colSpan={5} text="Đang tải nhóm..." />
                    ) : groups.length === 0 ? (
                      <EmptyRow colSpan={5} text="Chưa có nhóm công việc." />
                    ) : (
                      groups.map((group) => (
                        <TableRow key={entityId(group)}>
                          <TableCell>
                            <Badge variant="outline" className="font-mono">
                              {group.code}
                            </Badge>
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
                            <RowActions
                              onEdit={() => {
                                setEditingGroup(group);
                                setGroupDialog(true);
                              }}
                              onDelete={() =>
                                remove("groups", entityId(group), group.name)
                              }
                            />
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
          <TemplateConfigView contents={contents} roles={roles} users={users} />
        </TabsContent>
      </Tabs>

      {groupDialog ? (
        <GroupDialog
          open
          onOpenChange={setGroupDialog}
          edit={editingGroup}
          onSuccess={() => groupsQuery.mutate()}
        />
      ) : null}
      {contentDialog ? (
        <ContentDialog
          open
          onOpenChange={setContentDialog}
          edit={editingContent}
          groups={groups}
          onSuccess={async () => {
            await contentsQuery.mutate();
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
          contents={contents}
          users={users}
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
  onSuccess: () => void;
};

function GroupDialog({
  open,
  onOpenChange,
  edit,
  onSuccess,
}: GroupDialogProps) {
  const [code, setCode] = useState(edit?.code ?? "");
  const [name, setName] = useState(edit?.name ?? "");
  const [description, setDescription] = useState(edit?.description ?? "");
  const [sortOrder, setSortOrder] = useState(String(edit?.sortOrder ?? 0));
  const [isActive, setIsActive] = useState(edit?.isActive ?? true);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!code.trim() || !name.trim()) {
      toast.error("Vui lòng nhập mã và tên nhóm công việc.");
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
            Huỷ
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
  onSuccess: () => void;
};

function ContentDialog({
  open,
  onOpenChange,
  edit,
  groups,
  onSuccess,
}: ContentDialogProps) {
  const [code, setCode] = useState(edit?.code ?? "");
  const [name, setName] = useState(edit?.name ?? "");
  const [groupId, setGroupId] = useState(
    edit ? entityId(edit.groupId) : entityId(groups[0]),
  );
  const [description, setDescription] = useState(edit?.description ?? "");
  const [sortOrder, setSortOrder] = useState(String(edit?.sortOrder ?? 0));
  const [isActive, setIsActive] = useState(edit?.isActive ?? true);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!code.trim() || !name.trim() || !groupId) {
      toast.error("Vui lòng nhập mã, tên và chọn nhóm công việc.");
      return;
    }
    setSaving(true);
    try {
      const input = {
        code: code.trim().toUpperCase(),
        name: name.trim(),
        groupId,
        description: description.trim(),
        sortOrder: Number(sortOrder) || 0,
        isActive,
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
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Mã nội dung" required>
              <Input
                value={code}
                onChange={(event) => setCode(event.target.value)}
              />
            </Field>
            <Field label="Nhóm công việc" required>
              <Select value={groupId} onValueChange={setGroupId}>
                <SelectTrigger>
                  <SelectValue placeholder="Chọn nhóm" />
                </SelectTrigger>
                <SelectContent>
                  {groups.map((group) => (
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
            Huỷ
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Đang lưu..." : "Lưu"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type TaskFormState = {
  contentId: string;
  title: string;
  description: string;
  assigneeId: string;
  dueDate: string;
  reportDueDate: string;
  product: string;
  actualProduct: string;
  standardScore: string;
  status: TaskStatus;
  selfProgressPercent: string;
  selfProgressScore: string;
  selfQualityPercent: string;
  selfQualityScore: string;
  proposedAdjustment: string;
  proposedAdjustmentReason: string;
  appraisalProgressPercent: string;
  appraisalProgressScore: string;
  appraisalQualityPercent: string;
  appraisalQualityScore: string;
  note: string;
};

const emptyTaskForm: TaskFormState = {
  contentId: "",
  title: "",
  description: "",
  assigneeId: "",
  dueDate: "",
  reportDueDate: "",
  product: "",
  actualProduct: "",
  standardScore: "10",
  status: "ASSIGNED",
  selfProgressPercent: "",
  selfProgressScore: "",
  selfQualityPercent: "",
  selfQualityScore: "",
  proposedAdjustment: "",
  proposedAdjustmentReason: "",
  appraisalProgressPercent: "",
  appraisalProgressScore: "",
  appraisalQualityPercent: "",
  appraisalQualityScore: "",
  note: "",
};

function taskFormFrom(
  edit: TaskAssignment | null,
  contents: WorkContent[],
  initialContent: WorkContent | null,
): TaskFormState {
  if (!edit) {
    return {
      ...emptyTaskForm,
      contentId:
        entityId(initialContent) ||
        entityId(contents.find((content) => content.isActive)),
    };
  }
  return {
    contentId: entityId(edit.contentId),
    title: edit.title,
    description: edit.description ?? "",
    assigneeId: entityId(edit.assigneeId),
    dueDate: dayjs(edit.dueDate).format("YYYY-MM-DD"),
    reportDueDate: edit.reportDueDate
      ? dayjs(edit.reportDueDate).format("YYYY-MM-DD")
      : "",
    product: edit.product,
    actualProduct: edit.actualProduct ?? "",
    standardScore: String(edit.standardScore),
    status: edit.status,
    selfProgressPercent: String(edit.selfProgressPercent ?? ""),
    selfProgressScore: String(edit.selfProgressScore ?? ""),
    selfQualityPercent: String(edit.selfQualityPercent ?? ""),
    selfQualityScore: String(edit.selfQualityScore ?? ""),
    proposedAdjustment: String(edit.proposedAdjustment ?? ""),
    proposedAdjustmentReason: edit.proposedAdjustmentReason ?? "",
    appraisalProgressPercent: String(edit.appraisalProgressPercent ?? ""),
    appraisalProgressScore: String(edit.appraisalProgressScore ?? ""),
    appraisalQualityPercent: String(edit.appraisalQualityPercent ?? ""),
    appraisalQualityScore: String(edit.appraisalQualityScore ?? ""),
    note: edit.note ?? "",
  };
}

type TaskDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  edit: TaskAssignment | null;
  initialContent: WorkContent | null;
  contents: WorkContent[];
  users: Awaited<ReturnType<typeof fetchUsers>>;
  onSuccess: () => void;
};

function TaskDialog({
  open,
  onOpenChange,
  edit,
  initialContent,
  contents,
  users,
  onSuccess,
}: TaskDialogProps) {
  const [form, setForm] = useState<TaskFormState>(() =>
    taskFormFrom(edit, contents, initialContent),
  );
  const [saving, setSaving] = useState(false);
  const activeContents = useMemo(
    () =>
      contents.filter(
        (content) => content.isActive || entityId(content) === form.contentId,
      ),
    [contents, form.contentId],
  );

  const set = <K extends keyof TaskFormState>(
    key: K,
    value: TaskFormState[K],
  ) => setForm((current) => ({ ...current, [key]: value }));

  const submit = async () => {
    if (
      !form.contentId ||
      !form.title.trim() ||
      !form.assigneeId ||
      !form.dueDate ||
      !form.product.trim()
    ) {
      toast.error(
        "Vui lòng nhập đủ nội dung, nhiệm vụ, người thực hiện, thời hạn và sản phẩm.",
      );
      return;
    }
    const standardScore = Number(form.standardScore);
    if (!Number.isFinite(standardScore) || standardScore < 0) {
      toast.error("Điểm chuẩn không hợp lệ.");
      return;
    }
    const payload: TaskAssignmentInput = {
      contentId: form.contentId,
      title: form.title.trim(),
      description: form.description.trim(),
      assigneeId: form.assigneeId,
      dueDate: form.dueDate,
      reportDueDate: form.reportDueDate || undefined,
      product: form.product.trim(),
      actualProduct: form.actualProduct.trim(),
      standardScore,
      status: form.status,
      selfProgressPercent: numberOrUndefined(form.selfProgressPercent),
      selfProgressScore: numberOrUndefined(form.selfProgressScore),
      selfQualityPercent: numberOrUndefined(form.selfQualityPercent),
      selfQualityScore: numberOrUndefined(form.selfQualityScore),
      proposedAdjustment: numberOrUndefined(form.proposedAdjustment),
      proposedAdjustmentReason: form.proposedAdjustmentReason.trim(),
      appraisalProgressPercent: numberOrUndefined(
        form.appraisalProgressPercent,
      ),
      appraisalProgressScore: numberOrUndefined(form.appraisalProgressScore),
      appraisalQualityPercent: numberOrUndefined(form.appraisalQualityPercent),
      appraisalQualityScore: numberOrUndefined(form.appraisalQualityScore),
      note: form.note.trim(),
    };
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
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            {edit ? "Cập nhật nhiệm vụ" : "Giao nhiệm vụ KPI"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-2">
          <FormSection title="Thông tin giao nhiệm vụ">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nội dung công việc" required>
                <Select
                  value={form.contentId}
                  onValueChange={(value) => set("contentId", value)}
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
                        {content.code} - {content.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Trạng thái">
                <Select
                  value={form.status}
                  onValueChange={(value) => set("status", value as TaskStatus)}
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
            <Field label="Nhiệm vụ cụ thể" required>
              <Textarea
                value={form.title}
                onChange={(event) => set("title", event.target.value)}
                placeholder="Nhập nhiệm vụ cần thực hiện..."
              />
            </Field>
            <Field label="Mô tả/yêu cầu">
              <Textarea
                value={form.description}
                onChange={(event) => set("description", event.target.value)}
              />
            </Field>
            <Field label="Người thực hiện" required>
              <Select
                value={form.assigneeId}
                onValueChange={(value) => set("assigneeId", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chọn người thực hiện" />
                </SelectTrigger>
                <SelectContent>
                  {users.map((user) => (
                    <SelectItem key={entityId(user)} value={entityId(user)}>
                      {user.fullName || user.username} ({user.username})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Thời hạn hoàn thành" required>
                <Input
                  type="date"
                  value={form.dueDate}
                  onChange={(event) => set("dueDate", event.target.value)}
                />
              </Field>
              <Field label="Thời hạn báo cáo">
                <Input
                  type="date"
                  value={form.reportDueDate}
                  onChange={(event) => set("reportDueDate", event.target.value)}
                />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Sản phẩm dự kiến" required>
                <Input
                  value={form.product}
                  onChange={(event) => set("product", event.target.value)}
                />
              </Field>
              <Field label="Sản phẩm sau khi thực hiện">
                <Input
                  value={form.actualProduct}
                  onChange={(event) => set("actualProduct", event.target.value)}
                />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
              <Field label="Điểm chuẩn" required>
                <Input
                  type="number"
                  min={0}
                  value={form.standardScore}
                  onChange={(event) => set("standardScore", event.target.value)}
                />
              </Field>
              <div />
            </div>
          </FormSection>

          {edit ? (
            <>
              <FormSection title="Điểm tự chấm">
                <AssessmentFields
                  progressPercent={form.selfProgressPercent}
                  progressScore={form.selfProgressScore}
                  qualityPercent={form.selfQualityPercent}
                  qualityScore={form.selfQualityScore}
                  onChange={(key, value) => set(key, value)}
                  prefix="self"
                />
              </FormSection>

              <FormSection title="Đề nghị cộng/trừ điểm của các phòng">
                <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
                  <Field label="Điểm cộng/trừ">
                    <Input
                      type="number"
                      value={form.proposedAdjustment}
                      onChange={(event) =>
                        set("proposedAdjustment", event.target.value)
                      }
                      placeholder="VD: -1 hoặc 2"
                    />
                  </Field>
                  <Field label="Lý do đề nghị">
                    <Textarea
                      value={form.proposedAdjustmentReason}
                      onChange={(event) =>
                        set("proposedAdjustmentReason", event.target.value)
                      }
                    />
                  </Field>
                </div>
              </FormSection>

              <FormSection title="Kết quả thẩm định của PV01 (Chỉ huy)">
                <AssessmentFields
                  progressPercent={form.appraisalProgressPercent}
                  progressScore={form.appraisalProgressScore}
                  qualityPercent={form.appraisalQualityPercent}
                  qualityScore={form.appraisalQualityScore}
                  onChange={(key, value) => set(key, value)}
                  prefix="appraisal"
                />
                <Field label="Ghi chú">
                  <Textarea
                    value={form.note}
                    onChange={(event) => set("note", event.target.value)}
                  />
                </Field>
              </FormSection>
            </>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Huỷ
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Đang lưu..." : edit ? "Cập nhật" : "Giao nhiệm vụ"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
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

type AssessmentKey =
  | "selfProgressPercent"
  | "selfProgressScore"
  | "selfQualityPercent"
  | "selfQualityScore"
  | "appraisalProgressPercent"
  | "appraisalProgressScore"
  | "appraisalQualityPercent"
  | "appraisalQualityScore";

function AssessmentFields({
  progressPercent,
  progressScore,
  qualityPercent,
  qualityScore,
  onChange,
  prefix,
}: {
  progressPercent: string;
  progressScore: string;
  qualityPercent: string;
  qualityScore: string;
  onChange: (key: AssessmentKey, value: string) => void;
  prefix: "self" | "appraisal";
}) {
  const key = (suffix: string) => `${prefix}${suffix}` as AssessmentKey;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Field label="Tiến độ hoàn thành %">
        <Input
          type="number"
          min={0}
          max={100}
          value={progressPercent}
          onChange={(event) =>
            onChange(key("ProgressPercent"), event.target.value)
          }
        />
      </Field>
      <Field label="Điểm tiến độ">
        <Input
          type="number"
          min={0}
          value={progressScore}
          onChange={(event) =>
            onChange(key("ProgressScore"), event.target.value)
          }
        />
      </Field>
      <Field label="Chất lượng hoàn thành %">
        <Input
          type="number"
          min={0}
          max={100}
          value={qualityPercent}
          onChange={(event) =>
            onChange(key("QualityPercent"), event.target.value)
          }
        />
      </Field>
      <Field label="Điểm chất lượng">
        <Input
          type="number"
          min={0}
          value={qualityScore}
          onChange={(event) =>
            onChange(key("QualityScore"), event.target.value)
          }
        />
      </Field>
    </div>
  );
}
