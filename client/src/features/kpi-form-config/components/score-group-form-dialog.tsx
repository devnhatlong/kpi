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
  createScoreGroup,
  updateScoreGroup,
} from "@/features/kpi-form-config/api";
import {
  SCORE_GROUP_SCALE_MAX,
  SCORE_GROUP_SCALE_MIN,
  formatScoreGroupRange,
} from "@/features/kpi-form-config/score-group.constants";
import type { ScoreGroup } from "@/features/kpi-form-config/types";
import { entityId } from "@/features/kpi-form-config/types";
import { getApiErrorMessage } from "@/lib/api-client";

type ScoreGroupFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  edit?: ScoreGroup | null;
  onSuccess: () => void;
};

export function ScoreGroupFormDialog({
  open,
  onOpenChange,
  edit,
  onSuccess,
}: ScoreGroupFormDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [minScore, setMinScore] = useState("0");
  const [maxScore, setMaxScore] = useState("100");
  const [maxInclusive, setMaxInclusive] = useState(true);
  const [sortOrder, setSortOrder] = useState("0");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (edit) {
      setName(edit.name);
      setDescription(edit.description ?? "");
      setMinScore(String(edit.minScore));
      setMaxScore(String(edit.maxScore));
      setMaxInclusive(edit.maxInclusive);
      setSortOrder(String(edit.sortOrder ?? 0));
      setIsActive(edit.isActive);
    } else {
      setName("");
      setDescription("");
      setMinScore("0");
      setMaxScore("100");
      setMaxInclusive(false);
      setSortOrder("0");
      setIsActive(true);
    }
  }, [open, edit]);

  const submit = async () => {
    if (!name.trim()) {
      toast.error("Vui lòng nhập tên nhóm điểm.");
      return;
    }

    const minScoreNum = Number(minScore);
    if (
      !Number.isFinite(minScoreNum) ||
      minScoreNum < SCORE_GROUP_SCALE_MIN ||
      minScoreNum > SCORE_GROUP_SCALE_MAX
    ) {
      toast.error(`Mức điểm từ phải nằm trong ${SCORE_GROUP_SCALE_MIN}..${SCORE_GROUP_SCALE_MAX}.`);
      return;
    }

    const maxScoreNum = Number(maxScore);
    if (
      !Number.isFinite(maxScoreNum) ||
      maxScoreNum < SCORE_GROUP_SCALE_MIN ||
      maxScoreNum > SCORE_GROUP_SCALE_MAX
    ) {
      toast.error(`Mức điểm đến phải nằm trong ${SCORE_GROUP_SCALE_MIN}..${SCORE_GROUP_SCALE_MAX}.`);
      return;
    }
    if (maxInclusive ? maxScoreNum < minScoreNum : maxScoreNum <= minScoreNum) {
      toast.error("Khoảng điểm không hợp lệ: điểm đến phải lớn hơn điểm từ.");
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
      minScore: minScoreNum,
      maxScore: maxScoreNum,
      maxInclusive,
      sortOrder: sortOrderNum,
      isActive,
    };

    setSaving(true);
    try {
      if (edit) {
        await updateScoreGroup(entityId(edit), payload);
        toast.success("Đã cập nhật nhóm điểm.");
      } else {
        await createScoreGroup(payload);
        toast.success("Đã thêm nhóm điểm.");
      }
      onOpenChange(false);
      onSuccess();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không lưu được nhóm điểm."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {edit ? "Sửa nhóm điểm" : "Thêm nhóm điểm"}
          </DialogTitle>
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
              Mã sẽ tự sinh (DG-0001, DG-0002, …) khi lưu.
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="score-group-name">
              Tên nhóm <span className="text-destructive">*</span>
            </Label>
            <Input
              id="score-group-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="VD: KPI tiến độ"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="score-group-min">
              Mức điểm từ <span className="text-destructive">*</span>
            </Label>
            <Input
              id="score-group-min"
              type="number"
              min={SCORE_GROUP_SCALE_MIN}
              max={SCORE_GROUP_SCALE_MAX}
              step={0.5}
              value={minScore}
              onChange={(e) => setMinScore(e.target.value)}
              disabled={saving}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="score-group-max">
              Mức điểm đến <span className="text-destructive">*</span>
            </Label>
            <Input
              id="score-group-max"
              type="number"
              min={SCORE_GROUP_SCALE_MIN}
              max={SCORE_GROUP_SCALE_MAX}
              step={0.5}
              value={maxScore}
              onChange={(e) => setMaxScore(e.target.value)}
              disabled={saving}
            />
          </div>

          <div className="flex h-9 items-center justify-between rounded-lg border px-3">
            <Label htmlFor="score-group-max-inclusive">Bao gồm mức điểm đến</Label>
            <Switch
              id="score-group-max-inclusive"
              checked={maxInclusive}
              onCheckedChange={setMaxInclusive}
              disabled={saving}
            />
          </div>

          <p className="text-xs text-muted-foreground">
            Dải điểm hiện tại:{" "}
            {formatScoreGroupRange(
              Number(minScore) || SCORE_GROUP_SCALE_MIN,
              Number(maxScore) || SCORE_GROUP_SCALE_MIN,
              maxInclusive,
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            Bạn có thể tự cấu hình dải điểm trong thang {SCORE_GROUP_SCALE_MIN} →{" "}
            {SCORE_GROUP_SCALE_MAX}.
          </p>

          <div className="space-y-2">
            <Label htmlFor="score-group-description">Mô tả (tuỳ chọn)</Label>
            <Textarea
              id="score-group-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="score-group-sort">Thứ tự hiển thị</Label>
            <Input
              id="score-group-sort"
              type="number"
              min={0}
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              disabled={saving}
            />
          </div>

          <div className="flex h-9 items-center justify-between rounded-lg border px-3">
            <Label htmlFor="score-group-active">Đang hoạt động</Label>
            <Switch
              id="score-group-active"
              checked={isActive}
              onCheckedChange={setIsActive}
              disabled={saving}
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
