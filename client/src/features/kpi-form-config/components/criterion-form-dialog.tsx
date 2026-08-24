"use client";

import { useState } from "react";
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
  createCriterion,
  updateCriterion,
} from "@/features/kpi-form-config/api";
import type { Criterion } from "@/features/kpi-form-config/types";
import { entityId } from "@/features/kpi-form-config/types";
import { getApiErrorMessage } from "@/lib/api-client";

type CriterionFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  edit?: Criterion | null;
  onSuccess: () => void;
};

export function CriterionFormDialog({
  open,
  onOpenChange,
  edit,
  onSuccess,
}: CriterionFormDialogProps) {
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [maxScore, setMaxScore] = useState("0");
  const [sortOrder, setSortOrder] = useState("0");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  /*
    Nạp dữ liệu vào form ngay trong lúc render, không qua effect: effect chạy
    sau lần vẽ đầu nên có một nhịp dialog hiện giá trị của lần mở trước.
    `loadedKey` nhớ đang nạp bản nào; đóng lại thì xoá để lần mở sau nạp lại từ
    đầu, kể cả khi mở đúng bản vừa sửa dở rồi bấm Huỷ.
  */
  const formKey = open ? (edit ? entityId(edit) : "new") : null;
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  if (formKey && formKey !== loadedKey) {
    setLoadedKey(formKey);
    setName(edit?.name ?? "");
    setNote(edit?.note ?? "");
    setMaxScore(String(edit?.maxScore ?? 0));
    setSortOrder(String(edit?.sortOrder ?? 0));
    setIsActive(edit?.isActive ?? true);
  }
  if (!formKey && loadedKey !== null) setLoadedKey(null);

  const submit = async () => {
    if (!name.trim()) {
      toast.error("Vui lòng nhập nội dung tiêu chí.");
      return;
    }

    const maxScoreNum = Number(maxScore);
    if (!Number.isFinite(maxScoreNum) || maxScoreNum < 0) {
      toast.error("Điểm tối đa không hợp lệ.");
      return;
    }

    const sortOrderNum = Number(sortOrder);
    if (!Number.isFinite(sortOrderNum) || sortOrderNum < 0) {
      toast.error("Thứ tự hiển thị không hợp lệ.");
      return;
    }

    const payload = {
      name: name.trim(),
      note: note.trim(),
      maxScore: maxScoreNum,
      sortOrder: sortOrderNum,
      isActive,
    };

    setSaving(true);
    try {
      if (edit) {
        await updateCriterion(entityId(edit), payload);
        toast.success("Đã cập nhật tiêu chí.");
      } else {
        await createCriterion(payload);
        toast.success("Đã thêm tiêu chí.");
      }
      onOpenChange(false);
      onSuccess();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không lưu được tiêu chí."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{edit ? "Sửa tiêu chí" : "Thêm tiêu chí"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-5 py-2">
          {edit ? (
            <div className="space-y-2">
              <Label>Mã tiêu chí</Label>
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
              Mã sẽ tự sinh (TC-0001, TC-0002, …) khi lưu.
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="criterion-name">
              Tiêu chí / Nội dung <span className="text-destructive">*</span>
            </Label>
            {/*
              Ô chữ nhiều dòng chứ không phải một dòng: tiêu chí trong văn bản
              thường dài cả đoạn, gõ trong ô một dòng thì không đọc lại được.
            */}
            <Textarea
              id="criterion-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              rows={4}
              placeholder="VD: Kết quả công tác xây dựng, chỉnh đốn Đảng; củng cố, xây dựng tổ chức đảng và hệ thống chính trị…"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="criterion-max-score">Điểm tối đa</Label>
            <Input
              id="criterion-max-score"
              type="number"
              min={0}
              step="0.01"
              value={maxScore}
              onChange={(e) => setMaxScore(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Cột &quot;Điểm tối đa&quot; của dòng. Dòng Tổng điểm cuối bảng là
              tổng điểm tối đa của mọi tiêu chí đang hoạt động.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="criterion-note">Ghi chú (tuỳ chọn)</Label>
            <Textarea
              id="criterion-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="VD: Đơn vị có tồn tại, hạn chế, bị phê bình… thì bị trừ điểm tại tiêu chí tương ứng"
            />
            <p className="text-xs text-muted-foreground">
              Hiện ở cột &quot;Ghi chú&quot; của bảng chấm, người chấm chỉ đọc.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="criterion-sort">Thứ tự hiển thị</Label>
            <Input
              id="criterion-sort"
              type="number"
              min={0}
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
            />
          </div>

          <div className="flex h-9 items-center justify-between rounded-lg border px-3">
            <Label htmlFor="criterion-active">Đang hoạt động</Label>
            <Switch
              id="criterion-active"
              checked={isActive}
              onCheckedChange={setIsActive}
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
            {saving ? "Đang lưu..." : "Lưu"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
