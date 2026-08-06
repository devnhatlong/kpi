"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  createDepartmentLevel,
  updateDepartmentLevel,
} from "@/features/organization/api";
import type { DepartmentLevel } from "@/features/organization/types";
import { entityId } from "@/features/organization/types";
import { getApiErrorMessage } from "@/lib/api-client";

type LevelFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  edit?: DepartmentLevel | null;
  onSuccess: () => void;
};

export function LevelFormDialog({
  open,
  onOpenChange,
  edit,
  onSuccess,
}: LevelFormDialogProps) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [rank, setRank] = useState("1");
  const [isActive, setIsActive] = useState(true);
  const [isKpiUnit, setIsKpiUnit] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (edit) {
      setCode(edit.code);
      setName(edit.name);
      setRank(String(edit.rank ?? 1));
      setIsActive(edit.isActive);
      setIsKpiUnit(edit.isKpiUnit ?? false);
    } else {
      setCode("");
      setName("");
      setRank("1");
      setIsActive(true);
      setIsKpiUnit(false);
    }
  }, [open, edit]);

  const submit = async () => {
    if (!code.trim() || !name.trim()) {
      toast.error("Vui lòng nhập mã và tên cấp đơn vị.");
      return;
    }

    const rankNum = Number(rank);
    if (!Number.isFinite(rankNum) || rankNum < 0) {
      toast.error("Thứ tự cấp không hợp lệ.");
      return;
    }

    const payload = {
      code: code.trim().toUpperCase(),
      name: name.trim(),
      rank: rankNum,
      isActive,
      isKpiUnit,
    };

    setSaving(true);
    try {
      if (edit) {
        await updateDepartmentLevel(entityId(edit), payload);
        toast.success("Đã cập nhật cấp đơn vị.");
      } else {
        await createDepartmentLevel(payload);
        toast.success("Đã thêm cấp đơn vị.");
      }
      onOpenChange(false);
      onSuccess();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không lưu được cấp đơn vị."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{edit ? "Sửa cấp đơn vị" : "Thêm cấp đơn vị"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-5 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="level-code">Mã cấp</Label>
              <Input
                id="level-code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="VD: CAT"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="level-name">Tên cấp</Label>
              <Input
                id="level-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="VD: Công an tỉnh"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="level-rank">Thứ tự cấp</Label>
            <Input
              id="level-rank"
              type="number"
              min={0}
              value={rank}
              onChange={(e) => setRank(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">1 = cấp cao nhất</p>
          </div>

          <div className="flex h-9 items-center justify-between rounded-lg border px-3">
            <Label htmlFor="level-active">Đang hoạt động</Label>
            <Switch id="level-active" checked={isActive} onCheckedChange={setIsActive} />
          </div>

          <div className="space-y-2 rounded-lg border p-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="level-kpi-unit">Là đơn vị nhận KPI</Label>
              <Switch
                id="level-kpi-unit"
                checked={isKpiUnit}
                onCheckedChange={setIsKpiUnit}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Bật cho cấp thật sự nhận và thực hiện nhiệm vụ (Phòng, Xã). Tắt
              cho cấp chỉ gom nhóm (Khối) - nhiệm vụ sẽ đi thẳng qua, không dừng
              lại ở đó. Chưa cấp nào bật thì mọi cấp đều nhận được.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
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
