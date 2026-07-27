"use client";

import { useState } from "react";
import dayjs from "dayjs";
import { getDefaultDueDate } from "@/lib/server-time";
import { Plus, XCircle } from "lucide-react";
import useSWR from "swr";
import { toast } from "sonner";
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
import { entityId } from "@/features/organization/types";
import { getApiErrorMessage } from "@/lib/api-client";
import {
  cancelHandoff,
  createHandoff,
  fetchHandoffs,
  fetchKpiPeriods,
  fetchPeerDepartments,
  fetchWorkContents,
  kpiConfigKeys,
} from "../api";
import { HANDOFF_STATUSES, type HandoffStatus, type UnitHandoff } from "../types";
import { useWorkingUnit } from "../use-working-unit";
import { WorkingUnitSelect } from "./working-unit-select";

function relationName(value: object | string | undefined | null): string {
  if (!value) return "—";
  if (typeof value === "string") return value;
  const obj = value as { code?: string; name?: string };
  if (obj.code && obj.name) return `${obj.code} — ${obj.name}`;
  return obj.name ?? "—";
}

export function HandoffOutboundView() {
  const {
    workingDepartmentId,
    setWorkingDepartmentId,
    scopedOptions,
  } = useWorkingUnit();

  const { data: handoffs = [], mutate } = useSWR(
    workingDepartmentId
      ? [...kpiConfigKeys.handoffs, "out", workingDepartmentId]
      : null,
    () =>
      fetchHandoffs({
        departmentId: workingDepartmentId,
        direction: "out",
      }),
  );
  const { data: peers = [] } = useSWR(
    workingDepartmentId ? ["kpi-peers", workingDepartmentId] : null,
    () => fetchPeerDepartments(workingDepartmentId),
  );
  const { data: contents = [] } = useSWR(kpiConfigKeys.contents, fetchWorkContents);
  const { data: periods = [] } = useSWR(kpiConfigKeys.periods, fetchKpiPeriods);

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    targetDepartmentId: "",
    periodId: "",
    contentId: "",
    title: "",
    description: "",
    dueDate: "",
    product: "",
    standardScore: 10,
    note: "",
  });

  async function handleCreate() {
    if (!workingDepartmentId) return;
    if (
      !form.targetDepartmentId ||
      !form.contentId ||
      !form.title.trim() ||
      !form.product.trim()
    ) {
      toast.error("Điền đủ đơn vị nhận, nội dung, nhiệm vụ và sản phẩm.");
      return;
    }
    setSaving(true);
    try {
      await createHandoff({
        sourceDepartmentId: workingDepartmentId,
        targetDepartmentId: form.targetDepartmentId,
        periodId: form.periodId || undefined,
        contentId: form.contentId,
        title: form.title.trim(),
        description: form.description.trim(),
        dueDate: form.dueDate,
        product: form.product.trim(),
        standardScore: form.standardScore,
        note: form.note.trim(),
      });
      await mutate();
      setOpen(false);
      toast.success("Đã gửi nhiệm vụ sang đơn vị ngang cấp.");
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function handleCancel(item: UnitHandoff) {
    try {
      await cancelHandoff(entityId(item));
      await mutate();
      toast.success("Đã huỷ giao nhiệm vụ.");
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Theo dõi nhiệm vụ do đơn vị chủ trì
          </h1>
          <p className="text-sm text-muted-foreground">
            Form 2 — giao ngang cho đơn vị cùng cấp (cùng đơn vị cha).
          </p>
        </div>
        <WorkingUnitSelect
          workingDepartmentId={workingDepartmentId}
          scopedOptions={scopedOptions}
          onChange={setWorkingDepartmentId}
        />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-base">Nhiệm vụ đã giao đi</CardTitle>
          <Button
            size="sm"
            disabled={!workingDepartmentId}
            onClick={async () => {
              const dueDate = await getDefaultDueDate(14);
              setForm((s) => ({ ...s, dueDate }));
              setOpen(true);
            }}
          >
            <Plus className="size-4" />
            Giao nhiệm vụ ngang
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nhiệm vụ</TableHead>
                <TableHead>Đơn vị nhận</TableHead>
                <TableHead>Hạn</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead className="w-[100px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {!workingDepartmentId ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground">
                    Chọn đơn vị làm việc.
                  </TableCell>
                </TableRow>
              ) : handoffs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground text-center">
                    Chưa giao nhiệm vụ ngang cấp nào.
                  </TableCell>
                </TableRow>
              ) : (
                handoffs.map((item) => (
                  <TableRow key={entityId(item)}>
                    <TableCell>
                      <div className="font-medium">{item.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {relationName(item.contentId)}
                      </div>
                    </TableCell>
                    <TableCell>{relationName(item.targetDepartmentId)}</TableCell>
                    <TableCell>
                      {dayjs(item.dueDate).format("DD/MM/YYYY")}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {HANDOFF_STATUSES[item.status as HandoffStatus] ??
                          item.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {item.status === "SENT" || item.status === "DRAFT" ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleCancel(item)}
                        >
                          <XCircle className="size-4" />
                          Huỷ
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Giao nhiệm vụ sang đơn vị ngang cấp</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Đơn vị nhận</Label>
              <Select
                value={form.targetDepartmentId}
                onValueChange={(v) =>
                  setForm((s) => ({ ...s, targetDepartmentId: v }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chọn đơn vị peer" />
                </SelectTrigger>
                <SelectContent>
                  {peers.map((d) => (
                    <SelectItem key={entityId(d)} value={entityId(d)}>
                      {d.code} — {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Kỳ KPI (tuỳ chọn)</Label>
              <Select
                value={form.periodId || "__none__"}
                onValueChange={(v) =>
                  setForm((s) => ({
                    ...s,
                    periodId: v === "__none__" ? "" : v,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Không chọn" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Không chọn</SelectItem>
                  {periods.map((p) => (
                    <SelectItem key={entityId(p)} value={entityId(p)}>
                      {p.code} — {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Nội dung công việc</Label>
              <Select
                value={form.contentId}
                onValueChange={(v) => setForm((s) => ({ ...s, contentId: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chọn nội dung" />
                </SelectTrigger>
                <SelectContent>
                  {contents.map((c) => (
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
                value={form.title}
                onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))}
              />
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
                <Label>Hạn</Label>
                <Input
                  type="date"
                  value={form.dueDate}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, dueDate: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Điểm chuẩn</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.standardScore}
                  onChange={(e) =>
                    setForm((s) => ({
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
                value={form.product}
                onChange={(e) =>
                  setForm((s) => ({ ...s, product: e.target.value }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Huỷ
            </Button>
            <Button onClick={handleCreate} disabled={saving}>
              Gửi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
