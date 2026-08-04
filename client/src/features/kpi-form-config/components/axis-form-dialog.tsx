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
import { createAxis, updateAxis } from "@/features/kpi-form-config/api";
import type { Axis } from "@/features/kpi-form-config/types";
import { entityId } from "@/features/kpi-form-config/types";
import { getApiErrorMessage } from "@/lib/api-client";

type AxisFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  edit?: Axis | null;
  onSuccess: () => void;
};

export function AxisFormDialog({
  open,
  onOpenChange,
  edit,
  onSuccess,
}: AxisFormDialogProps) {
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
      toast.error("Vui lòng nhập tên trục.");
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
        await updateAxis(entityId(edit), payload);
        toast.success("Đã cập nhật trục.");
      } else {
        await createAxis(payload);
        toast.success("Đã thêm trục.");
      }
      onOpenChange(false);
      onSuccess();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không lưu được trục."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{edit ? "Sửa trục" : "Thêm trục"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-5 py-2">
          {edit ? (
            <div className="space-y-2">
              <Label>Mã trục</Label>
              <Input value={edit.code} readOnly disabled className="font-mono" />
              <p className="text-xs text-muted-foreground">
                Mã tự sinh - không đổi sau khi tạo.
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Mã sẽ tự sinh (TRUC-0001, TRUC-0002, …) khi lưu.
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="axis-name">
              Tên trục <span className="text-destructive">*</span>
            </Label>
            <Input
              id="axis-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="VD: Trục nghiệp vụ cốt lõi"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="axis-description">Mô tả (tuỳ chọn)</Label>
            <Textarea
              id="axis-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="axis-sort">Thứ tự hiển thị</Label>
            <Input
              id="axis-sort"
              type="number"
              min={0}
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
            />
          </div>

          <div className="flex h-9 items-center justify-between rounded-lg border px-3">
            <Label htmlFor="axis-active">Đang hoạt động</Label>
            <Switch id="axis-active" checked={isActive} onCheckedChange={setIsActive} />
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
