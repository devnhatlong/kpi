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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { createDepartment, updateDepartment } from "@/features/organization/api";
import type {
  CreateDepartmentInput,
  Department,
  DepartmentLevel,
} from "@/features/organization/types";
import { entityId } from "@/features/organization/types";
import { getApiErrorMessage } from "@/lib/api-client";

type UnitFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  departments: Department[];
  levels: DepartmentLevel[];
  edit?: Department | null;
  defaultParentId?: string;
  onSuccess: () => void;
};

const NONE = "__none__";

export function UnitFormDialog({
  open,
  onOpenChange,
  departments,
  levels,
  edit,
  defaultParentId,
  onSuccess,
}: UnitFormDialogProps) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [levelId, setLevelId] = useState(NONE);
  const [parentId, setParentId] = useState(NONE);
  const [sortOrder, setSortOrder] = useState("0");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (edit) {
      setCode(edit.code);
      setName(edit.name);
      setLevelId(entityId(edit.levelId as { _id?: string; id?: string } | string) || NONE);
      setParentId(entityId(edit.parentId as { _id?: string; id?: string } | string) || NONE);
      setSortOrder(String(edit.sortOrder ?? 0));
      setIsActive(edit.isActive);
    } else {
      setCode("");
      setName("");
      setLevelId(NONE);
      setParentId(defaultParentId || NONE);
      setSortOrder("0");
      setIsActive(true);
    }
  }, [open, edit, defaultParentId]);

  const submit = async () => {
    if (!code.trim() || !name.trim()) {
      toast.error("Vui lòng nhập mã và tên đơn vị.");
      return;
    }

    const payload: CreateDepartmentInput = {
      code: code.trim(),
      name: name.trim(),
      sortOrder: Number(sortOrder) || 0,
      isActive,
    };
    if (levelId !== NONE) payload.levelId = levelId;
    if (parentId !== NONE) payload.parentId = parentId;

    setSaving(true);
    try {
      if (edit) {
        await updateDepartment(entityId(edit), {
          ...payload,
          levelId: levelId === NONE ? null : levelId,
          parentId: parentId === NONE ? null : parentId,
        });
        toast.success("Đã cập nhật đơn vị.");
      } else {
        await createDepartment(payload);
        toast.success("Đã thêm đơn vị.");
      }
      onOpenChange(false);
      onSuccess();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không lưu được đơn vị."));
    } finally {
      setSaving(false);
    }
  };

  const editId = edit ? entityId(edit) : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{edit ? "Sửa đơn vị" : "Thêm đơn vị"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-1 space-y-2">
              <Label htmlFor="unit-code">Mã đơn vị</Label>
              <Input
                id="unit-code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="VD: TMTH"
              />
            </div>
            <div className="col-span-2 space-y-2">
              <Label htmlFor="unit-name">Tên đơn vị</Label>
              <Input
                id="unit-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="VD: Đội Tham mưu Tổng hợp"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Cấp đơn vị</Label>
              <Select value={levelId} onValueChange={setLevelId}>
                <SelectTrigger>
                  <SelectValue placeholder="Chọn cấp" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>- Không chọn -</SelectItem>
                  {levels.map((level) => (
                    <SelectItem key={entityId(level)} value={entityId(level)}>
                      {level.code} - {level.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Thuộc đơn vị</Label>
              <Select value={parentId} onValueChange={setParentId}>
                <SelectTrigger>
                  <SelectValue placeholder="Đơn vị cha" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>- Đơn vị gốc -</SelectItem>
                  {departments
                    .filter((d) => entityId(d) !== editId)
                    .map((d) => (
                      <SelectItem key={entityId(d)} value={entityId(d)}>
                        {d.code} - {d.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 items-end">
            <div className="space-y-2">
              <Label htmlFor="unit-sort">Thứ tự</Label>
              <Input
                id="unit-sort"
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border px-3 py-2">
              <Label htmlFor="unit-active">Đang hoạt động</Label>
              <Switch id="unit-active" checked={isActive} onCheckedChange={setIsActive} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
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
