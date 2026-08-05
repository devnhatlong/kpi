"use client";

import { useState } from "react";
import { Save, Upload } from "lucide-react";
import { toast } from "sonner";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/features/auth/auth-provider";
import { initialsOf, type AuthUser } from "@/features/auth/types";
import { updateMyProfile } from "@/features/settings/api";
import { getApiErrorMessage } from "@/lib/api-client";

export function ProfileSettings() {
  const { user, refreshUser } = useAuth();

  if (!user) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  // key: form khởi tạo lại state khi đổi tài khoản, không cần effect đồng bộ
  return <ProfileForm key={user.id} user={user} onSaved={refreshUser} />;
}

type ProfileFormProps = {
  user: AuthUser;
  onSaved: () => Promise<void>;
};

function ProfileForm({ user, onSaved }: ProfileFormProps) {
  const [fullName, setFullName] = useState(user.fullName ?? "");
  const [email, setEmail] = useState(user.email ?? "");
  const [phone, setPhone] = useState(user.phone ?? "");
  const [position, setPosition] = useState(user.position ?? "");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      await updateMyProfile({
        fullName: fullName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        position: position.trim(),
      });
      await onSaved();
      toast.success("Đã lưu thông tin cá nhân.");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không lưu được thông tin."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="font-display text-lg font-semibold tracking-tight">
        Thông tin cá nhân
      </h2>

      <div className="flex flex-wrap items-center gap-4">
        <Avatar className="size-16">
          <AvatarFallback
            className="text-lg font-semibold text-primary-foreground"
            style={{ background: "var(--gradient-hero)" }}
          >
            {initialsOf(user)}
          </AvatarFallback>
        </Avatar>
        <div className="space-y-1.5">
          <Button type="button" variant="outline" size="sm" disabled>
            <Upload className="h-4 w-4" />
            Đổi ảnh đại diện
          </Button>
          <p className="text-xs text-muted-foreground">
            Chưa có API tải ảnh - hiện dùng chữ viết tắt tên.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="profile-fullname">Họ và tên</Label>
          <Input
            id="profile-fullname"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Nguyễn Văn A"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="profile-email">Email</Label>
          <Input
            id="profile-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="a@lamdong.bca"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="profile-phone">Số điện thoại</Label>
          <Input
            id="profile-phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="0901234567"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="profile-position">Chức vụ</Label>
          <Input
            id="profile-position"
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            placeholder="Đội trưởng"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="profile-username">Tên đăng nhập</Label>
          <Input id="profile-username" value={user.username} disabled />
        </div>
        <div className="space-y-2">
          <Label htmlFor="profile-department">Đơn vị</Label>
          <Input
            id="profile-department"
            value={user.departmentName ?? "Chưa gán đơn vị"}
            disabled
          />
        </div>
      </div>

      <Button onClick={submit} disabled={saving}>
        <Save className="h-4 w-4" />
        {saving ? "Đang lưu..." : "Lưu thay đổi"}
      </Button>
    </div>
  );
}
