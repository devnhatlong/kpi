"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { SearchableSelect } from "@/components/common/searchable-select";
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
  createDepartment,
  updateDepartment,
} from "@/features/organization/api";
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
      setLevelId(
        entityId(edit.levelId as { _id?: string; id?: string } | string) ||
          NONE,
      );
      setParentId(
        entityId(edit.parentId as { _id?: string; id?: string } | string) ||
          NONE,
      );
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

  const editId = edit ? entityId(edit) : "";

  const levelOptions = useMemo(
    () => [
      { value: NONE, label: "- Không chọn -" },
      ...levels.map((level) => ({
        value: entityId(level),
        label: `${level.code} - ${level.name}`,
        keywords: level.code,
      })),
    ],
    [levels],
  );

  const parentOptions = useMemo(
    () => [
      { value: NONE, label: "- Đơn vị gốc -" },
      ...departments
        .filter((d) => entityId(d) !== editId)
        .map((d) => ({
          value: entityId(d),
          label: `${d.code} - ${d.name}`,
          keywords: d.code,
        })),
    ],
    [departments, editId],
  );

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{edit ? "Sửa đơn vị" : "Thêm đơn vị"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-5 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="unit-code">Mã đơn vị</Label>
              <Input
                id="unit-code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="VD: CNTT"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="unit-name">Tên đơn vị</Label>
              <Input
                id="unit-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="VD: Đội Công nghệ thông tin"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Cấp đơn vị</Label>
              <SearchableSelect
                value={levelId}
                onValueChange={setLevelId}
                options={levelOptions}
                placeholder="Chọn cấp"
                searchPlaceholder="Tìm cấp đơn vị..."
              />
            </div>
            <div className="space-y-2">
              <Label>Thuộc đơn vị</Label>
              <SearchableSelect
                value={parentId}
                onValueChange={setParentId}
                options={parentOptions}
                placeholder="Đơn vị cha"
                searchPlaceholder="Tìm đơn vị..."
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="unit-sort">Thứ tự</Label>
              <Input
                id="unit-sort"
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
              />
            </div>
            <div className="flex h-full items-end">
              <div className="flex h-9 w-full items-center justify-between rounded-lg border px-3">
                <Label htmlFor="unit-active">Đang hoạt động</Label>
                <Switch
                  id="unit-active"
                  checked={isActive}
                  onCheckedChange={setIsActive}
                />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
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
