"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";

import { SearchableSelect } from "@/components/common/searchable-select";
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
  createUser,
  fetchDepartments,
  fetchRoles,
  roleKeys,
  updateUser,
} from "@/features/organization/api";
import type { UserAccount } from "@/features/organization/types";
import { entityId } from "@/features/organization/types";
import { getApiErrorMessage } from "@/lib/api-client";

type UserFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  edit?: UserAccount | null;
  onSuccess: () => void;
};

const NONE = "__none__";

export function UserFormDialog({
  open,
  onOpenChange,
  edit,
  onSuccess,
}: UserFormDialogProps) {
  const { data: departments = [] } = useSWR(
    open ? "departments-for-user-form" : null,
    fetchDepartments,
  );
  const { data: roles = [] } = useSWR(open ? roleKeys.all : null, fetchRoles);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [departmentId, setDepartmentId] = useState(NONE);
  const [roleCodes, setRoleCodes] = useState<string[]>([]);
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (edit) {
      setUsername(edit.username);
      setPassword("");
      setFullName(edit.fullName ?? "");
      setEmail(edit.email ?? "");
      setPhone(edit.phone ?? "");
      setDepartmentId(entityId(edit.departmentId) || NONE);
      setRoleCodes((edit.roleAssignments ?? []).map((r) => r.roleCode));
      setIsActive(edit.isActive);
    } else {
      setUsername("");
      setPassword("");
      setFullName("");
      setEmail("");
      setPhone("");
      setDepartmentId(NONE);
      setRoleCodes([]);
      setIsActive(true);
    }
  }, [open, edit]);

  const departmentOptions = useMemo(
    () => [
      { value: NONE, label: "- Không chọn -" },
      ...departments.map((d) => ({
        value: entityId(d),
        label: `${d.code} - ${d.name}`,
        keywords: d.code,
      })),
    ],
    [departments],
  );

  const activeRoles = useMemo(
    () =>
      roles
        .filter((r) => r.isActive)
        .sort(
          (a, b) =>
            (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.code.localeCompare(b.code),
        ),
    [roles],
  );

  const toggleRole = (code: string, checked: boolean) => {
    setRoleCodes((prev) =>
      checked ? [...prev, code] : prev.filter((c) => c !== code),
    );
  };

  const submit = async () => {
    if (!edit && !username.trim()) {
      toast.error("Vui lòng nhập tên đăng nhập.");
      return;
    }
    if (!edit && !password.trim()) {
      toast.error("Vui lòng nhập mật khẩu.");
      return;
    }

    const scope = departmentId !== NONE ? departmentId : null;
    const roleAssignments = roleCodes.map((roleCode) => ({
      roleCode,
      scopeDepartmentId: scope,
    }));

    setSaving(true);
    try {
      if (edit) {
        await updateUser(entityId(edit), {
          ...(password.trim() ? { password: password.trim() } : {}),
          fullName: fullName.trim() || undefined,
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          departmentId: departmentId === NONE ? null : departmentId,
          roleAssignments,
          isActive,
        });
        toast.success("Đã cập nhật người dùng.");
      } else {
        await createUser({
          username: username.trim().toLowerCase(),
          password: password.trim(),
          fullName: fullName.trim() || undefined,
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          departmentId: departmentId === NONE ? undefined : departmentId,
          roleAssignments,
          isActive,
        });
        toast.success("Đã thêm người dùng.");
      }
      onOpenChange(false);
      onSuccess();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không lưu được người dùng."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{edit ? "Sửa người dùng" : "Thêm người dùng"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-5 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="user-username">Tên đăng nhập</Label>
              <Input
                id="user-username"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase())}
                placeholder="vd: nv01"
                disabled={!!edit}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="user-password">
                {edit ? "Mật khẩu mới (tuỳ chọn)" : "Mật khẩu"}
              </Label>
              <Input
                id="user-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={edit ? "Để trống nếu không đổi" : "••••••"}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="user-fullname">Họ và tên</Label>
              <Input
                id="user-fullname"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Nguyễn Văn A"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="user-phone">Số điện thoại</Label>
              <Input
                id="user-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="0901234567"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="user-email">Email</Label>
              <Input
                id="user-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="a@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label>Đơn vị</Label>
              <SearchableSelect
                value={departmentId}
                onValueChange={setDepartmentId}
                options={departmentOptions}
                placeholder="Chọn đơn vị"
                searchPlaceholder="Tìm đơn vị..."
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Vai trò</Label>
            <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border p-3">
              {activeRoles.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Chưa có vai trò nào. Thêm ở mục Vai trò trước.
                </p>
              ) : (
                activeRoles.map((role) => {
                  const checked = roleCodes.includes(role.code);
                  return (
                    <label
                      key={entityId(role)}
                      className="flex cursor-pointer items-start gap-2 text-sm"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(value) =>
                          toggleRole(role.code, value === true)
                        }
                        className="mt-0.5"
                      />
                      <span>
                        <span className="font-medium">{role.name}</span>
                        <span className="ml-1.5 font-mono text-xs text-muted-foreground">
                          {role.code}
                        </span>
                      </span>
                    </label>
                  );
                })
              )}
            </div>
          </div>

          <div className="flex h-9 items-center justify-between rounded-lg border px-3">
            <Label htmlFor="user-active">Đang hoạt động</Label>
            <Switch id="user-active" checked={isActive} onCheckedChange={setIsActive} />
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
