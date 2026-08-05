"use client";

import { useState } from "react";
import dayjs from "dayjs";
import { Check, X } from "lucide-react";
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
  acceptHandoff,
  fetchHandoffs,
  fetchKpiPeriods,
  fetchKpiTemplates,
  fetchUnitKpiSheets,
  kpiConfigKeys,
  rejectHandoff,
} from "../api";
import {
  HANDOFF_STATUSES,
  type HandoffStatus,
  type UnitHandoff,
} from "../types";
import { useWorkingUnit } from "../use-working-unit";
import { WorkingUnitSelect } from "./working-unit-select";

function relationName(value: object | string | undefined | null): string {
  if (!value) return "-";
  if (typeof value === "string") return value;
  const obj = value as { code?: string; name?: string };
  if (obj.code && obj.name) return `${obj.code} - ${obj.name}`;
  return obj.name ?? "-";
}

export function HandoffInboundView() {
  const {
    workingDepartmentId,
    setWorkingDepartmentId,
    scopedOptions,
  } = useWorkingUnit();

  const { data: handoffs = [], mutate } = useSWR(
    workingDepartmentId
      ? [...kpiConfigKeys.handoffs, "in", workingDepartmentId]
      : null,
    () =>
      fetchHandoffs({
        departmentId: workingDepartmentId,
        direction: "in",
      }),
  );
  const { data: periods = [] } = useSWR(kpiConfigKeys.periods, fetchKpiPeriods);
  const { data: templates = [] } = useSWR(
    kpiConfigKeys.templates("SYSTEM"),
    () => fetchKpiTemplates("SYSTEM"),
  );
  const { data: sheets = [] } = useSWR(
    workingDepartmentId
      ? [...kpiConfigKeys.sheets, "inbound", workingDepartmentId]
      : null,
    () => fetchUnitKpiSheets({ departmentId: workingDepartmentId }),
  );

  const [acceptOpen, setAcceptOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [current, setCurrent] = useState<UnitHandoff | null>(null);
  const [periodId, setPeriodId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [sheetId, setSheetId] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleAccept() {
    if (!current) return;
    setBusy(true);
    try {
      await acceptHandoff(entityId(current), {
        sheetId: sheetId || undefined,
        periodId: sheetId ? undefined : periodId || undefined,
        templateId: sheetId ? undefined : templateId || undefined,
      });
      await mutate();
      setAcceptOpen(false);
      toast.success("Đã đưa nhiệm vụ vào Form KPI.");
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleReject() {
    if (!current) return;
    setBusy(true);
    try {
      await rejectHandoff(entityId(current), rejectReason.trim() || undefined);
      await mutate();
      setRejectOpen(false);
      toast.success("Đã từ chối nhiệm vụ.");
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Form tiếp nhận nhiệm vụ
          </h1>
          <p className="text-sm text-muted-foreground">
            Form 3 - nhiệm vụ đơn vị ngang cấp giao sang; pick vào Form KPI.
          </p>
        </div>
        <WorkingUnitSelect
          workingDepartmentId={workingDepartmentId}
          scopedOptions={scopedOptions}
          onChange={setWorkingDepartmentId}
        />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Hộp thư tiếp nhận</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nhiệm vụ</TableHead>
                <TableHead>Đơn vị gửi</TableHead>
                <TableHead>Hạn</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead className="w-[180px]" />
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
                  <TableCell
                    colSpan={5}
                    className="text-center text-muted-foreground"
                  >
                    Không có nhiệm vụ được giao đến.
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
                    <TableCell>{relationName(item.sourceDepartmentId)}</TableCell>
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
                      {item.status === "SENT" ? (
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            onClick={() => {
                              setCurrent(item);
                              setSheetId(sheets[0] ? entityId(sheets[0]) : "");
                              setPeriodId(
                                item.periodId
                                  ? typeof item.periodId === "string"
                                    ? item.periodId
                                    : entityId(item.periodId)
                                  : periods[0]
                                    ? entityId(periods[0])
                                    : "",
                              );
                              setTemplateId(
                                templates.find((t) => t.isActive)
                                  ? entityId(templates.find((t) => t.isActive)!)
                                  : "",
                              );
                              setAcceptOpen(true);
                            }}
                          >
                            <Check className="size-4" />
                            Nhận vào KPI
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setCurrent(item);
                              setRejectReason("");
                              setRejectOpen(true);
                            }}
                          >
                            <X className="size-4" />
                            Từ chối
                          </Button>
                        </div>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={acceptOpen} onOpenChange={setAcceptOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Đưa vào Form KPI</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{current?.title}</p>
            {sheets.length > 0 ? (
              <div className="space-y-2">
                <Label>Form KPI hiện có</Label>
                <Select
                  value={sheetId || "__auto__"}
                  onValueChange={(v) =>
                    setSheetId(v === "__auto__" ? "" : v)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__auto__">Tự tạo / chọn theo kỳ</SelectItem>
                    {sheets.map((s) => (
                      <SelectItem key={entityId(s)} value={entityId(s)}>
                        {typeof s.periodId === "string"
                          ? s.periodId
                          : `${s.periodId.code} - ${s.periodId.name}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            {!sheetId ? (
              <>
                <div className="space-y-2">
                  <Label>Kỳ KPI</Label>
                  <Select value={periodId} onValueChange={setPeriodId}>
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
                  <Label>Biểu mẫu (nếu tạo Form mới)</Label>
                  <Select value={templateId} onValueChange={setTemplateId}>
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
              </>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAcceptOpen(false)}>
              Hủy
            </Button>
            <Button onClick={handleAccept} disabled={busy}>
              Xác nhận nhận
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Từ chối nhiệm vụ</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Lý do</Label>
            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>
              Hủy
            </Button>
            <Button variant="destructive" onClick={handleReject} disabled={busy}>
              Từ chối
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
