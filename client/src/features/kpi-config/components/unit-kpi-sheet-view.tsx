"use client";

import { useMemo, useState } from "react";
import { getDefaultDueDate, getServerDayjs } from "@/lib/server-time";
import { Plus } from "lucide-react";
import useSWR from "swr";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Textarea } from "@/components/ui/textarea";
import { fetchUsers } from "@/features/organization/api";
import { entityId } from "@/features/organization/types";
import { getApiErrorMessage } from "@/lib/api-client";
import {
  assignTaskTarget,
  createKpiPeriod,
  createSheetTask,
  createUnitKpiSheet,
  fetchChildDepartments,
  fetchKpiPeriods,
  fetchKpiTemplates,
  fetchMasterForms,
  fetchSheetTasks,
  fetchUnitKpiSheets,
  fetchWorkContents,
  fetchWorkGroups,
  kpiConfigKeys,
} from "../api";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { MASTER_FORM_STATUSES, type TaskAssignment, type TaskOrigin, type UnitKpiSheet, type WorkContent } from "../types";
import { useWorkingUnit } from "../use-working-unit";
import { TaskAssignmentGrid } from "./task-assignment-grid";
import { WorkingUnitSelect } from "./working-unit-select";

type SourceFilter = "all" | "province" | "handoff" | "own";

function matchSource(task: TaskAssignment, filter: SourceFilter): boolean {
  const origin = (task.origin ?? "OWN") as TaskOrigin;
  if (filter === "all") return true;
  if (filter === "province") {
    return origin === "FROM_PROVINCE" || Boolean(task.sourceMasterFormId);
  }
  if (filter === "handoff") return origin === "FROM_HANDOFF";
  return origin === "OWN" || origin === "FROM_PARENT";
}

export function UnitKpiSheetView() {
  const {
    workingDepartmentId,
    setWorkingDepartmentId,
    scopedOptions,
  } = useWorkingUnit();

  const { data: periods = [], mutate: mutatePeriods } = useSWR(
    kpiConfigKeys.periods,
    fetchKpiPeriods,
  );
  const { data: templates = [] } = useSWR(
    kpiConfigKeys.templates,
    fetchKpiTemplates,
  );
  const { data: groups = [] } = useSWR(kpiConfigKeys.groups, fetchWorkGroups);
  const { data: contents = [] } = useSWR(
    kpiConfigKeys.contents,
    fetchWorkContents,
  );
  const { data: users = [] } = useSWR("users-for-kpi-assign", fetchUsers);

  const sheetsKey = workingDepartmentId
    ? [...kpiConfigKeys.sheets, workingDepartmentId]
    : null;
  const { data: sheets = [], mutate: mutateSheets } = useSWR(sheetsKey, () =>
    fetchUnitKpiSheets({ departmentId: workingDepartmentId }),
  );

  const [selectedSheetId, setSelectedSheetId] = useState("");
  const selectedSheet =
    sheets.find((s) => entityId(s) === selectedSheetId) ?? sheets[0] ?? null;
  const activeSheetId = selectedSheet ? entityId(selectedSheet) : "";

  const sheetTemplateId = selectedSheet
    ? typeof selectedSheet.templateId === "string"
      ? selectedSheet.templateId
      : entityId(selectedSheet.templateId)
    : "";

  const sheetTemplate =
    templates.find((t) => entityId(t) === sheetTemplateId) ?? null;

  const templateContents = useMemo(() => {
    if (!sheetTemplate) return [];
    const included = (sheetTemplate.includedContentIds ?? []).map(String);
    // Rỗng = không cho chọn nội dung nào (Super Admin phải tick trong biểu mẫu).
    if (!included.length) return [];
    const set = new Set(included);
    return contents.filter((c) => c.isActive && set.has(entityId(c)));
  }, [contents, sheetTemplate]);

  const {
    data: tasks = [],
    mutate: mutateTasks,
    isLoading: tasksLoading,
  } = useSWR(activeSheetId ? ["sheet-tasks", activeSheetId] : null, () =>
    fetchSheetTasks(activeSheetId),
  );

  const { data: publishedMasters = [] } = useSWR(
    kpiConfigKeys.masterForms,
    fetchMasterForms,
  );

  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const filteredTasks = useMemo(
    () => tasks.filter((t) => matchSource(t, sourceFilter)),
    [tasks, sourceFilter],
  );

  const { data: children = [] } = useSWR(
    workingDepartmentId ? ["kpi-children", workingDepartmentId] : null,
    () => fetchChildDepartments(workingDepartmentId),
  );

  const unitUsers = useMemo(
    () =>
      users.filter((u) => {
        if (!u.departmentId) return false;
        const deptId =
          typeof u.departmentId === "string"
            ? u.departmentId
            : entityId(u.departmentId);
        return deptId === workingDepartmentId;
      }),
    [users, workingDepartmentId],
  );

  const [createSheetOpen, setCreateSheetOpen] = useState(false);
  const [periodId, setPeriodId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [creatingSheet, setCreatingSheet] = useState(false);

  const [taskOpen, setTaskOpen] = useState(false);
  const [taskForm, setTaskForm] = useState({
    contentId: "",
    title: "",
    description: "",
    dueDate: "",
    product: "",
    standardScore: 10,
    note: "",
  });
  const [savingTask, setSavingTask] = useState(false);

  const [assignOpen, setAssignOpen] = useState(false);
  const [assignTask, setAssignTask] = useState<TaskAssignment | null>(null);
  const [assignMode, setAssignMode] = useState<"USER" | "CHILD_DEPARTMENT">(
    "USER",
  );
  const [assignUserId, setAssignUserId] = useState("");
  const [assignDeptId, setAssignDeptId] = useState("");
  const [assigning, setAssigning] = useState(false);

  async function openCreateTask(content?: WorkContent) {
    const dueDate = await getDefaultDueDate(14);
    setTaskForm({
      contentId: content ? entityId(content) : "",
      title: "",
      description: "",
      dueDate,
      product: "",
      standardScore: 10,
      note: "",
    });
    setTaskOpen(true);
  }

  function openAssign(task: TaskAssignment) {
    setAssignTask(task);
    setAssignMode(children.length ? "CHILD_DEPARTMENT" : "USER");
    setAssignUserId("");
    setAssignDeptId("");
    setAssignOpen(true);
  }

  async function handleCreateSheet() {
    if (!workingDepartmentId || !periodId || !templateId) {
      toast.error("Chọn kỳ và biểu mẫu.");
      return;
    }
    setCreatingSheet(true);
    try {
      const sheet = await createUnitKpiSheet({
        departmentId: workingDepartmentId,
        periodId,
        templateId,
      });
      await mutateSheets();
      setSelectedSheetId(entityId(sheet));
      setCreateSheetOpen(false);
      toast.success("Đã tạo Form KPI.");
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setCreatingSheet(false);
    }
  }

  async function handleCreateTask() {
    if (!activeSheetId) return;
    if (
      !taskForm.contentId ||
      !taskForm.title.trim() ||
      !taskForm.product.trim()
    ) {
      toast.error("Điền đủ nội dung, nhiệm vụ và sản phẩm.");
      return;
    }
    setSavingTask(true);
    try {
      await createSheetTask(activeSheetId, {
        ...taskForm,
        title: taskForm.title.trim(),
        product: taskForm.product.trim(),
      });
      await mutateTasks();
      setTaskOpen(false);
      toast.success("Đã thêm nhiệm vụ vào Form KPI.");
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setSavingTask(false);
    }
  }

  async function handleAssign() {
    if (!assignTask) return;
    setAssigning(true);
    try {
      await assignTaskTarget(entityId(assignTask), {
        targetType: assignMode,
        userId: assignMode === "USER" ? assignUserId : undefined,
        departmentId:
          assignMode === "CHILD_DEPARTMENT" ? assignDeptId : undefined,
      });
      await mutateTasks();
      setAssignOpen(false);
      toast.success(
        assignMode === "USER"
          ? "Đã giao cho cán bộ."
          : "Đã giao xuống đơn vị con.",
      );
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setAssigning(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Form KPI</h1>
          <p className="text-sm text-muted-foreground">
            KPI của đơn vị — hiển thị theo header/template Super Admin đã cấu
            hình.
          </p>
        </div>
        <WorkingUnitSelect
          workingDepartmentId={workingDepartmentId}
          scopedOptions={scopedOptions}
          onChange={setWorkingDepartmentId}
        />
      </div>

      {!workingDepartmentId ? (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">
            Chọn đơn vị làm việc để xem Form KPI.
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-base">Form theo kỳ</CardTitle>
              <Button
                size="sm"
                onClick={() => {
                  const firstTemplate = templates.find((t) => t.isActive);
                  setTemplateId(
                    firstTemplate ? entityId(firstTemplate) : "",
                  );
                  setPeriodId(periods[0] ? entityId(periods[0]) : "");
                  setCreateSheetOpen(true);
                }}
              >
                <Plus className="size-4" />
                Tạo Form KPI
              </Button>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-3">
              {sheets.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Chưa có Form KPI. Sau khi Super Admin phát hành, form phòng sẽ
                  tự xuất hiện; đội nhận khi phòng giao xuống.
                </p>
              ) : (
                <Select
                  value={activeSheetId}
                  onValueChange={setSelectedSheetId}
                >
                  <SelectTrigger className="w-[420px]">
                    <SelectValue placeholder="Chọn form" />
                  </SelectTrigger>
                  <SelectContent>
                    {sheets.map((sheet) => (
                      <SelectItem key={entityId(sheet)} value={entityId(sheet)}>
                        {sheetLabel(sheet)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {sheetTemplate ? (
                <p className="text-sm text-muted-foreground">
                  Template:{" "}
                  <span className="font-medium text-foreground">
                    {sheetTemplate.code} — {sheetTemplate.name}
                  </span>
                  {" · "}
                  {sheetTemplate.columns.filter((c) => c.visible).length} cột
                </p>
              ) : null}
            </CardContent>
          </Card>

          {publishedMasters.length > 0 ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  Mẫu KPI cấp tỉnh (xem)
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Manager / Unit Admin xem được mẫu đã phát hành (chỉ đọc). Phân
                  công thực hiện trên Form KPI đơn vị bên dưới.
                </p>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Mẫu</TableHead>
                      <TableHead>Chỉ tiêu</TableHead>
                      <TableHead>Trạng thái</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {publishedMasters.map((m) => (
                      <TableRow key={entityId(m)}>
                        <TableCell>
                          <div className="font-medium">{m.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {m.code}
                          </div>
                        </TableCell>
                        <TableCell>
                          <ul className="text-sm space-y-0.5">
                            {(m.indicators ?? []).slice(0, 4).map((ind) => (
                              <li key={ind.code}>
                                {ind.code}: {ind.name} ({ind.weight}%)
                              </li>
                            ))}
                            {(m.indicators?.length ?? 0) > 4 ? (
                              <li className="text-muted-foreground">
                                … +{(m.indicators?.length ?? 0) - 4} chỉ tiêu
                              </li>
                            ) : null}
                          </ul>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {MASTER_FORM_STATUSES[m.status] ?? m.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ) : null}

          {selectedSheet ? (
            <Card>
              <CardHeader className="pb-3 space-y-3">
                <CardTitle className="text-base">Bảng KPI theo header</CardTitle>
                <Tabs
                  value={sourceFilter}
                  onValueChange={(v) => setSourceFilter(v as SourceFilter)}
                >
                  <TabsList>
                    <TabsTrigger value="all">Tất cả</TabsTrigger>
                    <TabsTrigger value="province">
                      Cấp trên giao
                    </TabsTrigger>
                    <TabsTrigger value="handoff">Tiếp nhận</TabsTrigger>
                    <TabsTrigger value="own">Tự đăng ký / đội</TabsTrigger>
                  </TabsList>
                </Tabs>
              </CardHeader>
              <CardContent>
                <TaskAssignmentGrid
                  template={sheetTemplate}
                  groups={groups}
                  contents={templateContents}
                  tasks={filteredTasks}
                  loading={tasksLoading}
                  onAddTask={(content) => openCreateTask(content)}
                  onEditTask={(task) => openAssign(task)}
                  onDeleteTask={() => {
                    toast.message(
                      "Xoá nhiệm vụ Form 1 sẽ bổ sung sau — dùng giao dọc / tiếp nhận.",
                    );
                  }}
                  editAriaLabel="Giao nhiệm vụ"
                  showDelete={false}
                />
              </CardContent>
            </Card>
          ) : null}
        </>
      )}

      <Dialog open={createSheetOpen} onOpenChange={setCreateSheetOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tạo Form KPI</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Kỳ KPI</Label>
              <Select value={periodId} onValueChange={setPeriodId}>
                <SelectTrigger>
                  <SelectValue placeholder="Chọn kỳ" />
                </SelectTrigger>
                <SelectContent>
                  {periods.map((p) => (
                    <SelectItem key={entityId(p)} value={entityId(p)}>
                      {p.code} — {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!periods.length ? (
                <Button
                  type="button"
                  variant="link"
                  className="h-auto px-0 text-xs"
                  onClick={async () => {
                    try {
                      const now = await getServerDayjs();
                      const quarter = Math.floor(now.month() / 3) + 1;
                      const code = `${now.year()}-Q${quarter}`;
                      const startMonth = (quarter - 1) * 3;
                      const startDate = now
                        .month(startMonth)
                        .startOf("month")
                        .format("YYYY-MM-DD");
                      const endDate = now
                        .month(startMonth + 2)
                        .endOf("month")
                        .format("YYYY-MM-DD");
                      const created = await createKpiPeriod({
                        code,
                        name: `Quý ${quarter}/${now.year()}`,
                        startDate,
                        endDate,
                        isActive: true,
                      });
                      await mutatePeriods();
                      setPeriodId(entityId(created));
                      toast.success("Đã tạo kỳ KPI hiện tại.");
                    } catch (error) {
                      toast.error(getApiErrorMessage(error));
                    }
                  }}
                >
                  Tạo nhanh kỳ quý hiện tại
                </Button>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label>Biểu mẫu (header đã tạo)</Label>
              <Select value={templateId} onValueChange={setTemplateId}>
                <SelectTrigger>
                  <SelectValue placeholder="Chọn template" />
                </SelectTrigger>
                <SelectContent>
                  {templates
                    .filter((t) => t.isActive)
                    .map((t) => (
                      <SelectItem key={entityId(t)} value={entityId(t)}>
                        {t.code} — {t.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateSheetOpen(false)}>
              Huỷ
            </Button>
            <Button onClick={handleCreateSheet} disabled={creatingSheet}>
              Tạo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={taskOpen} onOpenChange={setTaskOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Thêm nhiệm vụ Form 1</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Nội dung công việc</Label>
              <Select
                value={taskForm.contentId}
                onValueChange={(v) =>
                  setTaskForm((s) => ({ ...s, contentId: v }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chọn nội dung" />
                </SelectTrigger>
                <SelectContent>
                  {templateContents.map((c) => (
                    <SelectItem key={entityId(c)} value={entityId(c)}>
                      {c.code} — {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Nhiệm vụ</Label>
              <Input
                value={taskForm.title}
                onChange={(e) =>
                  setTaskForm((s) => ({ ...s, title: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Mô tả</Label>
              <Textarea
                value={taskForm.description}
                onChange={(e) =>
                  setTaskForm((s) => ({ ...s, description: e.target.value }))
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Hạn hoàn thành</Label>
                <Input
                  type="date"
                  value={taskForm.dueDate}
                  onChange={(e) =>
                    setTaskForm((s) => ({ ...s, dueDate: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Điểm chuẩn</Label>
                <Input
                  type="number"
                  min={0}
                  value={taskForm.standardScore}
                  onChange={(e) =>
                    setTaskForm((s) => ({
                      ...s,
                      standardScore: Number(e.target.value) || 0,
                    }))
                  }
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Sản phẩm bàn giao</Label>
              <Input
                value={taskForm.product}
                onChange={(e) =>
                  setTaskForm((s) => ({ ...s, product: e.target.value }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTaskOpen(false)}>
              Huỷ
            </Button>
            <Button onClick={handleCreateTask} disabled={savingTask}>
              Lưu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Giao nhiệm vụ</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{assignTask?.title}</p>
            {children.length > 0 ? (
              <div className="space-y-2">
                <Label>Kiểu giao</Label>
                <Select
                  value={assignMode}
                  onValueChange={(v) =>
                    setAssignMode(v as "USER" | "CHILD_DEPARTMENT")
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CHILD_DEPARTMENT">
                      Giao xuống đơn vị con
                    </SelectItem>
                    <SelectItem value="USER">Giao cán bộ trong đơn vị</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            {assignMode === "USER" ? (
              <div className="space-y-2">
                <Label>Cán bộ</Label>
                <Select value={assignUserId} onValueChange={setAssignUserId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn cán bộ" />
                  </SelectTrigger>
                  <SelectContent>
                    {unitUsers.map((u) => (
                      <SelectItem key={entityId(u)} value={entityId(u)}>
                        {u.fullName || u.username}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Đơn vị con</Label>
                <Select value={assignDeptId} onValueChange={setAssignDeptId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn đội / đơn vị con" />
                  </SelectTrigger>
                  <SelectContent>
                    {children.map((d) => (
                      <SelectItem key={entityId(d)} value={entityId(d)}>
                        {d.code} — {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignOpen(false)}>
              Huỷ
            </Button>
            <Button onClick={handleAssign} disabled={assigning}>
              Xác nhận giao
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function sheetLabel(sheet: UnitKpiSheet): string {
  const period =
    typeof sheet.periodId === "string"
      ? sheet.periodId
      : `${sheet.periodId.code} — ${sheet.periodId.name}`;
  const template =
    typeof sheet.templateId === "string"
      ? ""
      : ` · ${sheet.templateId.code}`;
  return `${period}${template}`;
}
