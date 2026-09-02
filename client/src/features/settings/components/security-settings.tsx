"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/features/auth/auth-provider";
import { changeMyPassword } from "@/features/settings/api";
import { getApiErrorMessage } from "@/lib/api-client";

const MIN_PASSWORD_LENGTH = 6;

type PasswordFieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
};

function PasswordField({ id, label, value, onChange }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        <span className="text-destructive">*</span> {label}
      </Label>
      <div className="relative">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          className="pr-9"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete="off"
        />
        <button
          type="button"
          onClick={() => setVisible((prev) => !prev)}
          className="absolute right-0 top-0 flex h-9 w-9 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
          aria-label={visible ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
        >
          {visible ? (
            <EyeOff className="h-4 w-4" />
          ) : (
            <Eye className="h-4 w-4" />
          )}
        </button>
      </div>
    </div>
  );
}

export function SecuritySettings() {
  const router = useRouter();
  const { logout } = useAuth();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!currentPassword.trim()) {
      toast.error("Vui lòng nhập mật khẩu hiện tại.");
      return;
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      toast.error(`Mật khẩu mới phải có ít nhất ${MIN_PASSWORD_LENGTH} ký tự.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Xác nhận mật khẩu không khớp.");
      return;
    }

    setSaving(true);
    try {
      await changeMyPassword({ currentPassword, newPassword });
      toast.success("Đổi mật khẩu thành công. Vui lòng đăng nhập lại.");
      await logout();
      router.replace("/login");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không đổi được mật khẩu."));
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg font-semibold tracking-tight">
        Đổi mật khẩu
      </h2>

      <div className="max-w-md space-y-4">
        <PasswordField
          id="current-password"
          label="Mật khẩu hiện tại"
          value={currentPassword}
          onChange={setCurrentPassword}
        />
        <PasswordField
          id="new-password"
          label="Mật khẩu mới"
          value={newPassword}
          onChange={setNewPassword}
        />
        <PasswordField
          id="confirm-password"
          label="Xác nhận mật khẩu"
          value={confirmPassword}
          onChange={setConfirmPassword}
        />
      </div>

      <div className="space-y-2">
        <Button onClick={submit} disabled={saving}>
          {saving ? "Đang cập nhật..." : "Cập nhật mật khẩu"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Sau khi đổi mật khẩu, mọi thiết bị sẽ bị đăng xuất và bạn cần đăng
          nhập lại.
        </p>
      </div>
    </div>
  );
}
