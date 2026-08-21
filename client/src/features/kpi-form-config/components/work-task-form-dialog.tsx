"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  createWorkTask,
  fetchScoreGroupsAll,
  fetchWorkContentsAll,
  updateWorkTask,
} from "@/features/kpi-form-config/api";
import type { WorkTask } from "@/features/kpi-form-config/types";
import { entityId } from "@/features/kpi-form-config/types";
import { formatScoreGroupRange } from "@/features/kpi-form-config/score-group.constants";
import { getApiErrorMessage } from "@/lib/api-client";

/** Giá trị của mục "không chọn nhóm điểm riêng" - Select không nhận value rỗng. */
const INHERIT = "__inherit__";

type WorkTaskFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  edit?: WorkTask | null;
  onSuccess: () => void;
};

export function WorkTaskFormDialog({
  open,
  onOpenChange,
  edit,
  onSuccess,
}: WorkTaskFormDialogProps) {
  const [name, setName] = useState("");
  const [workContentId, setWorkContentId] = useState("");
  const [scoreGroupId, setScoreGroupId] = useState(INHERIT);
  const [note, setNote] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const { data: contents = [] } = useSWR(
    open ? ["work-contents", "all", "for-work-task"] : null,
    fetchWorkContentsAll,
  );
  const { data: scoreGroups = [] } = useSWR(
    open ? ["score-groups", "all", "for-work-task"] : null,
    fetchScoreGroupsAll,
  );

  useEffect(() => {
    if (!open) return;
    if (edit) {
      setName(edit.name);
      setWorkContentId(
        typeof edit.workContentId === "string"
          ? edit.workContentId
          : (edit.workContentId?._id ?? ""),
      );
      setScoreGroupId(
        typeof edit.scoreGroupId === "string"
          ? edit.scoreGroupId
          : (edit.scoreGroupId?._id ?? INHERIT),
      );
      setNote(edit.note ?? "");
      setSortOrder(String(edit.sortOrder ?? 0));
      setIsActive(edit.isActive);
    } else {
      setName("");
      setWorkContentId("");
      setScoreGroupId(INHERIT);
      setNote("");
      setSortOrder("0");
      setIsActive(true);
    }
  }, [open, edit]);

  const submit = async () => {
    if (!name.trim()) {
      toast.error("Vui lòng nhập nội dung nhiệm vụ.");
      return;
    }
    if (!workContentId) {
      toast.error("Vui lòng chọn nội dung công việc.");
      return;
    }

    const sortOrderNum = Number(sortOrder);
    if (!Number.isFinite(sortOrderNum) || sortOrderNum < 0) {
      toast.error("Thứ tự hiển thị không hợp lệ.");
      return;
    }

    const payload = {
      name: name.trim(),
      workContentId,
      // null = kế thừa nhóm điểm của nội dung công việc.
      scoreGroupId: scoreGroupId === INHERIT ? null : scoreGroupId,
      note: note.trim(),
      sortOrder: sortOrderNum,
      isActive,
    };

    setSaving(true);
    try {
      if (edit) {
        await updateWorkTask(entityId(edit), payload);
        toast.success("Đã cập nhật nhiệm vụ.");
      } else {
        await createWorkTask(payload);
        toast.success("Đã thêm nhiệm vụ.");
      }
      onOpenChange(false);
      onSuccess();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không lưu được nhiệm vụ."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{edit ? "Sửa nhiệm vụ" : "Thêm nhiệm vụ"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-5 py-2">
          {edit ? (
            <div className="space-y-2">
              <Label>Mã</Label>
              <Input
                value={edit.code}
                readOnly
                disabled
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Mã tự sinh - không đổi sau khi tạo.
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Mã sẽ tự sinh (NV-0001, NV-0002, …) khi lưu.
            </p>
          )}

          <div className="space-y-2">
            <Label>
              Nội dung công việc <span className="text-destructive">*</span>
            </Label>
            <Select
              value={workContentId || undefined}
              onValueChange={setWorkContentId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Chọn nội dung công việc" />
              </SelectTrigger>
              <SelectContent>
                {contents.map((content) => (
                  <SelectItem key={entityId(content)} value={entityId(content)}>
                    {content.name} ({content.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Cán bộ chọn nội dung công việc trước, dropdown nhiệm vụ chỉ hiện
              nhiệm vụ của đúng nội dung đó.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="work-task-name">
              Nội dung nhiệm vụ <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="work-task-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              rows={4}
              placeholder="Chép nguyên văn nhiệm vụ trong bảng KPI"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label>Điểm chuẩn riêng</Label>
            <Select value={scoreGroupId} onValueChange={setScoreGroupId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={INHERIT}>
                  Theo nội dung công việc
                </SelectItem>
                {scoreGroups.map((group) => (
                  <SelectItem key={entityId(group)} value={entityId(group)}>
                    {group.name} (
                    {formatScoreGroupRange(
                      group.minScore,
                      group.maxScore,
                      group.maxInclusive,
                    )}
                    )
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Chọn khi nhiệm vụ có mức điểm riêng theo cấp ghi nhận (Bộ Công an
              03 điểm, Công an tỉnh 01-02 điểm…).
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="work-task-note">Ghi chú riêng</Label>
            <Textarea
              id="work-task-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Để trống thì lấy ghi chú của nội dung công việc"
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="work-task-order">Thứ tự hiển thị</Label>
              <Input
                id="work-task-order"
                type="number"
                min={0}
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="work-task-active">Trạng thái</Label>
              <div className="flex h-9 items-center gap-2">
                <Switch
                  id="work-task-active"
                  checked={isActive}
                  onCheckedChange={setIsActive}
                />
                <span className="text-sm text-muted-foreground">
                  {isActive ? "Hoạt động" : "Ngừng"}
                </span>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Huỷ
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={saving}>
            {saving ? "Đang lưu..." : "Lưu"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
