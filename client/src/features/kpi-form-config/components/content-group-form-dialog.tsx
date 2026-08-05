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
  createContentGroup,
  updateContentGroup,
} from "@/features/kpi-form-config/api";
import type { ContentGroup } from "@/features/kpi-form-config/types";
import { entityId } from "@/features/kpi-form-config/types";
import { getApiErrorMessage } from "@/lib/api-client";

type ContentGroupFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  edit?: ContentGroup | null;
  onSuccess: () => void;
};

export function ContentGroupFormDialog({
  open,
  onOpenChange,
  edit,
  onSuccess,
}: ContentGroupFormDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (edit) {
      setName(edit.name);
      setDescription(edit.description ?? "");
      setSortOrder(String(edit.sortOrder ?? 0));
      setIsActive(edit.isActive);
    } else {
      setName("");
      setDescription("");
      setSortOrder("0");
      setIsActive(true);
    }
  }, [open, edit]);

  const submit = async () => {
    if (!name.trim()) {
      toast.error("Vui lòng nhập tên nhóm nội dung.");
      return;
    }

    const sortOrderNum = Number(sortOrder);
    if (!Number.isFinite(sortOrderNum) || sortOrderNum < 0) {
      toast.error("Thứ tự hiển thị không hợp lệ.");
      return;
    }

    const payload = {
      name: name.trim(),
      description: description.trim(),
      sortOrder: sortOrderNum,
      isActive,
    };

    setSaving(true);
    try {
      if (edit) {
        await updateContentGroup(entityId(edit), payload);
        toast.success("Đã cập nhật nhóm nội dung.");
      } else {
        await createContentGroup(payload);
        toast.success("Đã thêm nhóm nội dung.");
      }
      onOpenChange(false);
      onSuccess();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không lưu được nhóm nội dung."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{edit ? "Sửa nhóm nội dung" : "Thêm nhóm nội dung"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-5 py-2">
          {edit ? (
            <div className="space-y-2">
              <Label>Mã nhóm</Label>
              <Input value={edit.code} readOnly disabled className="font-mono" />
              <p className="text-xs text-muted-foreground">
                Mã tự sinh - không đổi sau khi tạo.
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Mã sẽ tự sinh (NND-0001, NND-0002, …) khi lưu.
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="content-group-name">
              Tên nhóm nội dung <span className="text-destructive">*</span>
            </Label>
            <Input
              id="content-group-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="VD: Nghiệp vụ thường xuyên"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="content-group-description">Mô tả (tuỳ chọn)</Label>
            <Textarea
              id="content-group-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="content-group-sort">Thứ tự hiển thị</Label>
            <Input
              id="content-group-sort"
              type="number"
              min={0}
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
            />
          </div>

          <div className="flex h-9 items-center justify-between rounded-lg border px-3">
            <Label htmlFor="content-group-active">Đang hoạt động</Label>
            <Switch
              id="content-group-active"
              checked={isActive}
              onCheckedChange={setIsActive}
            />
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
