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
import { Textarea } from "@/components/ui/textarea";
import {
  createPermission,
  updatePermission,
} from "@/features/organization/api";
import type { AppPermission } from "@/features/organization/types";
import { entityId } from "@/features/organization/types";
import { getApiErrorMessage } from "@/lib/api-client";

type PermissionFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  edit?: AppPermission | null;
  onSuccess: () => void;
};

export function PermissionFormDialog({
  open,
  onOpenChange,
  edit,
  onSuccess,
}: PermissionFormDialogProps) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [module, setModule] = useState("");
  const [description, setDescription] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (edit) {
      setCode(edit.code);
      setName(edit.name);
      setModule(edit.module ?? "");
      setDescription(edit.description ?? "");
      setSortOrder(String(edit.sortOrder ?? 0));
      setIsActive(edit.isActive);
    } else {
      setCode("");
      setName("");
      setModule("");
      setDescription("");
      setSortOrder("0");
      setIsActive(true);
    }
  }, [open, edit]);

  const submit = async () => {
    if (!code.trim() || !name.trim()) {
      toast.error("Vui lòng nhập mã và tên quyền.");
      return;
    }

    const sortOrderNum = Number(sortOrder);
    if (!Number.isFinite(sortOrderNum) || sortOrderNum < 0) {
      toast.error("Thứ tự không hợp lệ.");
      return;
    }

    const payload = {
      code: code.trim().toLowerCase(),
      name: name.trim(),
      module: module.trim().toLowerCase() || undefined,
      description: description.trim() || undefined,
      sortOrder: sortOrderNum,
      isActive,
    };

    setSaving(true);
    try {
      if (edit) {
        await updatePermission(entityId(edit), payload);
        toast.success("Đã cập nhật quyền.");
      } else {
        await createPermission(payload);
        toast.success("Đã thêm quyền.");
      }
      onOpenChange(false);
      onSuccess();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không lưu được quyền."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{edit ? "Sửa quyền" : "Thêm quyền"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-5 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="perm-code">Mã quyền</Label>
              <Input
                id="perm-code"
                value={code}
                onChange={(e) => setCode(e.target.value.toLowerCase())}
                placeholder="user.view"
                disabled={!!edit?.isSystem}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="perm-name">Tên quyền</Label>
              <Input
                id="perm-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Xem người dùng"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="perm-module">Nhóm / module</Label>
              <Input
                id="perm-module"
                value={module}
                onChange={(e) => setModule(e.target.value.toLowerCase())}
                placeholder="user"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="perm-sort">Thứ tự</Label>
              <Input
                id="perm-sort"
                type="number"
                min={0}
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="perm-desc">Mô tả</Label>
            <Textarea
              id="perm-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Mô tả ngắn (tuỳ chọn)"
              rows={3}
            />
          </div>

          <div className="flex h-9 items-center justify-between rounded-lg border px-3">
            <Label htmlFor="perm-active">Đang hoạt động</Label>
            <Switch
              id="perm-active"
              checked={isActive}
              onCheckedChange={setIsActive}
            />
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
