"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";

import { SearchableSelect } from "@/components/common/searchable-select";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  assignmentKeys,
  delegateAssignment,
  fetchAssignmentTargets,
} from "@/features/mission-assignment/api";
import type {
  HolderType,
  MissionAssignment,
} from "@/features/mission-assignment/types";
import { getApiErrorMessage } from "@/lib/api-client";

type DelegateDialogProps = {
  item: MissionAssignment | null;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
};

export function DelegateDialog({
  item,
  onOpenChange,
  onDone,
}: DelegateDialogProps) {
  const open = !!item;
  const [targetType, setTargetType] = useState<HolderType>("DEPARTMENT");
  const [targetId, setTargetId] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  // Phạm vi giao lấy theo vai trò của người đang giao tiếp, không theo nhiệm vụ.
  const { data: targets, isLoading } = useSWR(
    open ? assignmentKeys.targets() : null,
    fetchAssignmentTargets,
  );

  useEffect(() => {
    if (!open) return;
    setTargetType("DEPARTMENT");
    setTargetId("");
    setNote("");
  }, [open]);

  useEffect(() => {
    setTargetId("");
  }, [targetType]);

  // targets trả cả cây để dựng UI dạng thư mục; ở đây chỉ lấy nơi giao thẳng được.
  const options =
    targetType === "DEPARTMENT"
      ? (targets?.departments ?? [])
          .filter((dept) => dept.canReceive)
          .map((dept) => ({
            value: dept._id,
            label: dept.name,
            keywords: dept.code,
          }))
      : (targets?.users ?? [])
          .filter((user) => user.canReceive)
          .map((user) => ({
            value: user._id,
            label: user.fullName || user.username,
            keywords: user.username,
          }));

  const submit = async () => {
    if (!item) return;
    if (!targetId) {
      toast.error("Vui lòng chọn nơi nhận.");
      return;
    }
    setSaving(true);
    try {
      await delegateAssignment(item._id, {
        targetType,
        ...(targetType === "DEPARTMENT"
          ? { targetDepartmentId: targetId }
          : { targetUserId: targetId }),
        note: note.trim() || undefined,
      });
      toast.success("Đã giao tiếp nhiệm vụ xuống.");
      onOpenChange(false);
      onDone();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không giao tiếp được nhiệm vụ."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Giao tiếp nhiệm vụ xuống</DialogTitle>
          <DialogDescription className="line-clamp-2">
            {item?.title}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <Tabs
            value={targetType}
            onValueChange={(value) => setTargetType(value as HolderType)}
          >
            <TabsList className="w-full">
              <TabsTrigger value="DEPARTMENT" className="flex-1">
                Đơn vị cấp dưới
              </TabsTrigger>
              <TabsTrigger value="USER" className="flex-1">
                Cán bộ
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="space-y-2">
            <Label>
              Nơi nhận <span className="text-destructive">*</span>
            </Label>
            <SearchableSelect
              value={targetId}
              onValueChange={setTargetId}
              disabled={isLoading}
              placeholder={isLoading ? "Đang tải..." : "Chọn nơi nhận"}
              searchPlaceholder="Tìm..."
              emptyText={
                targetType === "DEPARTMENT"
                  ? "Không có đơn vị cấp dưới nào."
                  : "Không có cán bộ nào."
              }
              className="z-[100]"
              options={options}
            />
            <p className="text-xs text-muted-foreground">
              Danh sách chỉ hiện nơi nhận thuộc phạm vi vai trò của bạn.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="delegate-note">Ghi chú</Label>
            <Textarea
              id="delegate-note"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Yêu cầu cụ thể cho nơi nhận..."
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
            {saving ? "Đang giao..." : "Giao xuống"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
