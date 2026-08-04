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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createWorkContent,
  fetchAxesAll,
  fetchContentGroupsAll,
  updateWorkContent,
} from "@/features/kpi-form-config/api";
import type { WorkContent } from "@/features/kpi-form-config/types";
import { entityId } from "@/features/kpi-form-config/types";
import { getApiErrorMessage } from "@/lib/api-client";
import useSWR from "swr";

type WorkContentFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  edit?: WorkContent | null;
  onSuccess: () => void;
};

export function WorkContentFormDialog({
  open,
  onOpenChange,
  edit,
  onSuccess,
}: WorkContentFormDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [contentGroupId, setContentGroupId] = useState("");
  const [axisId, setAxisId] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const { data: contentGroups = [] } = useSWR(
    open ? ["content-groups", "all", "for-work-content"] : null,
    fetchContentGroupsAll,
  );
  const { data: axes = [] } = useSWR(
    open ? ["axes", "all", "for-work-content"] : null,
    fetchAxesAll,
  );

  useEffect(() => {
    if (!open) return;
    if (edit) {
      setName(edit.name);
      setDescription(edit.description ?? "");
      setContentGroupId(
        typeof edit.contentGroupId === "string"
          ? edit.contentGroupId
          : edit.contentGroupId?._id ?? "",
      );
      setAxisId(
        typeof edit.axisId === "string"
          ? edit.axisId
          : edit.axisId?._id ?? "",
      );
      setSortOrder(String(edit.sortOrder ?? 0));
      setIsActive(edit.isActive);
    } else {
      setName("");
      setDescription("");
      setContentGroupId("");
      setAxisId("");
      setSortOrder("0");
      setIsActive(true);
    }
  }, [open, edit]);

  const submit = async () => {
    if (!name.trim()) {
      toast.error("Vui lòng nhập tên nội dung công việc.");
      return;
    }
    if (!contentGroupId) {
      toast.error("Vui lòng chọn nhóm nội dung.");
      return;
    }
    if (!axisId) {
      toast.error("Vui lòng chọn trục.");
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
      contentGroupId,
      axisId,
      sortOrder: sortOrderNum,
      isActive,
    };

    setSaving(true);
    try {
      if (edit) {
        await updateWorkContent(entityId(edit), payload);
        toast.success("Đã cập nhật nội dung công việc.");
      } else {
        await createWorkContent(payload);
        toast.success("Đã thêm nội dung công việc.");
      }
      onOpenChange(false);
      onSuccess();
    } catch (error) {
      toast.error(
        getApiErrorMessage(error, "Không lưu được nội dung công việc."),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {edit ? "Sửa nội dung công việc" : "Thêm nội dung công việc"}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-5 py-2">
          {edit ? (
            <div className="space-y-2">
              <Label>Mã</Label>
              <Input value={edit.code} readOnly disabled className="font-mono" />
              <p className="text-xs text-muted-foreground">
                Mã tự sinh - không đổi sau khi tạo.
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Mã sẽ tự sinh (ND-0001, ND-0002, …) khi lưu.
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="work-content-name">
              Tên nội dung công việc <span className="text-destructive">*</span>
            </Label>
            <Input
              id="work-content-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="VD: Nhiệm vụ trọng tâm ban hành kèm Chỉ thị công tác"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="work-content-description">Mô tả (tuỳ chọn)</Label>
            <Textarea
              id="work-content-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label>
              Nhóm nội dung <span className="text-destructive">*</span>
            </Label>
            <Select value={contentGroupId || undefined} onValueChange={setContentGroupId}>
              <SelectTrigger>
                <SelectValue placeholder="Chọn nhóm nội dung" />
              </SelectTrigger>
              <SelectContent>
                {contentGroups.map((group) => (
                  <SelectItem key={entityId(group)} value={entityId(group)}>
                    {group.name} ({group.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>
              Trục <span className="text-destructive">*</span>
            </Label>
            <Select value={axisId || undefined} onValueChange={setAxisId}>
              <SelectTrigger>
                <SelectValue placeholder="Chọn trục" />
              </SelectTrigger>
              <SelectContent>
                {axes.map((axis) => (
                  <SelectItem key={entityId(axis)} value={entityId(axis)}>
                    {axis.name} ({axis.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="work-content-sort">Thứ tự hiển thị</Label>
            <Input
              id="work-content-sort"
              type="number"
              min={0}
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
            />
          </div>

          <div className="flex h-9 items-center justify-between rounded-lg border px-3">
            <Label htmlFor="work-content-active">Đang hoạt động</Label>
            <Switch
              id="work-content-active"
              checked={isActive}
              onCheckedChange={setIsActive}
            />
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
