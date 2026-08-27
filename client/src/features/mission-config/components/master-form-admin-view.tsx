"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Eye, Plus, Rocket, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { fetchDepartments } from "@/features/organization/api";
import { entityId } from "@/features/organization/types";
import { getApiErrorMessage } from "@/lib/api-client";
import {
  createMasterForm,
  deleteMasterForm,
  fetchMissionPeriods,
  fetchMissionTemplates,
  fetchMasterFormTracking,
  fetchMasterForms,
  missionConfigKeys,
  markMasterFormReady,
  publishMasterForm,
  setMasterFormStatus,
} from "../api";
import {
  MASTER_FORM_SCOPES,
  MASTER_FORM_STATUSES,
  type MissionIndicator,
  type MissionMasterForm,
  type MasterFormScope,
  type MasterFormStatus,
  type MasterFormTracking,
} from "../types";

function emptyIndicator(index: number): MissionIndicator {
  return {
    code: `MISSION-${String(index).padStart(2, "0")}`,
    name: "",
    weight: 0,
    description: "",
    criteria: "",
    unit: "",
    evidenceRequired: "",
    scoringMethod: "",
  };
}

export function MasterFormAdminView() {
  const { data: forms = [], mutate } = useSWR(
    missionConfigKeys.masterForms,
    fetchMasterForms,
  );
  const { data: periods = [] } = useSWR(
    missionConfigKeys.periods,
    fetchMissionPeriods,
  );
  const { data: templates = [] } = useSWR(
    missionConfigKeys.templates("SYSTEM"),
    () => fetchMissionTemplates("SYSTEM"),
  );
  const { data: departments = [] } = useSWR(
    "departments-for-master-form",
    fetchDepartments,
    { revalidateOnFocus: false },
  );

  const phongDepts = useMemo(
    () =>
      departments.filter((d) => {
        const level = d.levelId;
        if (!level || typeof level === "string") return false;
        return level.code === "PHONG";
      }),
    [departments],
  );
  const catDepts = useMemo(
    () =>
      departments.filter((d) => {
        const level = d.levelId;
        if (!level || typeof level === "string") return false;
        return level.code === "CAT";
      }),
    [departments],
  );

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tracking, setTracking] = useState<MasterFormTracking | null>(null);
  const [form, setForm] = useState({
    name: "",
    code: "",
    description: "",
    periodId: "",
    templateId: "",
    scopeType: "ALL_PHONG" as MasterFormScope,
    provinceDepartmentId: "",
    targetDepartmentIds: [] as string[],
    indicators: [emptyIndicator(1), emptyIndicator(2)] as MissionIndicator[],
  });

  const weightSum = form.indicators.reduce(
    (s, i) => s + Number(i.weight || 0),
    0,
  );

  async function handleCreate() {
    if (!form.name.trim() || !form.code.trim()) {
      toast.error("Nhập tên và mã form.");
      return;
    }
    if (!form.periodId || !form.templateId) {
      toast.error("Chọn kỳ và template cột.");
      return;
    }
    if (Math.abs(weightSum - 100) > 0.01) {
      toast.error(`Tổng trọng số phải = 100% (hiện ${weightSum}%).`);
      return;
    }
    if (form.indicators.some((i) => !i.name.trim() || !i.code.trim())) {
      toast.error("Mỗi chỉ tiêu cần mã và tên.");
      return;
    }
    setSaving(true);
    try {
      await createMasterForm({
        name: form.name.trim(),
        code: form.code.trim().toUpperCase(),
        description: form.description.trim(),
        periodId: form.periodId,
        templateId: form.templateId,
        scopeType: form.scopeType,
        provinceDepartmentId:
          form.scopeType === "PROVINCE"
            ? form.provinceDepartmentId || undefined
            : undefined,
        targetDepartmentIds:
          form.scopeType === "SELECTED_DEPTS"
            ? form.targetDepartmentIds
            : undefined,
        indicators: form.indicators.map((i, idx) => ({
          ...i,
          code: i.code.trim().toUpperCase(),
          name: i.name.trim(),
          sortOrder: idx,
        })),
      });
      await mutate();
      setOpen(false);
      toast.success("Đã tạo mẫu nhiệm vụ (Nháp).");
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function handleReady(item: MissionMasterForm) {
    try {
      await markMasterFormReady(entityId(item));
      await mutate();
      toast.success("Đã chuyển Chờ phát hành.");
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  }

  async function handlePublish(item: MissionMasterForm) {
    try {
      const result = await publishMasterForm(entityId(item));
      await mutate();
      toast.success(
        `Đã phát hành: ${result.phongCount} phòng, ${result.tasksCreated} chỉ tiêu.`,
      );
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  }

  async function handleStatus(
    item: MissionMasterForm,
    status: MasterFormStatus,
  ) {
    try {
      await setMasterFormStatus(entityId(item), status);
      await mutate();
      toast.success(`Đã chuyển: ${MASTER_FORM_STATUSES[status]}`);
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  }

  async function handleTracking(item: MissionMasterForm) {
    try {
      const data = await fetchMasterFormTracking(entityId(item));
      setTracking(data);
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  }

  async function handleDelete(item: MissionMasterForm) {
    try {
      await deleteMasterForm(entityId(item));
      await mutate();
      toast.success("Đã xoá.");
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Phát hành nhiệm vụ cấp tỉnh
          </h1>
          <p className="text-sm text-muted-foreground">
            Tạo mẫu chỉ tiêu → chọn phạm vi phòng → phát hành (tự tạo Form nhiệm
            vụ từng phòng, không qua Form 3).
          </p>
        </div>
        <Button
          onClick={() => {
            setForm({
              name: "",
              code: `MISSION_${Date.now().toString(36).toUpperCase()}`,
              description: "",
              periodId: periods[0] ? entityId(periods[0]) : "",
              templateId: templates.find((t) => t.isActive)
                ? entityId(templates.find((t) => t.isActive)!)
                : "",
              scopeType: "ALL_PHONG",
              provinceDepartmentId: catDepts[0] ? entityId(catDepts[0]) : "",
              targetDepartmentIds: [],
              indicators: [emptyIndicator(1), emptyIndicator(2)],
            });
            setOpen(true);
          }}
        >
          <Plus className="size-4" />
          Tạo mẫu nhiệm vụ
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Danh sách mẫu</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mẫu</TableHead>
                <TableHead>Kỳ</TableHead>
                <TableHead>Phạm vi</TableHead>
                <TableHead>Chỉ tiêu</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead className="w-[280px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {forms.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-muted-foreground text-center"
                  >
                    Chưa có mẫu nhiệm vụ cấp tỉnh.
                  </TableCell>
                </TableRow>
              ) : (
                forms.map((item) => (
                  <TableRow key={entityId(item)}>
                    <TableCell>
                      <div className="font-medium">{item.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {item.code}
                      </div>
                    </TableCell>
                    <TableCell>
                      {typeof item.periodId === "string"
                        ? item.periodId
                        : `${item.periodId.code}`}
                    </TableCell>
                    <TableCell>
                      {MASTER_FORM_SCOPES[item.scopeType] ?? item.scopeType}
                    </TableCell>
                    <TableCell>{item.indicators?.length ?? 0}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {MASTER_FORM_STATUSES[item.status] ?? item.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(item.status === "DRAFT" ||
                          item.status === "READY") && (
                          <>
                            {item.status === "DRAFT" ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleReady(item)}
                              >
                                Chờ phát hành
                              </Button>
                            ) : null}
                            <Button
                              size="sm"
                              onClick={() => handlePublish(item)}
                            >
                              <Rocket className="size-4" />
                              Phát hành
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDelete(item)}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </>
                        )}
                        {item.status === "PUBLISHED" ? (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleTracking(item)}
                            >
                              <Eye className="size-4" />
                              Theo dõi
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleStatus(item, "LOCKED")}
                            >
                              Khóa
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleStatus(item, "CLOSED")}
                            >
                              Kết thúc
                            </Button>
                          </>
                        ) : null}
                        {item.status === "LOCKED" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleTracking(item)}
                          >
                            Theo dõi
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Tạo mẫu nhiệm vụ cấp tỉnh</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Tên form</Label>
                <Input
                  value={form.name}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, name: e.target.value }))
                  }
                  placeholder="Nhiệm vụ công tác chuyển đổi số năm 2026"
                />
              </div>
              <div className="space-y-2">
                <Label>Mã form</Label>
                <Input
                  value={form.code}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, code: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Mô tả</Label>
              <Textarea
                value={form.description}
                onChange={(e) =>
                  setForm((s) => ({ ...s, description: e.target.value }))
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Kỳ đánh giá</Label>
                <Select
                  value={form.periodId}
                  onValueChange={(v) => setForm((s) => ({ ...s, periodId: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn kỳ" />
                  </SelectTrigger>
                  <SelectContent>
                    {periods.map((p) => (
                      <SelectItem key={entityId(p)} value={entityId(p)}>
                        {p.code} - {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Template cột / header</Label>
                <Select
                  value={form.templateId}
                  onValueChange={(v) =>
                    setForm((s) => ({ ...s, templateId: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn template" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates
                      .filter((t) => t.isActive)
                      .map((t) => (
                        <SelectItem key={entityId(t)} value={entityId(t)}>
                          {t.code} - {t.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Phạm vi áp dụng</Label>
              <Select
                value={form.scopeType}
                onValueChange={(v) =>
                  setForm((s) => ({
                    ...s,
                    scopeType: v as MasterFormScope,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(MASTER_FORM_SCOPES) as MasterFormScope[]).map(
                    (key) => (
                      <SelectItem key={key} value={key}>
                        {MASTER_FORM_SCOPES[key]}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
            {form.scopeType === "PROVINCE" ? (
              <div className="space-y-2">
                <Label>Công an tỉnh</Label>
                <Select
                  value={form.provinceDepartmentId}
                  onValueChange={(v) =>
                    setForm((s) => ({ ...s, provinceDepartmentId: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn CAT" />
                  </SelectTrigger>
                  <SelectContent>
                    {catDepts.map((d) => (
                      <SelectItem key={entityId(d)} value={entityId(d)}>
                        {d.code} - {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            {form.scopeType === "SELECTED_DEPTS" ? (
              <div className="space-y-2">
                <Label>Chọn phòng</Label>
                <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-2">
                  {phongDepts.map((d) => {
                    const id = entityId(d);
                    const checked = form.targetDepartmentIds.includes(id);
                    return (
                      <label
                        key={id}
                        className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) =>
                            setForm((s) => ({
                              ...s,
                              targetDepartmentIds: v
                                ? [...s.targetDepartmentIds, id]
                                : s.targetDepartmentIds.filter((x) => x !== id),
                            }))
                          }
                        />
                        {d.code} - {d.name}
                      </label>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Chỉ tiêu (tổng trọng số: {weightSum}%)</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setForm((s) => ({
                      ...s,
                      indicators: [
                        ...s.indicators,
                        emptyIndicator(s.indicators.length + 1),
                      ],
                    }))
                  }
                >
                  Thêm chỉ tiêu
                </Button>
              </div>
              <div className="space-y-3">
                {form.indicators.map((ind, index) => (
                  <div
                    key={index}
                    className="grid grid-cols-12 gap-2 rounded-md border p-2"
                  >
                    <Input
                      className="col-span-2"
                      placeholder="Mã"
                      value={ind.code}
                      onChange={(e) =>
                        setForm((s) => {
                          const next = [...s.indicators];
                          next[index] = { ...ind, code: e.target.value };
                          return { ...s, indicators: next };
                        })
                      }
                    />
                    <Input
                      className="col-span-6"
                      placeholder="Tên chỉ tiêu"
                      value={ind.name}
                      onChange={(e) =>
                        setForm((s) => {
                          const next = [...s.indicators];
                          next[index] = { ...ind, name: e.target.value };
                          return { ...s, indicators: next };
                        })
                      }
                    />
                    <Input
                      className="col-span-2"
                      type="number"
                      placeholder="%"
                      value={ind.weight}
                      onChange={(e) =>
                        setForm((s) => {
                          const next = [...s.indicators];
                          next[index] = {
                            ...ind,
                            weight: Number(e.target.value) || 0,
                          };
                          return { ...s, indicators: next };
                        })
                      }
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      className="col-span-2"
                      disabled={form.indicators.length <= 1}
                      onClick={() =>
                        setForm((s) => ({
                          ...s,
                          indicators: s.indicators.filter(
                            (_, i) => i !== index,
                          ),
                        }))
                      }
                    >
                      Xoá
                    </Button>
                    <Input
                      className="col-span-6"
                      placeholder="Tiêu chí đánh giá"
                      value={ind.criteria ?? ""}
                      onChange={(e) =>
                        setForm((s) => {
                          const next = [...s.indicators];
                          next[index] = { ...ind, criteria: e.target.value };
                          return { ...s, indicators: next };
                        })
                      }
                    />
                    <Input
                      className="col-span-6"
                      placeholder="Minh chứng bắt buộc"
                      value={ind.evidenceRequired ?? ""}
                      onChange={(e) =>
                        setForm((s) => {
                          const next = [...s.indicators];
                          next[index] = {
                            ...ind,
                            evidenceRequired: e.target.value,
                          };
                          return { ...s, indicators: next };
                        })
                      }
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Hủy
            </Button>
            <Button onClick={handleCreate} disabled={saving}>
              Lưu nháp
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(tracking)} onOpenChange={() => setTracking(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Theo dõi: {tracking?.formName}</DialogTitle>
          </DialogHeader>
          {tracking ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {tracking.phongWithSheet}/{tracking.phongTotal} phòng đã có Form
                nhiệm vụ · {tracking.phongAssigned} phòng đã phân công
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Phòng</TableHead>
                    <TableHead>Form</TableHead>
                    <TableHead>Chỉ tiêu</TableHead>
                    <TableHead>Đã giao</TableHead>
                    <TableHead>Hoàn thành</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tracking.rows.map((row) => (
                    <TableRow key={row.departmentId}>
                      <TableCell>
                        {row.code} - {row.name}
                      </TableCell>
                      <TableCell>{row.hasSheet ? "Có" : "Chưa"}</TableCell>
                      <TableCell>{row.indicatorCount}</TableCell>
                      <TableCell>{row.assignedCount}</TableCell>
                      <TableCell>{row.completedCount}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
