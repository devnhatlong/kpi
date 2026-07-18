"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  createRole,
  fetchPermissions,
  permissionKeys,
  updateRole,
} from "@/features/organization/api";
import type { Role } from "@/features/organization/types";
import { entityId } from "@/features/organization/types";
import { getApiErrorMessage } from "@/lib/api-client";

type RoleFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  edit?: Role | null;
  onSuccess: () => void;
};

export function RoleFormDialog({
  open,
  onOpenChange,
  edit,
  onSuccess,
}: RoleFormDialogProps) {
  const { data: allPermissions = [] } = useSWR(
    open ? permissionKeys.all : null,
    fetchPermissions,
  );

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [permissions, setPermissions] = useState<string[]>([]);
  const [sortOrder, setSortOrder] = useState("0");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const activePermissions = useMemo(
    () =>
      allPermissions
        .filter((p) => p.isActive)
        .sort(
          (a, b) =>
            (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
            a.module.localeCompare(b.module) ||
            a.code.localeCompare(b.code),
        ),
    [allPermissions],
  );

  useEffect(() => {
    if (!open) return;
    if (edit) {
      setCode(edit.code);
      setName(edit.name);
      setPermissions([...(edit.permissions ?? [])]);
      setSortOrder(String(edit.sortOrder ?? 0));
      setIsActive(edit.isActive);
    } else {
      setCode("");
      setName("");
      setPermissions([]);
      setSortOrder("0");
      setIsActive(true);
    }
  }, [open, edit]);

  const togglePermission = (permissionCode: string, checked: boolean) => {
    setPermissions((prev) =>
      checked ? [...prev, permissionCode] : prev.filter((p) => p !== permissionCode),
    );
  };

  const submit = async () => {
    if (!edit && !code.trim()) {
      toast.error("Vui lòng nhập mã vai trò.");
      return;
    }
    if (!name.trim()) {
      toast.error("Vui lòng nhập tên vai trò.");
      return;
    }

    const sortOrderNum = Number(sortOrder);
    if (!Number.isFinite(sortOrderNum) || sortOrderNum < 0) {
      toast.error("Thứ tự không hợp lệ.");
      return;
    }

    setSaving(true);
    try {
      if (edit) {
        await updateRole(entityId(edit), {
          name: name.trim(),
          permissions,
          sortOrder: sortOrderNum,
          isActive,
        });
        toast.success("Đã cập nhật vai trò.");
      } else {
        await createRole({
          code: code.trim().toUpperCase(),
          name: name.trim(),
          permissions,
          sortOrder: sortOrderNum,
          isActive,
        });
        toast.success("Đã thêm vai trò.");
      }
      onOpenChange(false);
      onSuccess();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không lưu được vai trò."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{edit ? "Sửa vai trò" : "Thêm vai trò"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="role-code">Mã vai trò</Label>
              <Input
                id="role-code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="VD: REVIEWER"
                disabled={!!edit}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role-name">Tên vai trò</Label>
              <Input
                id="role-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="VD: Người duyệt"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 items-end">
            <div className="space-y-2">
              <Label htmlFor="role-sort">Thứ tự</Label>
              <Input
                id="role-sort"
                type="number"
                min={0}
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border px-3 py-2">
              <Label htmlFor="role-active">Đang hoạt động</Label>
              <Switch id="role-active" checked={isActive} onCheckedChange={setIsActive} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Quyền hạn (từ DB)</Label>
            <div className="max-h-56 space-y-2 overflow-y-auto rounded-lg border p-3">
              {activePermissions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Chưa có quyền nào. Thêm ở mục Quyền trước.
                </p>
              ) : (
                activePermissions.map((permission) => {
                  const checked = permissions.includes(permission.code);
                  return (
                    <label
                      key={entityId(permission)}
                      className="flex cursor-pointer items-start gap-2 text-sm"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(value) =>
                          togglePermission(permission.code, value === true)
                        }
                        className="mt-0.5"
                      />
                      <span>
                        <span className="font-medium">{permission.name}</span>
                        <span className="ml-1.5 font-mono text-xs text-muted-foreground">
                          {permission.code}
                        </span>
                      </span>
                    </label>
                  );
                })
              )}
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
